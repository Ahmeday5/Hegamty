/**
 * Service catalog (`/admin/service-catalog`). A service is a template that
 * belongs to one section and is sold in any number of countries.
 *
 * Within a country, a service is offered in chosen governorates at one or
 * more durations, each with its own price range. The API *writes* that
 * grouped per country, but *reads* it back flattened — one `ServicePricing`
 * row per (country, duration), each carrying its governorates.
 */

/** Label of a session with no fixed length (`durationMin: null`). */
export const OPEN_DURATION_LABEL = 'مدة مفتوحة';

export interface PricingGovernorate {
  id: string;
  name: string;
  nameEn: string;
}

export interface ServicePricing {
  id: string;
  countryId: string;
  countryName: string;
  currency: string;
  /** Session length in minutes; `null` = open-ended (no fixed duration). */
  durationMin: number | null;
  priceMin: number;
  priceMax: number;
  /** Sorted by Arabic name. */
  governorates: PricingGovernorate[];
}

export interface CatalogService {
  id: string;
  sectionId: string;
  sectionName: string;
  name: string;
  description: string;
  active: boolean;
  /** Sorted by country name, then duration (open-ended last). */
  pricings: ServicePricing[];
}

/** Server-side list filters; `null` / empty = no constraint. */
export interface CatalogFilter {
  name: string;
  sectionId: string | null;
  countryId: string | null;
  governorateId: string | null;
  active: boolean | null;
}

export const NO_FILTER: CatalogFilter = { name: '', sectionId: null, countryId: null, governorateId: null, active: null };

export type { PageMeta, PageRequest } from '../../core/models/page.model';

// ─────────── write models ───────────

export interface DurationPriceDraft {
  /** `null` = open-ended session. */
  durationMin: number | null;
  priceMin: number;
  priceMax: number;
}

/** One country's offer: where (governorates) and at which durations/prices. */
export interface CountryPricingDraft {
  countryId: string;
  governorateIds: string[];
  prices: DurationPriceDraft[];
}

/** Editing a single pricing row (its country is fixed). */
export interface PricingUpdate extends DurationPriceDraft {
  governorateIds: string[];
}

export interface CatalogServiceCreate {
  sectionId: string;
  name: string;
  description: string;
  active: boolean;
  pricings: CountryPricingDraft[];
}

/** Pricings are managed through their own endpoints. */
export type CatalogServiceUpdate = Omit<CatalogServiceCreate, 'pricings'>;

/** Stable key for "same country + same duration" (the API rejects duplicates). */
export function durationKey(countryId: string, durationMin: number | null): string {
  return `${countryId}:${durationMin ?? 'open'}`;
}
