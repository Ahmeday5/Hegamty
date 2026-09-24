/**
 * A market the platform operates in. Every customer, technician, driver,
 * service, package and booking belongs to exactly one country, and the
 * mobile app shows a user only what exists in the country they picked.
 */
export interface Country {
  /** Stable internal key (ISO code for seeded markets). */
  id: string;
  name: string;
  /** Currency name shown next to amounts, e.g. "ريال", "جنيه". */
  currency: string;
  /** International dialing code, e.g. "+966". */
  dialCode: string;
  cities: string[];
  createdAt: string;
}

export type CountryDraft = Pick<Country, 'name' | 'currency' | 'dialCode' | 'cities'>;
