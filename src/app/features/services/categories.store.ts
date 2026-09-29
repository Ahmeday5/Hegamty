import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-response.model';
import { LoadStatus } from '../../core/models/load-status.model';
import { CategoriesApi } from './categories.api';
import { CategoryDraft, ServiceCategory } from './services.models';

/**
 * Services sections, shared by every country's catalog. Loaded by
 * `categoriesResolver` and kept in sync locally from each mutation's
 * response. List order is the server's.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly api = inject(CategoriesApi);

  private readonly items = signal<ServiceCategory[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly loadError = signal<string | null>(null);
  private inflight: Observable<ServiceCategory[]> | null = null;

  readonly all: Signal<ServiceCategory[]> = this.items.asReadonly();
  readonly status: Signal<LoadStatus> = this.loadStatus.asReadonly();
  readonly error: Signal<string | null> = this.loadError.asReadonly();
  readonly loaded = computed(() => this.loadStatus() === 'ready');

  private readonly byIdMap = computed(() => new Map(this.items().map((c) => [c.id, c])));

  byId(id: string | null | undefined): ServiceCategory | undefined {
    return id ? this.byIdMap().get(id) : undefined;
  }

  /** Loads once; concurrent callers share the same request. */
  ensureLoaded(): Observable<ServiceCategory[]> {
    return this.loaded() ? of(this.items()) : this.load();
  }

  load(): Observable<ServiceCategory[]> {
    if (this.inflight) return this.inflight;
    this.loadStatus.set('loading');
    this.loadError.set(null);
    this.inflight = this.api.list().pipe(
      tap((list) => {
        this.items.set(list);
        this.loadStatus.set('ready');
      }),
      catchError((err: ApiError) => {
        this.loadStatus.set('error');
        this.loadError.set(err?.message || 'تعذّر تحميل الأقسام');
        return throwError(() => err);
      }),
      finalize(() => (this.inflight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inflight;
  }

  create(draft: CategoryDraft): Observable<ServiceCategory> {
    return this.api.create(draft).pipe(tap((c) => this.items.update((list) => [...list, c])));
  }

  update(id: string, draft: CategoryDraft): Observable<ServiceCategory> {
    return this.api.update(id, draft).pipe(tap((c) => this.replace(c)));
  }

  /**
   * Optimistic on/off: the switch flips immediately and rolls back if the
   * server rejects it. The API has no PATCH, so the full record is re-sent —
   * without an image, so the server keeps the current icon.
   */
  setActive(id: string, active: boolean): Observable<ServiceCategory> {
    const current = this.byId(id);
    if (!current) return throwError(() => ({ status: 404, message: 'القسم غير موجود' }) satisfies ApiError);
    this.replace({ ...current, active });
    const draft: CategoryDraft = {
      name: current.name,
      description: current.description,
      active,
      countryIds: current.countries.map((c) => c.id),
    };
    return this.api.update(id, draft).pipe(
      tap((c) => this.replace(c)),
      catchError((err) => {
        this.replace(current);
        return throwError(() => err);
      }),
    );
  }

  remove(id: string): Observable<void> {
    return this.api.remove(id).pipe(tap(() => this.items.update((list) => list.filter((c) => c.id !== id))));
  }

  private replace(category: ServiceCategory): void {
    this.items.update((list) => list.map((c) => (c.id === category.id ? category : c)));
  }
}
