import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PageRequest } from '../../core/models/page.model';
import { PagedQuery } from '../../core/utils/paged-query';
import { ScopedCounts } from '../../core/utils/scoped-counts';
import { DriversApi } from './drivers.api';
import { Driver, DriverCounts, DriverFilter, NO_DRIVER_FILTER } from './drivers.models';

/** Drivers aren't tied to a country yet, so the totals have a single, global scope. */
const GLOBAL = 'all';

/**
 * Drivers list state: one server page for the current filters plus the
 * global totals behind the KPIs and tabs. Ban / unban patch the listed row
 * with their known outcome (the API answers `data: null`) and return the
 * updated record, so the detail page can apply it too.
 */
@Injectable({ providedIn: 'root' })
export class DriversStore {
  private readonly api = inject(DriversApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly list = new PagedQuery<Driver, DriverFilter>((f, p) => this.api.list(f, p), {
    initialFilter: NO_DRIVER_FILTER,
    errorMessage: 'تعذّر تحميل السائقين',
    destroyRef: this.destroyRef,
  });

  private readonly totals = new ScopedCounts<DriverCounts, typeof GLOBAL>(() => this.api.counts(), (s) => s, this.destroyRef);

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;
  /** `null` while loading (or when the last refresh failed). */
  readonly counts = this.totals.value;

  query(filter: DriverFilter, page: PageRequest): void {
    this.list.query(filter, page);
    this.totals.ensure(GLOBAL);
  }

  reload(): void {
    this.list.reload();
    this.totals.refresh(GLOBAL);
  }

  /** Call when the list page opens, so the next query brings fresh totals. */
  expireCounts(): void {
    this.totals.expire();
  }

  /** Every driver matching the listed filters (for export). */
  exportRows(): Observable<Driver[]> {
    return this.api.listAll(this.list.filter);
  }

  ban(d: Driver): Observable<Driver> {
    return this.api.ban(d.id).pipe(map(() => this.apply({ ...d, banned: true })));
  }

  unban(d: Driver): Observable<Driver> {
    return this.api.unban(d.id).pipe(map(() => this.apply({ ...d, banned: false })));
  }

  /** The row stays on the page (even if it no longer matches the ban filter); the totals move. */
  private apply(next: Driver): Driver {
    this.list.patch(next.id, () => next);
    this.totals.refresh(GLOBAL);
    return next;
  }
}
