import { Country } from '../../../countries/countries.models';
import { countDivisions } from '../../../countries/country-registry';

/**
 * Human label for how much of a country a pricing covers, in the country's
 * own wording: "كل المحافظات" · "كل الولايات" · "5 مناطق" · "محافظة واحدة".
 */
export function coverageLabel(count: number, country: Country | undefined): string {
  if (!country) return count ? `${count}` : '—';
  const total = country.governorates.length;
  if (total > 0 && count >= total) return `كل ال${country.division.plural}`;
  return countDivisions(count, country.division);
}

export function coversAll(count: number, country: Country | undefined): boolean {
  return !!country && country.governorates.length > 0 && count >= country.governorates.length;
}
