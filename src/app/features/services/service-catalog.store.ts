import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-response.model';
import { LoadStatus } from '../../core/models/load-status.model';
import { CatalogPage, ServiceCatalogApi } from './service-catalog.api';
import {
  CatalogFilter,
  CatalogService,
  CatalogServiceCreate,
  CatalogServiceUpdate,
  CountryPricingDraft,
  NO_FILTER,
  PageMeta,
  PageRequest,
  PricingUpdate,
} from './service-catalog.models';

interface Query {
  filter: CatalogFilter;
  page: PageRequest;
}

type QueryResult = { ok: true; data: CatalogPage } | { ok: false; message: string };

const DEFAULT_PAGE: PageRequest = { pageIndex: 1, pageSize: 10 };

/**
 * One server page of the service catalog for the current filters. A new
 * `query()` cancels the one in flight, so fast filter/page changes never race.
 *
 * Edits patch the page in place from each response (a record stays visible
 * even if it no longer matches — rows never vanish under the admin's cursor).
 * Create and delete reload the page, since they shift counts and paging.
 */
@Injectable({ providedIn: 'root' })
export class ServiceCatalogStore {
  private readonly api = inject(ServiceCatalogApi);

  private readonly items = signal<CatalogService[]>([]);
  private readonly meta = signal<PageMeta>({ ...DEFAULT_PAGE, count: 0, totalPages: 1 });
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly loadError = signal<string | null>(null);
  private readonly current = signal<Query>({ filter: NO_FILTER, page: DEFAULT_PAGE });
  private readonly queries = new Subject<Query>();

  readonly all: Signal<CatalogService[]> = this.items.asReadonly();
  readonly page: Signal<PageMeta> = this.meta.asReadonly();
  readonly status: Signal<LoadStatus> = this.loadStatus.asReadonly();
  readonly error: Signal<string | null> = this.loadError.asReadonly();

  private readonly byIdMap = computed(() => new Map(this.items().map((s) => [s.id, s])));

  constructor() {
    this.queries
      .pipe(
        switchMap((q) =>
          this.api.list(q.filter, q.page).pipe(
            map((data): QueryResult => ({ ok: true, data })),
            catchError((err: ApiError) => of<QueryResult>({ ok: false, message: err?.message || 'تعذّر تحميل الخدمات' })),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((res) => {
        if (!res.ok) {
          this.loadStatus.set('error');
          this.loadError.set(res.message);
          return;
        }
        const { items, page } = res.data;
        // Deleting the last row of the last page: step back to the new last page.
        if (!items.length && page.count > 0 && page.pageIndex > page.totalPages) {
          this.query(this.current().filter, { ...page, pageIndex: page.totalPages });
          return;
        }
        this.items.set(items);
        this.meta.set(page);
        this.loadStatus.set('ready');
      });
  }

  byId(id: string | null | undefined): CatalogService | undefined {
    return id ? this.byIdMap().get(id) : undefined;
  }

  query(filter: CatalogFilter, page: PageRequest): void {
    this.current.set({ filter, page });
    this.loadStatus.set('loading');
    this.loadError.set(null);
    this.queries.next({ filter, page });
  }

  reload(): void {
    const { filter, page } = this.current();
    this.query(filter, page);
  }

  create(body: CatalogServiceCreate): Observable<CatalogService> {
    return this.api.create(body).pipe(tap(() => this.reload()));
  }

  update(id: string, body: CatalogServiceUpdate): Observable<CatalogService> {
    return this.api.update(id, body).pipe(tap((s) => this.replace(s)));
  }

  /** Optimistic on/off with rollback. No PATCH exists, so the full record is sent. */
  setActive(id: string, active: boolean): Observable<CatalogService> {
    const current = this.byId(id);
    if (!current) return throwError(() => ({ status: 404, message: 'الخدمة غير موجودة' }) satisfies ApiError);
    this.replace({ ...current, active });
    const { sectionId, name, description } = current;
    return this.api.update(id, { sectionId, name, description, active }).pipe(
      tap((s) => this.replace(s)),
      catchError((err) => {
        this.replace(current);
        return throwError(() => err);
      }),
    );
  }

  remove(id: string): Observable<void> {
    return this.api.remove(id).pipe(tap(() => this.reload()));
  }

  addPricing(serviceId: string, pricing: CountryPricingDraft): Observable<CatalogService> {
    return this.api.addPricing(serviceId, pricing).pipe(tap((s) => this.replace(s)));
  }

  updatePricing(serviceId: string, pricingId: string, pricing: PricingUpdate): Observable<CatalogService> {
    return this.api.updatePricing(serviceId, pricingId, pricing).pipe(tap((s) => this.replace(s)));
  }

  removePricing(serviceId: string, pricingId: string): Observable<CatalogService> {
    return this.api.removePricing(serviceId, pricingId).pipe(tap((s) => this.replace(s)));
  }

  private replace(service: CatalogService): void {
    this.items.update((list) => list.map((s) => (s.id === service.id ? service : s)));
  }
}
