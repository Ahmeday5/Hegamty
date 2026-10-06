import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asList, asPaged } from '../../core/utils/api-list.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { SpecialistSubscription, SubscriptionCounts, SubscriptionFilter } from './subscriptions.models';

// ─────────── wire format ───────────

interface SubscriptionDto {
  id: number;
  specialistId: number;
  specialistName: string | null;
  specialistPhone: string | null;
  countryId: number;
  countryName: string | null;
  packageId: number;
  packageName: string | null;
  packagePrice: number | null;
  currency: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

const ENDPOINT = 'admin/specialists/subscriptions';

// ─────────── mapping ───────────

function toSubscription(dto: SubscriptionDto): SpecialistSubscription {
  return {
    id: String(dto.id),
    specialistId: String(dto.specialistId),
    specialistName: dto.specialistName?.trim() || '—',
    specialistPhone: dto.specialistPhone?.trim() ?? '',
    countryId: String(dto.countryId),
    countryName: dto.countryName?.trim() ?? '',
    packageId: String(dto.packageId),
    packageName: dto.packageName?.trim() || '—',
    price: Math.max(0, Number(dto.packagePrice) || 0),
    currency: dto.currency?.trim() ?? '',
    startedAt: parseApiDate(dto.startDate),
    endsAt: parseApiDate(dto.endDate),
    active: !!dto.isActive,
  };
}

function toParams(f: SubscriptionFilter, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: f.name,
    countryId: f.countryId,
    isActive: f.active,
  };
}

/**
 * HTTP boundary for technician subscriptions (read-only). Reads are silent:
 * the calling view renders its own loading / error states.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsApi {
  private readonly api = inject(ApiService);

  list(filter: SubscriptionFilter, page: PageRequest): Observable<Page<SpecialistSubscription>> {
    return this.getPage(filter, page).pipe(map((paged) => ({ items: paged.data.map(toSubscription), page: toPageMeta(paged, page) })));
  }

  /** Totals per status for a search/country — one single-row page each, read from `count`. */
  counts(filter: Omit<SubscriptionFilter, 'active'>): Observable<SubscriptionCounts> {
    const countOf = (active: boolean | null) => this.getPage({ ...filter, active }, { pageIndex: 1, pageSize: 1 }).pipe(map((p) => p.count));
    return forkJoin({ all: countOf(null), active: countOf(true), inactive: countOf(false) });
  }

  /** Every subscription of one technician (unpaged on the server). */
  ofSpecialist(specialistId: string): Observable<SpecialistSubscription[]> {
    return this.api
      .get<unknown>(`admin/specialists/${specialistId}/subscriptions`, { context: withInlineHandling() })
      .pipe(map((res) => asList<SubscriptionDto>(res).map(toSubscription)));
  }

  private getPage(filter: SubscriptionFilter, page: PageRequest) {
    return this.api
      .get<unknown>(ENDPOINT, { params: toParams(filter, page), context: withInlineHandling() })
      .pipe(map((res) => asPaged<SubscriptionDto>(res)));
  }
}
