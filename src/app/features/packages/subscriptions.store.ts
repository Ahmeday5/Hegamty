import { DestroyRef, Injectable, inject } from '@angular/core';
import { PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { ScopedCounts } from '../../core/utils/scoped-counts';
import { SubscriptionsApi } from './subscriptions.api';
import { SpecialistSubscription, SubscriptionCounts, SubscriptionFilter } from './subscriptions.models';

type CountsScope = Omit<SubscriptionFilter, 'active'>;

export const NO_SUBSCRIPTION_FILTER: SubscriptionFilter = { name: null, countryId: null, active: null };

const scopeOf = ({ name, countryId }: SubscriptionFilter): CountsScope => ({ name, countryId });
const scopeKey = (s: CountsScope) => `${s.countryId ?? '*'}|${s.name ?? ''}`;

/**
 * Subscriptions list state: one server page for the current filters, plus
 * the per-status totals (for the same search and country) behind the tabs.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsStore {
  private readonly api = inject(SubscriptionsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly list = new PagedQuery<SpecialistSubscription, SubscriptionFilter>((f, p) => this.api.list(f, p), {
    initialFilter: NO_SUBSCRIPTION_FILTER,
    errorMessage: 'تعذّر تحميل اشتراكات الفنيين',
    destroyRef: this.destroyRef,
  });

  private readonly totals = new ScopedCounts<SubscriptionCounts, CountsScope>((s) => this.api.counts(s), scopeKey, this.destroyRef);

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;
  /** `null` while loading, or when the last refresh failed. */
  readonly counts = this.totals.value;

  /** Totals follow the search and country; they're refetched only when those change. */
  query(filter: SubscriptionFilter, page: PageRequest): void {
    this.list.query(filter, page);
    this.totals.ensure(scopeOf(filter));
  }

  reload(): void {
    this.list.reload();
    this.totals.refresh(scopeOf(this.list.filter));
  }

  /** Call when the view opens, so the next query brings fresh totals. */
  expireCounts(): void {
    this.totals.expire();
  }
}
