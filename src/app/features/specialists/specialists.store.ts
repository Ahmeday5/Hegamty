import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { BanFilteredPages, byBan } from '../accounts/ban-filtered-pages';
import { SpecialistsApi } from './specialists.api';
import { NO_SPECIALIST_FILTER, Specialist, SpecialistCounts, SpecialistFilter, SpecialistStatus } from './specialists.models';

/**
 * Technicians list state: one server page for the current filters plus the
 * per-status totals behind the KPIs and tabs. Actions patch the listed row
 * with their known outcome (the API answers `data: null`) and return the
 * updated record, so a detail page can apply it too.
 *
 * The API can't filter by ban state yet — with that filter on, pages come
 * from `BanFilteredPages` (browser-side filtering).
 */
@Injectable({ providedIn: 'root' })
export class SpecialistsStore {
  private readonly api = inject(SpecialistsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly banFiltered = new BanFilteredPages<Specialist, Omit<SpecialistFilter, 'banned'>>((f) => this.api.listAll(f));

  private readonly list = new PagedQuery<Specialist, SpecialistFilter>((f, p) => this.fetch(f, p), {
    initialFilter: NO_SPECIALIST_FILTER,
    errorMessage: 'تعذّر تحميل الفنيين',
    destroyRef: this.destroyRef,
  });

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;

  private readonly totals = signal<SpecialistCounts | null>(null);
  /** `null` until first loaded (or when the last refresh failed). */
  readonly counts: Signal<SpecialistCounts | null> = this.totals.asReadonly();
  private readonly countRequests = new Subject<void>();

  constructor() {
    this.countRequests
      .pipe(
        switchMap(() => this.api.counts().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((c) => this.totals.set(c));
  }

  query(filter: SpecialistFilter, page: PageRequest): void {
    this.list.query(filter, page);
  }

  reload(): void {
    this.banFiltered.invalidate();
    this.list.reload();
    this.refreshCounts();
  }

  refreshCounts(): void {
    this.countRequests.next();
  }

  /** Every technician matching the listed filters (for export). */
  exportRows(): Observable<Specialist[]> {
    const { banned, ...server } = this.list.filter;
    return this.api.listAll(server).pipe(map((rows) => byBan(rows, banned)));
  }

  approve(s: Specialist): Observable<Specialist> {
    return this.api.approve(s.id).pipe(map(() => this.setStatus(s, 'approved')));
  }

  reject(s: Specialist): Observable<Specialist> {
    return this.api.reject(s.id).pipe(map(() => this.setStatus(s, 'rejected')));
  }

  ban(s: Specialist): Observable<Specialist> {
    return this.api.ban(s.id).pipe(map(() => this.applyBan(s, true)));
  }

  unban(s: Specialist): Observable<Specialist> {
    return this.api.unban(s.id).pipe(map(() => this.applyBan(s, false)));
  }

  private fetch(filter: SpecialistFilter, page: PageRequest): Observable<Page<Specialist>> {
    const { banned, ...server } = filter;
    return banned === null ? this.api.list(server, page) : this.banFiltered.page(server, banned, page);
  }

  private applyBan(s: Specialist, banned: boolean): Specialist {
    // Ban state changed → cached matches for the ban filter are stale.
    this.banFiltered.invalidate();
    return this.apply({ ...s, banned });
  }

  private setStatus(s: Specialist, status: SpecialistStatus): Specialist {
    const next = this.apply({ ...s, status });
    this.refreshCounts();
    return next;
  }

  private apply(next: Specialist): Specialist {
    this.list.patch(next.id, () => next);
    return next;
  }
}
