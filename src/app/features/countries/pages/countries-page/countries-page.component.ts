import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { PeopleStore } from '../../../people/people.store';
import { ServiceCatalogApi } from '../../../services/service-catalog.api';
import { NO_FILTER } from '../../../services/service-catalog.models';
import { BookingsStore } from '../../../bookings/bookings.store';
import { PackagesStore } from '../../../packages/packages.store';
import { CountryFormComponent } from '../../components/country-form/country-form.component';
import { GovernoratesDialogComponent } from '../../components/governorates-dialog/governorates-dialog.component';
import { CountryFlagComponent } from '../../country-flag.component';
import { CountriesStore } from '../../countries.store';
import { CountryScopeService } from '../../country-scope.service';
import { Country } from '../../countries.models';
import { countDivisions } from '../../country-registry';
import { DivisionCountPipe } from '../../country.pipes';

/** How many governorate names a card previews before "+N". */
const PREVIEW_COUNT = 6;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

@Component({
  selector: 'app-countries-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    KpiCardComponent,
    PaginationComponent,
    CountryFormComponent,
    GovernoratesDialogComponent,
    CountryFlagComponent,
    DivisionCountPipe,
    ...FORMAT_PIPES,
  ],
  templateUrl: './countries-page.component.html',
  styleUrl: './countries-page.component.scss',
})
export class CountriesPageComponent {
  private readonly store = inject(CountriesStore);
  private readonly people = inject(PeopleStore);
  private readonly catalogApi = inject(ServiceCatalogApi);
  private readonly scope = inject(CountryScopeService);
  private readonly router = inject(Router);
  private readonly bookings = inject(BookingsStore);
  private readonly packages = inject(PackagesStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly previewCount = PREVIEW_COUNT;
  protected readonly skeletons = [0, 1, 2, 3];

  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly hasCountries = computed(() => this.store.all().length > 0);

  // ── dialogs ──
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Country | null>(null);
  protected readonly govOpen = signal(false);
  protected readonly govCountryId = signal<string | null>(null);
  protected readonly govStartAdding = signal(false);

  // ── list state ──
  protected readonly query = signal('');
  protected readonly deleting = signal<ReadonlySet<string>>(new Set());
  protected readonly refreshing = signal(false);

  // ── paging (client-side: the store holds the whole catalog, so search spans every country) ──
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly pageSize = signal<number>(PAGE_SIZE_OPTIONS[0]);
  private readonly requestedPage = signal(1);

  /**
   * Active services priced in each country (real catalog). `null` while
   * loading or if the request failed — the card then shows "—" and no warning.
   */
  private readonly activeServicesByCountry = toSignal(
    this.catalogApi.listAll({ ...NO_FILTER, active: true }).pipe(
      map((list) => {
        const counts = new Map<string, number>();
        for (const s of list) {
          for (const id of new Set(s.pricings.map((p) => p.countryId))) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return counts;
      }),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );

  private readonly rows = computed(() =>
    this.store.all().map((c) => {
      const inCountry = <T extends { countryId: string }>(list: T[]) => list.filter((x) => x.countryId === c.id);
      return {
        country: c,
        customers: inCountry(this.people.list('customers')()).length,
        technicians: inCountry(this.people.list('technicians')()).length,
        drivers: inCountry(this.people.list('drivers')()).length,
        services: this.activeServicesByCountry()?.get(c.id) ?? (this.activeServicesByCountry() ? 0 : null),
        packages: inCountry(this.packages.all()).filter((p) => p.active).length,
        bookings: inCountry(this.bookings.all()).length,
      };
    }),
  );

  protected readonly visibleRows = computed(() => {
    const q = foldText(this.query());
    if (!q) return this.rows();
    return this.rows().filter(({ country: c }) =>
      [c.name, c.nameEn, c.currency].some((v) => foldText(v).includes(q)),
    );
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.visibleRows().length / this.pageSize())));
  /** Clamped, so deleting the last card of the last page (or narrowing a search) never lands on an empty page. */
  protected readonly page = computed(() => Math.min(this.requestedPage(), this.totalPages()));
  protected readonly pagedRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.visibleRows().slice(start, start + this.pageSize());
  });
  protected readonly isLastPage = computed(() => this.page() === this.totalPages());

