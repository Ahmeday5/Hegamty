import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PageRequest } from '../../core/models/page.model';
import { BusySet } from '../../core/utils/busy-set';
import { PagedQuery } from '../../core/utils/paged-query';
import { ScopedCounts } from '../../core/utils/scoped-counts';
import { PackagesApi } from './packages.api';
import { PackageCounts, PackageDraft, PackageFilter, TechPackage, toDraft } from './packages.models';

type CountsScope = Omit<PackageFilter, 'active'>;

const NO_FILTER: PackageFilter = { name: null, countryId: null, active: null };
const scopeOf = ({ name, countryId }: PackageFilter): CountsScope => ({ name, countryId });
const scopeKey = (s: CountsScope) => `${s.countryId ?? '*'}|${s.name ?? ''}`;

/**
 * Packages list state: one server page for the current filters, plus the
 * per-status totals (for the same search and country) behind the tabs.
 * Mutations sync the listed page from each response; anything that can move
 * a package between pages or tabs refetches.
 */
@Injectable({ providedIn: 'root' })
export class PackagesStore {
  private readonly api = inject(PackagesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly list = new PagedQuery<TechPackage, PackageFilter>((f, p) => this.api.list(f, p), {
    initialFilter: NO_FILTER,
    errorMessage: 'تعذّر تحميل الباقات',
    destroyRef: this.destroyRef,
  });

  private readonly totals = new ScopedCounts<PackageCounts, CountsScope>((s) => this.api.counts(s), scopeKey, this.destroyRef);

  /** Ids with a request in flight (toggle / delete). */
  readonly busy = new BusySet();

  readonly items = this.list.items;
  readonly page = this.list.page;
  readonly status = this.list.status;
  readonly error = this.list.error;
  /** `null` while loading, or when the last refresh failed. */
  readonly counts = this.totals.value;

  /** Totals follow the search and country; they're refetched only when those change. */
  query(filter: PackageFilter, page: PageRequest): void {
    this.list.query(filter, page);
    this.totals.ensure(scopeOf(filter));
  }

  reload(): void {
    this.list.reload();
    this.refreshCounts();
  }

  /** Call when the page opens, so the next query brings fresh totals. */
  expireCounts(): void {
    this.totals.expire();
  }

  create(draft: PackageDraft): Observable<TechPackage> {
    return this.api.create(draft).pipe(tap(() => this.reload()));
  }

  update(id: string, draft: PackageDraft): Observable<TechPackage> {
    return this.api.update(id, draft).pipe(
      tap((p) => {
        this.list.patch(id, () => p);
        this.refreshCounts();
      }),
    );
  }

  /**
   * Optimistic on/off: the switch flips at once and rolls back if the server
   * rejects it. The API has no PATCH, so the full package is re-sent.
   */
  setActive(pkg: TechPackage, active: boolean): Observable<TechPackage> {
    this.list.patch(pkg.id, (p) => ({ ...p, active }));
    const request$ = this.api.update(pkg.id, { ...toDraft(pkg), active }).pipe(
      tap((p) => {
        this.list.patch(pkg.id, () => p);
        this.refreshCounts();
      }),
      catchError((err) => {
        this.list.patch(pkg.id, () => pkg);
        return throwError(() => err);
      }),
    );
    return this.busy.track(pkg.id, request$);
  }

  remove(id: string): Observable<void> {
    return this.busy.track(id, this.api.remove(id).pipe(tap(() => this.reload())));
  }

  private refreshCounts(): void {
    this.totals.refresh(scopeOf(this.list.filter));
  }
}
