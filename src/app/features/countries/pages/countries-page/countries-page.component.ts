import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { foldText } from '../../../../shared/utils/text-normalize.util';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { PeopleStore } from '../../../people/people.store';
import { ServicesStore } from '../../../services/services.store';
import { BookingsStore } from '../../../bookings/bookings.store';
import { PackagesStore } from '../../../packages/packages.store';
import { CountryFormComponent } from '../../components/country-form/country-form.component';
import { GovernoratesDialogComponent } from '../../components/governorates-dialog/governorates-dialog.component';
import { CountryFlagComponent } from '../../country-flag.component';
import { CountriesStore } from '../../countries.store';
import { Country } from '../../countries.models';
import { countDivisions } from '../../country-registry';
import { DivisionCountPipe } from '../../country.pipes';

/** How many governorate names a card previews before "+N". */
const PREVIEW_COUNT = 6;

@Component({
  selector: 'app-countries-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    KpiCardComponent,
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
  private readonly services = inject(ServicesStore);
  private readonly bookings = inject(BookingsStore);
  private readonly packages = inject(PackagesStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

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

  private readonly rows = computed(() =>
    this.store.all().map((c) => {
      const inCountry = <T extends { countryId: string }>(list: T[]) => list.filter((x) => x.countryId === c.id);
      return {
        country: c,
        customers: inCountry(this.people.list('customers')()).length,
        technicians: inCountry(this.people.list('technicians')()).length,
        drivers: inCountry(this.people.list('drivers')()).length,
        services: inCountry(this.services.all()).filter((s) => s.active).length,
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

  protected readonly kpis = computed(() => {
    const all = this.store.all();
    return {
      total: all.length,
      live: this.rows().filter((r) => r.services > 0).length,
      divisions: all.reduce((a, c) => a + c.governorates.length, 0),
      currencies: new Set(all.map((c) => c.currency).filter(Boolean)).size,
    };
  });

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
