import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-response.model';
import { LoadStatus } from '../../core/models/load-status.model';
import { CountriesApi } from './countries.api';
import { Country, CountryCreate, CountryUpdate } from './countries.models';

const collator = new Intl.Collator('ar');
const byName = (a: Country, b: Country) => collator.compare(a.name, b.name);

/**
 * Countries catalog — the root of every other record. Loaded once before the
 * app shell renders (see `countriesResolver`) and kept in sync locally from
 * each mutation's response, so no refetch is needed after a write.
 */
@Injectable({ providedIn: 'root' })
export class CountriesStore {
  private readonly api = inject(CountriesApi);

  private readonly items = signal<Country[]>([]);
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly loadError = signal<string | null>(null);
  private inflight: Observable<Country[]> | null = null;

  readonly all: Signal<Country[]> = this.items.asReadonly();
  readonly status: Signal<LoadStatus> = this.loadStatus.asReadonly();
  readonly error: Signal<string | null> = this.loadError.asReadonly();
  readonly loaded = computed(() => this.loadStatus() === 'ready');

  private readonly byIdMap = computed(() => new Map(this.items().map((c) => [c.id, c])));

  byId(id: string | null | undefined): Country | undefined {
    return id ? this.byIdMap().get(id) : undefined;
  }

  currency(id: string): string {
    return this.byId(id)?.currency ?? '';
  }

  /** Loads once; concurrent callers share the same request. */
  ensureLoaded(): Observable<Country[]> {
    return this.loaded() ? of(this.items()) : this.load();
  }

  load(): Observable<Country[]> {
    if (this.inflight) return this.inflight;
    this.loadStatus.set('loading');
    this.loadError.set(null);
    this.inflight = this.api.list().pipe(
      map((list) => [...list].sort(byName)),
      tap((list) => {
        this.items.set(list);
        this.loadStatus.set('ready');
      }),
      catchError((err: ApiError) => {
        this.loadStatus.set('error');
        this.loadError.set(err?.message || 'تعذّر تحميل الدول');
        return throwError(() => err);
      }),
      finalize(() => (this.inflight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inflight;
  }

  create(body: CountryCreate): Observable<Country> {
    return this.api.create(body).pipe(tap((c) => this.upsert(c)));
  }

  update(id: string, body: CountryUpdate): Observable<Country> {
    return this.api.update(id, body).pipe(tap((c) => this.upsert(c)));
  }

  addGovernorates(id: string, names: string[]): Observable<Country> {
    return this.api.addGovernorates(id, names).pipe(tap((c) => this.upsert(c)));
  }

  /** The endpoint returns no body, so the country is patched locally. */
  removeGovernorate(countryId: string, governorateId: string): Observable<void> {
    return this.api.removeGovernorate(countryId, governorateId).pipe(
      tap(() => {
        const c = this.byId(countryId);
        if (c) this.upsert({ ...c, governorates: c.governorates.filter((g) => g.id !== governorateId) });
      }),
    );
  }

  remove(id: string): Observable<void> {
    return this.api.remove(id).pipe(tap(() => this.items.update((list) => list.filter((c) => c.id !== id))));
  }

  private upsert(country: Country): void {
    this.items.update((list) => {
      const exists = list.some((c) => c.id === country.id);
      return (exists ? list.map((c) => (c.id === country.id ? country : c)) : [...list, country]).sort(byName);
    });
  }
}
