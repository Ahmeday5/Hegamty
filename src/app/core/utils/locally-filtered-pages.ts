import { Observable, catchError, map, shareReplay } from 'rxjs';
import { Page, PageRequest, pageOf } from '../models/page.model';

/**
 * For filters an endpoint can't apply itself: every server match for the
 * server-side filter `F` is drained once (cached per filter), then filtered
 * in the browser and paged locally — so counts and paging stay exact.
 *
 * Only the latest filter is cached. Call `invalidate()` after anything that
 * changes the rows, or on an explicit refresh. Failures are never cached.
 * Retire a usage once its backend filters server-side.
 */
export class LocallyFilteredPages<T, F> {
  private cache: { key: string; rows: Observable<T[]> } | null = null;

  constructor(private readonly drainAll: (filter: F) => Observable<T[]>) {}

  /** Every server match for `filter` (cached). */
  rows(filter: F): Observable<T[]> {
    const key = JSON.stringify(filter);
    if (this.cache?.key !== key) {
      this.cache = { key, rows: this.drainAll(filter).pipe(shareReplay({ bufferSize: 1, refCount: false })) };
    }
    const entry = this.cache;
    return entry.rows.pipe(
      catchError((err) => {
        if (this.cache === entry) this.cache = null;
        throw err;
      }),
    );
  }

  page(filter: F, page: PageRequest, keep: (row: T) => boolean): Observable<Page<T>> {
    return this.rows(filter).pipe(map((rows) => pageOf(rows.filter(keep), page)));
  }

  invalidate(): void {
    this.cache = null;
  }
}
