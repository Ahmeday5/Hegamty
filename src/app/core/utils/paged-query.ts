import { DestroyRef, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { ApiError } from '../models/api-response.model';
import { LoadStatus } from '../models/load-status.model';
import { Page, PageMeta, PageRequest } from '../models/page.model';

export const DEFAULT_PAGE: PageRequest = { pageIndex: 1, pageSize: 10 };

type Result<T> = { ok: true; data: Page<T> } | { ok: false; message: string };

export interface PagedQueryOptions<F> {
  initialFilter: F;
  /** Shown when the server gives no usable error message. */
  errorMessage: string;
  destroyRef: DestroyRef;
}

/**
 * State for one server-paginated list: the current page's rows, its
 * metadata and load status. A new `query()` cancels the one in flight, so
 * fast filter/page changes never race. Compose it inside a store:
 *
 *   private readonly list = new PagedQuery((f, p) => this.api.list(f, p), { … });
 *
 * `patch()` edits a row in place — a record stays visible even when it no
 * longer matches the filter, so rows never vanish under the admin's cursor.
 */
export class PagedQuery<T extends { id: string }, F> {
  private readonly rows = signal<T[]>([]);
  private readonly meta = signal<PageMeta>({ ...DEFAULT_PAGE, count: 0, totalPages: 1 });
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly loadError = signal<string | null>(null);
  private current: { filter: F; page: PageRequest };
  private readonly queries = new Subject<{ filter: F; page: PageRequest }>();

  readonly items: Signal<T[]> = this.rows.asReadonly();
  readonly page: Signal<PageMeta> = this.meta.asReadonly();
  readonly status: Signal<LoadStatus> = this.loadStatus.asReadonly();
  readonly error: Signal<string | null> = this.loadError.asReadonly();

  constructor(
    fetch: (filter: F, page: PageRequest) => Observable<Page<T>>,
    private readonly options: PagedQueryOptions<F>,
  ) {
    this.current = { filter: options.initialFilter, page: DEFAULT_PAGE };
    this.queries
      .pipe(
        switchMap((q) =>
          fetch(q.filter, q.page).pipe(
            map((data): Result<T> => ({ ok: true, data })),
            catchError((err: ApiError) => of<Result<T>>({ ok: false, message: err?.message || options.errorMessage })),
          ),
        ),
        takeUntilDestroyed(options.destroyRef),
      )
      .subscribe((res) => this.apply(res));
  }

  /** The filter of the latest query (e.g. to export exactly what is listed). */
  get filter(): F {
    return this.current.filter;
  }

  query(filter: F, page: PageRequest): void {
    this.current = { filter, page };
    this.loadStatus.set('loading');
    this.loadError.set(null);
    this.queries.next(this.current);
  }

  reload(): void {
    this.query(this.current.filter, this.current.page);
  }

  patch(id: string, change: (row: T) => T): void {
    this.rows.update((list) => list.map((r) => (r.id === id ? change(r) : r)));
  }

  private apply(res: Result<T>): void {
    if (!res.ok) {
      this.loadStatus.set('error');
      this.loadError.set(res.message);
      return;
    }
    const { items, page } = res.data;
    // Past the last page (rows removed meanwhile): step back to the new last page.
    if (!items.length && page.count > 0 && page.pageIndex > page.totalPages) {
      this.query(this.current.filter, { ...this.current.page, pageIndex: page.totalPages });
      return;
    }
    this.rows.set(items);
    this.meta.set(page);
    this.loadStatus.set('ready');
  }
}
