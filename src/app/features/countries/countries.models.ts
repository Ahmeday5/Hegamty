import { Tone } from '../../shared/components/kpi-card/kpi-card.component';

/**
 * A market the platform operates in. Every customer, technician, driver,
 * service and booking belongs to exactly one country, and the mobile app
 * shows a customer only what exists in the country they picked.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. "SA" — also the API key. */
  id: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  /** International dialing prefix, e.g. "+966". */
  phoneCode: string;
  /** Digits in a local mobile number (validation + placeholders). */
  phoneLength: number;
  /** 0.15 = 15% VAT applied to bookings. */
  vatRate: number;
  /** Value of 1 unit of this currency in the base currency (reporting only). */
  rateToBase: number;
  cities: string[];
  /** Inactive countries are hidden from the app but keep their data. */
  active: boolean;
  tone: Tone;
  createdAt: string;
}

export type CountryDraft = Omit<Country, 'createdAt'>;

/** Reporting currency used when figures from several countries are combined. */
export const BASE_CURRENCY = { code: 'SAR', symbol: 'ر.س', countryId: 'SA' } as const;
