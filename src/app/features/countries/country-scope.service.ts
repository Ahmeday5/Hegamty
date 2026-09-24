import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CountriesStore } from './countries.store';
import { Country } from './countries.models';

const STORAGE_KEY = 'country_scope';
export const ALL_COUNTRIES = 'all';

/**
 * Dashboard-wide country filter (topbar switcher). Every page reads through
 * it so switching country re-scopes lists, KPIs and charts at once.
 *
 * Amounts are only ever shown in one country's currency — the "all
 * countries" view shows counts instead of summing different currencies.
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
  readonly currency = computed(() => this.country()?.currency ?? '');
  readonly label = computed(() => this.country()?.name ?? 'كل الدول');

  constructor() {
    effect(() => {
      const id = this.selected();
      if (id !== ALL_COUNTRIES && !this.countries.byId(id)) this.selected.set(ALL_COUNTRIES);
      try { localStorage.setItem(STORAGE_KEY, this.selected()); } catch { /* storage unavailable */ }
    }, { allowSignalWrites: true });
  }

  select(id: string): void {
    this.selected.set(id);
  }

  filter<T extends { countryId: string }>(list: readonly T[]): T[] {
    const id = this.selected();
    return id === ALL_COUNTRIES ? [...list] : list.filter((x) => x.countryId === id);
  }

  private restore(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) || ALL_COUNTRIES;
    } catch {
      return ALL_COUNTRIES;
    }
  }
}
