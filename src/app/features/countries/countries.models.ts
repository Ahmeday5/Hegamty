import { DivisionTerm } from './country-registry';

/** First-level administrative division (governorate / region / state …). */
export interface Governorate {
  id: string;
  name: string;
  nameEn: string;
}

/**
 * A market the platform operates in. Every customer, technician, driver,
 * service, package and booking belongs to exactly one country, and the
 * mobile app shows a user only what exists in the country they picked.
 */
export interface Country {
  /** Backend id, kept as a string because every record references it as `countryId`. */
  id: string;
  name: string;
  nameEn: string;
  /** Currency name shown next to amounts, e.g. "ريال سعودي". */
  currency: string;
  /** ISO 3166-1 alpha-2 resolved from the name — `null` for unknown countries. */
  iso: string | null;
  /** What this country calls its divisions (محافظات، مناطق، ولايات …). */
  division: DivisionTerm;
  /** Sorted alphabetically (Arabic collation). */
  governorates: Governorate[];
}

/** Payload for creating a country. */
export interface CountryCreate {
  name: string;
  nameEn: string;
  currency: string;
  governorateNames: string[];
}

/** Payload for editing a country's own fields (governorates are managed separately). */
export type CountryUpdate = Omit<CountryCreate, 'governorateNames'>;
