import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { LocallyFilteredPages } from '../../core/utils/locally-filtered-pages';
import { ANY_LOCATION, AccountLocationFilter } from '../accounts/account-profile';
import { ReviewsApi } from './reviews.api';
import { RatingSummary, Review, ReviewFilter, ReviewQuery, matchesLocations, summarizeRatings } from './reviews.models';

const INITIAL_FILTER: ReviewFilter = {
  clientId: null,
  specialistId: null,
  rating: null,
  clientLocation: ANY_LOCATION,
  specialistLocation: ANY_LOCATION,
};

const serverPart = (f: ReviewFilter): ReviewQuery => ({ clientId: f.clientId, specialistId: f.specialistId });
const hasLocation = (l: AccountLocationFilter) => !!l.countryId || !!l.governorateId;

/**
 * Reviews list state. The API filters by account only (`clientId`,
 * `specialistId`), so the rating and the parties' locations are applied in
 * the browser over every server match (drained once, cached). With no local
 * filter, pages come straight from the server. The summary (average,
 * per-star breakdown) covers the listed scope, ignoring the rating filter.
 */
@Injectable({ providedIn: 'root' })
export class ReviewsStore {
  private readonly api = inject(ReviewsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly matches = new LocallyFilteredPages<Review, ReviewQuery>((q) => this.api.listAll(q));

  private readonly list = new PagedQuery<Review, ReviewFilter>((f, p) => this.fetch(f, p), {
    initialFilter: INITIAL_FILTER,
    errorMessage: 'تعذّر تحميل التقييمات',
    destroyRef: this.destroyRef,
  });

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;

  private readonly summaryValue = signal<RatingSummary | null>(null);
  /** `null` while loading, or when the last refresh failed. */
  readonly summary: Signal<RatingSummary | null> = this.summaryValue.asReadonly();
  private readonly summaryRequests = new Subject<ReviewFilter>();
  private summarizedFor: string | null = null;

  constructor() {
    this.summaryRequests
      .pipe(
        switchMap((f) =>
          this.scoped(f).pipe(
            map(summarizeRatings),
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.summaryValue.set(s));
  }

  query(filter: ReviewFilter, page: PageRequest): void {
    this.list.query(filter, page);
    if (this.summaryKey(filter) !== this.summarizedFor) this.refreshSummary(filter);
  }

  reload(): void {
    this.matches.invalidate();
    this.list.reload();
    this.refreshSummary(this.list.filter);
  }

  /** Call when the list page opens, so the next query brings fresh data. */
  expire(): void {
    this.matches.invalidate();
    this.summarizedFor = null;
  }

  /** Every review matching the listed filters (for export). */
  exportRows(): Observable<Review[]> {
    const { rating } = this.list.filter;
    return this.scoped(this.list.filter).pipe(map((rows) => (rating ? rows.filter((r) => r.rating === rating) : rows)));
  }

  private fetch(filter: ReviewFilter, page: PageRequest): Observable<Page<Review>> {
    const { rating } = filter;
    const local = rating !== null || hasLocation(filter.clientLocation) || hasLocation(filter.specialistLocation);
    if (!local) return this.api.list(serverPart(filter), page);
    return this.matches.page(serverPart(filter), page, (r) => (rating === null || r.rating === rating) && matchesLocations(r, filter));
  }

  /** Server matches narrowed to the listed locations (rating not applied). */
  private scoped(filter: ReviewFilter): Observable<Review[]> {
    return this.matches.rows(serverPart(filter)).pipe(map((rows) => rows.filter((r) => matchesLocations(r, filter))));
  }

  private summaryKey(f: ReviewFilter): string {
    return JSON.stringify([serverPart(f), f.clientLocation, f.specialistLocation]);
  }

  private refreshSummary(filter: ReviewFilter): void {
    const key = this.summaryKey(filter);
    if (key !== this.summarizedFor) this.summaryValue.set(null);
    this.summarizedFor = key;
    this.summaryRequests.next(filter);
  }
}
