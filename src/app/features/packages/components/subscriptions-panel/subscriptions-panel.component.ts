import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { SubscriptionsStore } from '../../subscriptions.store';
import {
  SUBSCRIPTION_STATUS_FILTER,
  SUBSCRIPTION_STATUS_TABS,
  SubscriptionFilter,
  SubscriptionStatusFilter,
} from '../../subscriptions.models';
import { SubscriptionsTableComponent } from '../subscriptions-table/subscriptions-table.component';

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZES = [10, 25, 50] as const;

/**
 * Every technician's package purchases, server-driven: technician-name
 * search, status and the header's country go to
 * `/admin/specialists/subscriptions` with paging.
 */
@Component({
  selector: 'app-subscriptions-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PaginationComponent, SubscriptionsTableComponent, ...FORMAT_PIPES],
  templateUrl: './subscriptions-panel.component.html',
  styleUrl: './subscriptions-panel.component.scss',
})
export class SubscriptionsPanelComponent {
  private readonly store = inject(SubscriptionsStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly scope = inject(CountryScopeService);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly status = this.store.status;
  protected readonly loadError = this.store.error;
  protected readonly pageMeta = this.store.page;
  protected readonly rows = this.store.items;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<SubscriptionStatusFilter>('all');
  protected readonly pageSize = signal<number>(PAGE_SIZES[0]);
  private readonly term = toSignal(
    toObservable(this.search).pipe(
      map((v) => v.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  private readonly filter = computed<SubscriptionFilter>(() => ({
    name: this.term() || null,
    countryId: this.scope.country()?.id ?? null,
    active: SUBSCRIPTION_STATUS_FILTER[this.statusFilter()].active,
  }));
  /** The page number belongs to one filter — any filter change starts again from page 1. */
  private readonly pageState = signal({ key: '', index: 1 });
  private readonly filterKey = computed(() => `${JSON.stringify(this.filter())}|${this.pageSize()}`);
  private readonly pageIndex = computed(() => (this.pageState().key === this.filterKey() ? this.pageState().index : 1));

  protected readonly hasFilters = computed(() => !!this.search().trim() || this.statusFilter() !== 'all');
  /** Skeleton only on a cold load; later queries keep the stale rows (dimmed) until the new page lands. */
  protected readonly firstLoad = computed(() => this.status() !== 'ready' && this.status() !== 'error' && !this.rows().length);

  protected readonly statusTabs = computed(() => {
    const c = this.store.counts();
    return SUBSCRIPTION_STATUS_TABS.map((id) => ({ id, label: SUBSCRIPTION_STATUS_FILTER[id].label, count: c?.[id] }));
  });

  protected readonly emptyTitle = computed(() => (this.hasFilters() ? 'لا توجد نتائج' : 'لا توجد اشتراكات بعد'));
  protected readonly emptyText = computed(() => {
    if (this.hasFilters()) return 'جرّب تعديل البحث أو إزالة الفلاتر.';
    const c = this.scope.country();
    return c ? `لم يشترك أي فني في ${c.name} في باقة بعد.` : 'تظهر هنا الباقات التي يشتريها الفنيون من التطبيق.';
  });

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

  protected reload(): void {
    this.store.reload();
  }

  protected setStatus(f: SubscriptionStatusFilter): void {
    this.statusFilter.set(f);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  protected goToPage(index: number): void {
    this.pageState.set({ key: this.filterKey(), index });
    queueMicrotask(() => this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
  }

  protected openSpecialist(id: string): void {
    this.router.navigate(['/technicians', id], { queryParams: { tab: 'subscriptions' } });
  }
}