  protected readonly kpis = computed(() => {
    const all = this.store.all();
    return {
      total: all.length,
      live: this.rows().filter((r) => (r.services ?? 0) > 0).length,
      divisions: all.reduce((a, c) => a + c.governorates.length, 0),
      currencies: new Set(all.map((c) => c.currency).filter(Boolean)).size,
    };
  });

  constructor() {
    // A new search starts from the first page.
    effect(
      () => {
        this.query();
        untracked(() => this.requestedPage.set(1));
      },
      { allowSignalWrites: true },
    );
  }

  // ── paging ──

  protected goToPage(page: number): void {
    this.requestedPage.set(page);
    this.scrollToList();
  }

  protected changePageSize(size: number): void {
    // Keep the first visible country on screen after resizing.
    const firstIndex = (this.page() - 1) * this.pageSize();
    this.pageSize.set(size);
    this.requestedPage.set(Math.floor(firstIndex / size) + 1);
  }

  private scrollToList(): void {
    queueMicrotask(() =>
      this.host.nativeElement.querySelector('.list-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  // ── actions ──

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(c: Country): void {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  protected openGovernorates(c: Country, startAdding = false): void {
    this.govCountryId.set(c.id);
    this.govStartAdding.set(startAdding);
    this.govOpen.set(true);
  }

  /** From the edit form's "manage governorates" shortcut. */
  protected switchToGovernorates(c: Country): void {
    this.formOpen.set(false);
    this.openGovernorates(c);
  }

  /** Opens the services page scoped to this country through the header's global filter. */
  protected viewServices(c: Country): void {
    this.scope.select(c.id);
    this.router.navigate(['/services']);
  }

  protected retry(): void {
    this.store.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  protected refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.store
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshing.set(false);
          this.toast.success('تم تحديث قائمة الدول');
        },
        error: () => this.refreshing.set(false),
      });
  }

  protected async remove(c: Country): Promise<void> {
    if (this.deleting().has(c.id)) return;
    const linked = c.governorates.length;
    const ok = await this.dialog.confirm({
      title: `حذف ${c.name}`,
      message: linked
        ? `سيتم حذف ${c.name} نهائيًا. لن يكتمل الحذف طالما ترتبط بها ${countDivisions(linked, c.division)} أو خدمات أو حسابات مسجّلة.`
        : `سيتم حذف ${c.name} نهائيًا من قائمة الدول، ولا يمكن التراجع عن هذا الإجراء.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;

    this.setDeleting(c.id, true);
    this.store
      .remove(c.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setDeleting(c.id, false);
          this.toast.success(`تم حذف ${c.name}`);
        },
        error: (err: ApiError) => {
          this.setDeleting(c.id, false);
          this.toast.error(this.deleteErrorMessage(c, err), { title: `تعذّر حذف ${c.name}` });
        },
      });
  }

  private deleteErrorMessage(c: Country, err: ApiError): string {
    if (err?.status !== 409) return apiErrorToMessage(err, 'حدث خطأ أثناء الحذف، حاول مرة أخرى.');
    const linked = c.governorates.length;
    return linked
      ? `الدولة مرتبطة بـ ${countDivisions(linked, c.division)} وربما خدمات أو حسابات. يجب إزالة هذه البيانات أولًا.`
      : 'الدولة مرتبطة بسجلات أخرى (خدمات أو حسابات أو حجوزات). يجب إزالة هذه البيانات أولًا.';
  }

  private setDeleting(id: string, on: boolean): void {
    this.deleting.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
