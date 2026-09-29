import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { CategoriesStore } from '../../categories.store';
import { ServiceCatalogStore } from '../../service-catalog.store';
import { CatalogFilter, CatalogService, ServicePricing } from '../../service-catalog.models';
import { CATALOG_PIPES, formatCountries } from '../../service-catalog.pipes';
import { coverageLabel } from '../../components/pricing-editor/coverage';
import { ServiceFormComponent } from '../../components/service-form/service-form.component';
import { PricingDialogComponent } from '../../components/pricing-dialog/pricing-dialog.component';
import { SectionIconComponent } from '../../components/section-icon/section-icon.component';

type StatusFilter = 'all' | 'active' | 'inactive';
const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SEARCH_DEBOUNCE_MS = 350;
/** How many pricing rows a card previews before "show all". */
const PRICING_PREVIEW = 3;

/** Page number bound to the filter it was chosen under — any filter change starts back at page 1. */
interface PageState {
  filterKey: string;
  index: number;
}

const filterKey = (f: CatalogFilter) => JSON.stringify(f);

/**
 * Service catalog, fully server-driven: name, section, governorate and
 * status are page filters (mirrored in the URL so views can be linked and
 * survive reloads); the country is the header's global scope. Every filter
 * and the page go to the API as query params.
 */
@Component({
  selector: 'app-services-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    KpiCardComponent,
    PaginationComponent,
    CountryFlagComponent,
    ServiceFormComponent,
    PricingDialogComponent,
    SectionIconComponent,
    ...FORMAT_PIPES,
    ...CATALOG_PIPES,
  ],
  templateUrl: './services-page.component.html',
  styleUrl: './services-page.component.scss',
})
export class ServicesPageComponent {
  private readonly store = inject(ServiceCatalogStore);
  private readonly sectionsStore = inject(CategoriesStore);
  private readonly countries = inject(CountriesStore);
  protected readonly scope = inject(CountryScopeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly previewCount = PRICING_PREVIEW;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  protected readonly items = this.store.all;
  protected readonly pageMeta = this.store.page;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly scopedCountry = this.scope.country;

  // ── filters — seeded from the URL ──
  private readonly params = this.route.snapshot.queryParamMap;
  protected readonly search = signal(this.params.get('q') ?? '');
  protected readonly sectionId = signal<string | null>(this.params.get('section'));
  protected readonly governorateId = signal<string | null>(this.params.get('gov'));
  protected readonly statusFilter = signal<StatusFilter>(this.parseStatus(this.params.get('status')));
  protected readonly pageSize = signal<number>(this.parsePageSize(this.params.get('size')));

  /** The typed text, settled — so the API isn't hit on every keystroke. */
  private readonly name = toSignal(
    toObservable(this.search).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      map((q) => q.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: this.search().trim() },
  );

  /** Everything the API filters by. The country is the header's global scope. */
  private readonly filter = computed<CatalogFilter>(() => {
    const status = this.statusFilter();
    return {
      name: this.name(),
      sectionId: this.sectionId(),
      countryId: this.scope.isAll() ? null : this.scope.selected(),
      governorateId: this.scope.isAll() ? null : this.governorateId(),
      active: status === 'all' ? null : status === 'active',
    };
  });

  private readonly pageState = signal<PageState>({
    filterKey: filterKey(this.filter()),
    index: Math.max(1, Number(this.params.get('page')) || 1),
  });
  protected readonly pageIndex = computed(() => {
    const s = this.pageState();
    return s.filterKey === filterKey(this.filter()) ? s.index : 1;
  });

  /** Section filter options — only those offered in the scoped country (plus the current pick). */
  protected readonly sections = computed(() => {
    const all = this.sectionsStore.all();
    if (this.scope.isAll()) return all;
    const countryId = this.scope.selected();
    const picked = this.sectionId();
    return all.filter((s) => s.id === picked || s.countries.some((c) => c.id === countryId));
  });

  /** Governorate filter options — the scoped country's divisions. */
  protected readonly governorates = computed(() => this.scopedCountry()?.governorates ?? []);
  protected readonly divisionPlural = computed(() => this.scopedCountry()?.division.plural ?? 'المحافظات');

  protected readonly statusTabs = [
    { id: 'all' as const, label: 'الكل' },
    { id: 'active' as const, label: 'مفعّلة' },
    { id: 'inactive' as const, label: 'موقوفة' },
  ];

  /** The total comes from the server count; the rest describe the current page. */
  protected readonly kpis = computed(() => {
    const list = this.items();
    const active = list.filter((s) => s.active).length;
    return {
      total: this.pageMeta().count,
      active,
      inactive: list.length - active,
      unpriced: list.filter((s) => !s.pricings.length).length,
    };
  });

  protected readonly hasFilters = computed(
    () =>
      !!this.search().trim() || !!this.sectionId() || !!this.governorateId() || this.statusFilter() !== 'all' || !this.scope.isAll(),
  );

  // ── dialogs ──
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CatalogService | null>(null);
  protected readonly pricingOpen = signal(false);
  protected readonly pricingServiceId = signal<string | null>(null);
  protected readonly pricingStartAdding = signal(false);

  /** Ids with an in-flight toggle or delete. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // Filters (incl. the header country switcher) or the page changed → ask the server.
    effect(
      () => {
        const filter = this.filter();
        const page = { pageIndex: this.pageIndex(), pageSize: this.pageSize() };
        untracked(() => this.store.query(filter, page));
      },
      { allowSignalWrites: true },
    );

    // Mirror filters + paging into the URL without adding history entries.
    effect(() => {
      const status = this.statusFilter();
      const page = this.pageIndex();
      const size = this.pageSize();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          q: this.name() || null,
          section: this.sectionId(),
          gov: this.governorateId(),
          status: status === 'all' ? null : status,
          page: page > 1 ? page : null,
          size: size !== PAGE_SIZE_OPTIONS[0] ? size : null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    // Keep stale picks from locking the list on nothing:
    // a deleted section, or a governorate that isn't in the newly scoped country.
    effect(
      () => {
        const sectionId = this.sectionId();
        if (sectionId && this.sectionsStore.loaded() && !this.sectionsStore.byId(sectionId)) this.sectionId.set(null);
        const govId = this.governorateId();
        const country = this.scopedCountry();
        if (govId && this.countries.loaded() && !country?.governorates.some((g) => g.id === govId)) this.governorateId.set(null);
      },
      { allowSignalWrites: true },
    );
  }

  // ── view helpers ──

  protected sectionIconUrl(s: CatalogService): string | null {
    return this.sectionsStore.byId(s.sectionId)?.iconUrl ?? null;
  }

  /** Pricing rows a card shows: only the scoped country's (and governorate's) when filtered. */
  protected pricingsFor(s: CatalogService): ServicePricing[] {
    if (this.scope.isAll()) return s.pricings;
    const countryId = this.scope.selected();
    const govId = this.governorateId();
    return s.pricings.filter((p) => p.countryId === countryId && (!govId || p.governorates.some((g) => g.id === govId)));
  }

  protected countriesLabel(s: CatalogService): string {
    return formatCountries(new Set(s.pricings.map((p) => p.countryId)).size);
  }

  protected coverageOf(p: ServicePricing): string {
    return coverageLabel(p.governorates.length, this.countries.byId(p.countryId));
  }

  protected governorateNames(p: ServicePricing): string {
    return p.governorates.map((g) => g.name).join('، ');
  }

  // ── filters & paging ──

  protected setSection(value: string): void {
    this.sectionId.set(value || null);
  }

  protected setGovernorate(value: string): void {
    this.governorateId.set(value || null);
  }

  protected goToPage(index: number): void {
    this.pageState.set({ filterKey: filterKey(this.filter()), index });
    this.scrollToList();
  }

  protected changePageSize(size: number): void {
    // Keep the first visible row on screen after resizing.
    const firstRow = (this.pageIndex() - 1) * this.pageSize();
    this.pageSize.set(size);
    this.pageState.set({ filterKey: filterKey(this.filter()), index: Math.floor(firstRow / size) + 1 });
  }

  protected showAllCountries(): void {
    this.scope.select(ALL_COUNTRIES);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.sectionId.set(null);
    this.governorateId.set(null);
    this.statusFilter.set('all');
    this.scope.select(ALL_COUNTRIES);
  }

  protected reload(): void {
    this.store.reload();
  }

  // ── actions ──

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(s: CatalogService): void {
    this.editing.set(s);
    this.formOpen.set(true);
  }

  protected openPricing(s: CatalogService, startAdding = false): void {
    this.pricingServiceId.set(s.id);
    this.pricingStartAdding.set(startAdding);
    this.pricingOpen.set(true);
  }

  /** From the edit form's "manage prices" shortcut. */
  protected switchToPricing(s: CatalogService): void {
    this.formOpen.set(false);
    this.openPricing(s);
  }

  protected toggleActive(s: CatalogService): void {
    if (this.busy().has(s.id)) return;
    const next = !s.active;
    this.setBusy(s.id, true);
    this.store
      .setActive(s.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setBusy(s.id, false);
          if (next) this.toast.success(`تم تفعيل "${s.name}"`);
          else this.toast.warning(`تم إيقاف "${s.name}" وإخفاؤها من التطبيق`);
        },
        error: (err: ApiError) => {
          this.setBusy(s.id, false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر تغيير حالة الخدمة'), { title: `"${s.name}"` });
        },
      });
  }

