import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CountriesStore } from './countries.store';
import { BASE_CURRENCY, Country } from './countries.models';

const STORAGE_KEY = 'country_scope';
export const ALL_COUNTRIES = 'all';

/**
 * The dashboard-wide country filter (topbar switcher). Every page reads
 * through it so switching country re-scopes lists, KPIs and charts at once.
 *
 * Money rule: inside one country, amounts stay in that country's currency.
 * Across "all countries", amounts are converted to the base currency with
 * `rateToBase` — different currencies are never summed as-is.
 */
@Injectable({ providedIn: 'root' })
export class CountryScopeService {
  private readonly countries = inject(CountriesStore);

  readonly selected = signal<string>(this.restore());

  readonly country = computed<Country | null>(() => {
    const id = this.selected();
    return id === ALL_COUNTRIES ? null : (this.countries.byId(id) ?? null);
  });
  readonly isAll = computed(() => this.country() === null);
  readonly currency = computed(() => this.country()?.currencySymbol ?? BASE_CURRENCY.symbol);
  readonly label = computed(() => this.country()?.name ?? 'كل الدول');

  constructor() {
    // A deleted country can't stay selected.
    effect(() => {
      const id = this.selected();
      if (id !== ALL_COUNTRIES && !this.countries.byId(id)) this.selected.set(ALL_COUNTRIES);
      try { localStorage.setItem(STORAGE_KEY, this.selected()); } catch { /* storage unavailable */ }
    }, { allowSignalWrites: true });
  }

  select(id: string): void {
    this.selected.set(id);
  }

  matches(countryId: string): boolean {
    const id = this.selected();
    return id === ALL_COUNTRIES || id === countryId;
  }

  filter<T extends { countryId: string }>(list: readonly T[]): T[] {
    const id = this.selected();
    return id === ALL_COUNTRIES ? [...list] : list.filter((x) => x.countryId === id);
  }

  /** An amount in `countryId`'s currency, expressed in the scope currency. */
  toScope(amount: number, countryId: string): number {
    return this.isAll() ? amount * this.countries.rate(countryId) : amount;
  }

  /** Sums money across items, converting to the scope currency when needed. */
  sum<T extends { countryId: string }>(list: readonly T[], amount: (x: T) => number): number {
    return list.reduce((acc, x) => acc + this.toScope(amount(x), x.countryId), 0);
  }

  private restore(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) || ALL_COUNTRIES;
    } catch {
      return ALL_COUNTRIES;
    }
  }
}
