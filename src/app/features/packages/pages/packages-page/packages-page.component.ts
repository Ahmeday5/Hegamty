import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { PreviewNoticeComponent } from '../../../../shared/components/dev-status/preview-notice.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { PeopleStore } from '../../../people/people.store';
import { ALL_COUNTRIES, CountryScopeService } from '../../../countries/country-scope.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { PackageFormComponent } from '../../components/package-form/package-form.component';
import { PackagesStore } from '../../packages.store';
import { DemoSubscriptionsStore } from '../../demo-subscriptions.store';
import {
  PACKAGE_STATUS_FILTER,
  PackageFilter,
  PackageStatusFilter,
  QUARTERS,
  SUB_STATE_META,
  SubscriptionState,
  TechPackage,
  durationMeta,
} from '../../packages.models';

type SubFilter = 'all' | SubscriptionState;

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZES = [12, 24, 48] as const;
const SUBS_PAGE_SIZE = 10;
const STATUS_TABS = Object.keys(PACKAGE_STATUS_FILTER) as PackageStatusFilter[];

/**
 * Technician packages, server-driven: search, status and the header's
 * country go to `/admin/packages` with paging. Below, the subscriptions
 * table is demo data until its endpoint exists (labelled as such).
 */
@Component({
  selector: 'app-packages-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    PaginationComponent,
    DevBadgeComponent,
    PreviewNoticeComponent,
    PackageFormComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
  ],
  templateUrl: './packages-page.component.html',
  styleUrl: './packages-page.component.scss',
})
export class PackagesPageComponent {
  private readonly store = inject(PackagesStore);
  private readonly demo = inject(DemoSubscriptionsStore);
  private readonly people = inject(PeopleStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly scope = inject(CountryScopeService);

  protected readonly quarters = QUARTERS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly subMeta = SUB_STATE_META;
  protected readonly skeletons = [0, 1, 2, 3];

  // ── Catalog (API) ──
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly pageMeta = this.store.page;
  protected readonly busy = this.store.busy.ids;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<PackageStatusFilter>('all');
  protected readonly pageSize = signal<number>(PAGE_SIZES[0]);
  private readonly term = toSignal(
    toObservable(this.search).pipe(
      map((v) => v.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly filter = computed<PackageFilter>(() => ({
    name: this.term() || null,
    countryId: this.scope.country()?.id ?? null,
    active: PACKAGE_STATUS_FILTER[this.statusFilter()].active,
  }));
  /** The page number belongs to one filter — any filter change starts again from page 1. */
  private readonly pageState = signal({ key: '', index: 1 });
  private readonly filterKey = computed(() => `${JSON.stringify(this.filter())}|${this.pageSize()}`);
  protected readonly pageIndex = computed(() => (this.pageState().key === this.filterKey() ? this.pageState().index : 1));

  protected readonly hasFilters = computed(() => !!this.search().trim() || this.statusFilter() !== 'all');
  /** Skeleton only on a cold load; later queries keep the stale cards (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.store.items().length);

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return STATUS_TABS.map((id) => ({ id, label: PACKAGE_STATUS_FILTER[id].label, count: c?.[id] }));
  });

  protected readonly kpis = computed(() => {
    const c = this.store.counts();
    return { all: c?.all ?? 0, active: c?.active ?? 0, inactive: c?.inactive ?? 0 };
  });

  protected readonly packages = computed(() => {
    const list = this.store.items();
    // Savings are measured against the dearest per-month rate in the same market.
    const base = new Map<string, number>();
    const monthlyOf = (p: TechPackage) => p.price / durationMeta(p.durationDays).months;
    for (const p of list) base.set(p.countryId, Math.max(base.get(p.countryId) ?? 0, monthlyOf(p)));
    return list.map((p) => {
      const monthly = monthlyOf(p);
      return {
        pkg: p,
        meta: durationMeta(p.durationDays),
        monthly: Math.round(monthly),
        saving: Math.round((1 - monthly / (base.get(p.countryId) || monthly)) * 100),
      };
    });
  });

  // ── Form ──
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TechPackage | null>(null);

  // ── Subscriptions (demo) ──
  protected readonly subFilter = signal<SubFilter>('all');
  protected readonly subSearch = signal('');
  protected readonly subPage = signal(1);
  protected readonly subPageSize = SUBS_PAGE_SIZE;

  /** Latest subscription per technician in scope, joined with names. */
  private readonly subRows = computed(() => {
    const techs = new Map(this.people.list('technicians')().map((t) => [t.id, t]));
    return this.scope
      .filter(this.demo.subscriptions())
      .filter((s) => techs.has(s.technicianId) && this.demo.latestFor(s.technicianId)?.id === s.id)
      .map((s) => {
        const pkg = this.demo.byId(s.packageId);
        const left = this.demo.daysLeft(s);
        return {
          sub: s,
          tech: techs.get(s.technicianId)!,
          pkg,
          state: this.demo.stateOf(s) as SubscriptionState,
          left,
          pct: pkg ? Math.max(0, Math.min(100, Math.round((left / pkg.durationDays) * 100))) : 0,
        };
      })
      .sort((a, b) => a.left - b.left);
  });

  protected readonly subTabs = computed(() => {
    const rows = this.subRows();
    return [
      { id: 'all' as SubFilter, label: 'الكل', count: rows.length },
      ...(['active', 'expiring', 'expired'] as SubscriptionState[]).map((s) => ({
        id: s as SubFilter,
        label: SUB_STATE_META[s].label,
        count: rows.filter((r) => r.state === s).length,
      })),
    ];
  });

  protected readonly subFiltered = computed(() => {
    const f = this.subFilter();
    const term = this.subSearch().trim().toLowerCase();
    return this.subRows()
      .filter((r) => f === 'all' || r.state === f)
      .filter((r) => !term || r.tech.name.toLowerCase().includes(term) || r.tech.phone.includes(term) || (r.pkg?.name ?? '').includes(term));
  });
  protected readonly subTotalPages = computed(() => Math.max(1, Math.ceil(this.subFiltered().length / SUBS_PAGE_SIZE)));
  protected readonly subPageRows = computed(() =>
    this.subFiltered().slice((this.subPage() - 1) * SUBS_PAGE_SIZE, this.subPage() * SUBS_PAGE_SIZE),
  );

  constructor() {
    this.store.expireCounts();
    effect(
      () => {
        const filter = this.filter();
        const page = { pageIndex: this.pageIndex(), pageSize: this.pageSize() };
        untracked(() => this.store.query(filter, page));
      },
      { allowSignalWrites: true },
    );
  }

  // ── Catalog actions ──

  protected reload(): void {
    this.store.reload();
  }

  protected setStatus(f: PackageStatusFilter): void {
    this.statusFilter.set(f);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  protected goToPage(index: number): void {
    this.pageState.set({ key: this.filterKey(), index });
    queueMicrotask(() => document.querySelector('.pk-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
  }

  protected showAllCountries(): void {
    this.scope.select(ALL_COUNTRIES);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(p: TechPackage): void {
    this.editing.set(p);
    this.formOpen.set(true);
  }

  protected toggleActive(p: TechPackage): void {
    if (this.busy().has(p.id)) return;
    const next = !p.active;
    this.store
      .setActive(p, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (next) this.toast.success(`تم تفعيل "${p.name}" وأصبحت متاحة للفنيين`);
          else this.toast.warning(`تم إيقاف "${p.name}" — الاشتراكات الحالية تستمر حتى نهايتها`);
        },
        error: (err: ApiError) => this.toast.error(apiErrorToMessage(err, 'تعذّر تغيير حالة الباقة'), { title: `"${p.name}"` }),
      });
  }

  protected async remove(p: TechPackage): Promise<void> {
    if (this.busy().has(p.id)) return;
    const ok = await this.dialog.confirm({
      title: 'حذف الباقة',
      message: `سيتم حذف "${p.name}" نهائيًا ولا يمكن التراجع. إن كان لها مشتركون فالأفضل إيقافها بدلًا من حذفها.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;

    this.store
      .remove(p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success(`تم حذف "${p.name}"`),
        error: (err: ApiError) => {
          const message =
            err?.status === 409
              ? 'الباقة مرتبطة باشتراكات فنيين. أوقفها بدلًا من حذفها حتى تنتهي الاشتراكات الحالية.'
              : apiErrorToMessage(err, 'حدث خطأ أثناء الحذف، حاول مرة أخرى.');
          this.toast.error(message, { title: `تعذّر حذف "${p.name}"` });
        },
      });
  }

  // ── Subscriptions (demo) ──

  protected setSubFilter(f: SubFilter): void {
    this.subFilter.set(f);
    this.subPage.set(1);
  }

  protected onSubSearch(v: string): void {
    this.subSearch.set(v);
    this.subPage.set(1);
  }

  protected openTech(id: string): void {
    this.router.navigate(['/technicians', id]);
  }
}
