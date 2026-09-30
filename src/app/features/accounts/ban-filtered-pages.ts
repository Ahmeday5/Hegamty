import { Observable, catchError, map, shareReplay } from 'rxjs';
import { Page, PageRequest, pageOf } from '../../core/models/page.model';

export function byBan<T extends { banned: boolean }>(rows: T[], banned: boolean | null): T[] {
  return banned === null ? rows : rows.filter((r) => r.banned === banned);
}

/**
 * Client-side ban filter for accounts endpoints that can't filter by ban
 * state yet: every server match for the other filters is drained once
 * (cached per filter), filtered in the browser and paged locally — so counts
 * and paging stay exact. Call `invalidate()` after anything that changes ban
 * state or on an explicit refresh. Delete once the backend filters by ban.
 */
export class BanFilteredPages<T extends { banned: boolean }, F> {
  private cache: { key: string; rows: Observable<T[]> } | null = null;

  constructor(private readonly drainAll: (filter: F) => Observable<T[]>) {}

  page(filter: F, banned: boolean, page: PageRequest): Observable<Page<T>> {
    const key = JSON.stringify(filter);
    if (this.cache?.key !== key) {
      this.cache = { key, rows: this.drainAll(filter).pipe(shareReplay({ bufferSize: 1, refCount: false })) };
    }
    const entry = this.cache;
    return entry.rows.pipe(
      map((rows) => pageOf(byBan(rows, banned), page)),
      catchError((err) => {
        if (this.cache === entry) this.cache = null; // never cache a failure
        throw err;
      }),
    );
  }

  invalidate(): void {
    this.cache = null;
  }
}