  protected async remove(s: CatalogService): Promise<void> {
    if (this.busy().has(s.id)) return;
    const ok = await this.dialog.confirm({
      title: 'حذف الخدمة',
      message: s.pricings.length
        ? `سيتم حذف "${s.name}" نهائيًا مع أسعارها (${this.countriesLabel(s)}). لا يمكن التراجع عن هذا الإجراء.`
        : `سيتم حذف "${s.name}" نهائيًا. لا يمكن التراجع عن هذا الإجراء.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;

    this.setBusy(s.id, true);
    this.store
      .remove(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setBusy(s.id, false);
          this.toast.success(`تم حذف "${s.name}"`);
        },
        error: (err: ApiError) => {
          this.setBusy(s.id, false);
          const message =
            err?.status === 409
              ? 'الخدمة مرتبطة بحجوزات أو بيانات أخرى. أوقفها بدلًا من حذفها لإخفائها من التطبيق.'
              : apiErrorToMessage(err, 'حدث خطأ أثناء الحذف، حاول مرة أخرى.');
          this.toast.error(message, { title: `تعذّر حذف "${s.name}"` });
        },
      });
  }

  // ── internals ──

  private parseStatus(value: string | null): StatusFilter {
    return STATUS_VALUES.includes(value as StatusFilter) ? (value as StatusFilter) : 'all';
  }

  private parsePageSize(value: string | null): number {
    const n = Number(value);
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : PAGE_SIZE_OPTIONS[0];
  }

  private scrollToList(): void {
    queueMicrotask(() => document.querySelector('.svc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  private setBusy(id: string, on: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
