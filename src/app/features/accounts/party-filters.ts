import { Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CountriesStore } from '../countries/countries.store';
import { ALL_COUNTRIES, CountryScopeService } from '../countries/country-scope.service';
import { AccountLocationFilter } from './account-profile';
import { AccountKind } from './account-options.service';

/** One side of a booking / review: where the account is, and optionally which account. */
export interface PartyFilter {
  countryId: string | null;
  governorateId: string | null;
  accountId: string | null;
}

export type PartyFilters = Record<AccountKind, PartyFilter>;

const EMPTY: PartyFilter = { countryId: null, governorateId: null, accountId: null };

/** URL params per side — `client` / `specialist` stay readable for the profile links. */
const PARAMS: Record<AccountKind, Record<keyof PartyFilter, string>> = {
  client: { countryId: 'cc', governorateId: 'cg', accountId: 'client' },
  specialist: { countryId: 'sc', governorateId: 'sg', accountId: 'specialist' },
};

const idParam = (v: string | null): string | null => (v && /^\d+$/.test(v) ? v : null);

export const partyLocation = (f: PartyFilter): AccountLocationFilter => ({
  countryId: f.countryId,
  governorateId: f.countryId ? f.governorateId : null,
});

/** Query params that open a list filtered on one account (profile → bookings / reviews). */
export function accountFilterParams(kind: AccountKind, accountId: string, countryId: string | null): Record<string, string> {
  const p = PARAMS[kind];
  return countryId ? { [p.accountId]: accountId, [p.countryId]: countryId } : { [p.accountId]: accountId };
}

/**
 * Client + technician filters of a list page (country → governorate →
 * account on each side), seeded from the URL. Feed `params` to the list
 * controller's `extraParams` so they're mirrored in the URL and reset paging.
 *
 * The header's country switcher stays in charge: switching it re-scopes
 * both sides to that country (and clears their governorate / account).
 * Create it in a component field initializer (it needs an injection context).
 */
export class PartyFiltersState {
  private readonly scope = inject(CountryScopeService);
  private readonly countries = inject(CountriesStore);

  private readonly state = signal<PartyFilters>(this.restore());
  readonly value: Signal<PartyFilters> = this.state.asReadonly();

  readonly params = computed(() => {
    const out: Record<string, string | null> = {};
    for (const kind of ['client', 'specialist'] as const) {
      const f = this.state()[kind];
      out[PARAMS[kind].countryId] = f.countryId;
      out[PARAMS[kind].governorateId] = f.governorateId;
      out[PARAMS[kind].accountId] = f.accountId;
    }
    return out;
  });

  /** Anything beyond the default (both sides on the header's country) — i.e. what `reset()` would clear. */
  readonly hasAny = computed(() => {
    const { client, specialist } = this.state();
    const scoped = this.defaultCountry();
    return [client, specialist].some((f) => f.countryId !== scoped || !!f.governorateId || !!f.accountId);
  });

  constructor() {
    // Header switcher changed → both sides follow it (skips the initial run).
    let lastScope = this.scope.selected();
    effect(
      () => {
        const selected = this.scope.selected();
        if (selected === lastScope) return;
        lastScope = selected;
        const countryId = selected === ALL_COUNTRIES || !this.countries.byId(selected) ? null : selected;
        untracked(() => this.state.set({ client: { ...EMPTY, countryId }, specialist: { ...EMPTY, countryId } }));
      },
      { allowSignalWrites: true },
    );

    // Drop a governorate that isn't in its side's country (stale link, edited country).
    effect(
      () => {
        if (!this.countries.loaded()) return;
        const current = this.state();
        const clean = (f: PartyFilter): PartyFilter => {
          const country = this.countries.byId(f.countryId);
          const countryId = country ? f.countryId : null;
          const governorateId = country?.governorates.some((g) => g.id === f.governorateId) ? f.governorateId : null;
          return countryId === f.countryId && governorateId === f.governorateId ? f : { ...f, countryId, governorateId };
        };
        const next = { client: clean(current.client), specialist: clean(current.specialist) };
        if (next.client !== current.client || next.specialist !== current.specialist) untracked(() => this.state.set(next));
      },
      { allowSignalWrites: true },
    );
  }

  set(next: PartyFilters): void {
    this.state.set(next);
  }

  /** Keeps the header's country on both sides; clears everything else. */
  reset(): void {
    const countryId = this.defaultCountry();
    this.state.set({ client: { ...EMPTY, countryId }, specialist: { ...EMPTY, countryId } });
  }

  private defaultCountry(): string | null {
    return this.scope.isAll() ? null : this.scope.selected();
  }

  private restore(): PartyFilters {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const scoped = this.defaultCountry();
    const read = (kind: AccountKind): PartyFilter => {
      const p = PARAMS[kind];
      const accountId = idParam(params.get(p.accountId));
      // An account link without a country (older links) must not inherit the header's — it'd hide the account.
      const countryId = params.has(p.countryId) ? idParam(params.get(p.countryId)) : accountId ? null : scoped;
      return { countryId, governorateId: countryId ? idParam(params.get(p.governorateId)) : null, accountId };
    };
    return { client: read('client'), specialist: read('specialist') };
  }
}
