import { Observable } from 'rxjs';
import { Page, PageRequest } from '../../core/models/page.model';
import { LocallyFilteredPages } from '../../core/utils/locally-filtered-pages';

export function byBan<T extends { banned: boolean }>(rows: T[], banned: boolean | null): T[] {
  return banned === null ? rows : rows.filter((r) => r.banned === banned);
}

/**
 * Client-side ban filter for accounts endpoints that can't filter by ban
 * state yet (see `LocallyFilteredPages`). Call `invalidate()` after anything
 * that changes ban state or on an explicit refresh. Delete once the backend
 * filters by ban.
 */
export class BanFilteredPages<T extends { banned: boolean }, F> {
  private readonly pages: LocallyFilteredPages<T, F>;

  constructor(drainAll: (filter: F) => Observable<T[]>) {
    this.pages = new LocallyFilteredPages(drainAll);
  }

  page(filter: F, banned: boolean, page: PageRequest): Observable<Page<T>> {
    return this.pages.page(filter, page, (r) => r.banned === banned);
  }

  invalidate(): void {
    this.pages.invalidate();
  }
}
