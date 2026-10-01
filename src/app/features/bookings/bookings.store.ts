import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { LocallyFilteredPages } from '../../core/utils/locally-filtered-pages';
import { BookingsApi } from './bookings.api';
import { Booking, BookingCounts, BookingFilter, BookingQuery, countBookings } from './bookings.models';

const NO_LOCATION = { countryId: null, governorateId: null };
const INITIAL_FILTER: BookingFilter = {
  clientId: null,
  specialistId: null,
  clientLocation: NO_LOCATION,
  specialistLocation: NO_LOCATION,
  status: null,
};

const serverPart = (f: BookingFilter): BookingQuery => ({
  clientId: f.clientId,
  specialistId: f.specialistId,
  clientLocation: f.clientLocation,
  specialistLocation: f.specialistLocation,
});
const queryKey = (q: BookingQuery) => JSON.stringify(q);

/**
 * Bookings list state. The API can't filter by status, so:
 * - with no status picked, pages come straight from the server;
 * - the per-status totals and status-filtered pages come from every match
 *   of the server filters, drained once and cached (`LocallyFilteredPages`).
 */
@Injectable({ providedIn: 'root' })
export class BookingsStore {
  private readonly api = inject(BookingsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly matches = new LocallyFilteredPages<Booking, BookingQuery>((q) => this.api.listAll(q));

  private readonly list = new PagedQuery<Booking, BookingFilter>((f, p) => this.fetch(f, p), {
    initialFilter: INITIAL_FILTER,
    errorMessage: 'تعذّر تحميل الحجوزات',
    destroyRef: this.destroyRef,
  });

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;

  private readonly totals = signal<BookingCounts | null>(null);
  /** `null` while loading, or when the last refresh failed. */
  readonly counts: Signal<BookingCounts | null> = this.totals.asReadonly();
  private readonly countRequests = new Subject<BookingQuery>();
  private countedFor: string | null = null;

  constructor() {
    this.countRequests
      .pipe(
        switchMap((q) =>
          this.matches.rows(q).pipe(
            map(countBookings),
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((c) => this.totals.set(c));
  }

  /** Totals are recomputed only when the server filters change (not on status / page changes). */
  query(filter: BookingFilter, page: PageRequest): void {
    this.list.query(filter, page);
    const server = serverPart(filter);
    if (queryKey(server) !== this.countedFor) this.refreshCounts(server);
  }

  reload(): void {
    this.matches.invalidate();
    this.list.reload();
    this.refreshCounts(serverPart(this.list.filter));
  }

  /** Call when the list page opens, so the next query brings fresh data. */
  expire(): void {
    this.matches.invalidate();
    this.countedFor = null;
  }

  /** Every booking matching the listed filters (for export). */
  exportRows(): Observable<Booking[]> {
    const { status } = this.list.filter;
    return this.matches.rows(serverPart(this.list.filter)).pipe(map((rows) => (status ? rows.filter((b) => b.status === status) : rows)));
  }

  private fetch(filter: BookingFilter, page: PageRequest): Observable<Page<Booking>> {
    const { status } = filter;
    const server = serverPart(filter);
    return status === null ? this.api.list(server, page) : this.matches.page(server, page, (b) => b.status === status);
  }

  private refreshCounts(server: BookingQuery): void {
    const key = queryKey(server);
    if (key !== this.countedFor) this.totals.set(null);
    this.countedFor = key;
    this.countRequests.next(server);
  }
}
