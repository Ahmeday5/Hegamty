import { Pipe, PipeTransform } from '@angular/core';
import { formatNumber } from '../../shared/utils/format.util';

/** "100 – 300 جنيه مصري", or "150 ريال سعودي" when min = max. */
export function formatPriceRange(min: number, max: number, currency: string): string {
  const range = min === max ? formatNumber(min) : `${formatNumber(min)} – ${formatNumber(max)}`;
  return `${range} ${currency}`.trim();
}

/** Arabic count agreement: "دقيقة واحدة" · "دقيقتان" · "5 دقائق" · "30 دقيقة". */
export function formatMinutes(value: number): string {
  if (value === 1) return 'دقيقة واحدة';
  if (value === 2) return 'دقيقتان';
  const mod = value % 100;
  return `${formatNumber(value)} ${mod >= 3 && mod <= 10 ? 'دقائق' : 'دقيقة'}`;
}

/** "دولة واحدة" · "دولتان" · "5 دول" · "12 دولة". */
export function formatCountries(count: number): string {
  if (count === 1) return 'دولة واحدة';
  if (count === 2) return 'دولتان';
  const mod = count % 100;
  return `${formatNumber(count)} ${mod >= 3 && mod <= 10 ? 'دول' : 'دولة'}`;
}

/** `{{ p | priceRange }}` for any `{ priceMin, priceMax, currency }`. */
@Pipe({ name: 'priceRange', standalone: true })
export class PriceRangePipe implements PipeTransform {
  transform(p: { priceMin: number; priceMax: number; currency: string } | null | undefined): string {
    return p ? formatPriceRange(p.priceMin, p.priceMax, p.currency) : '';
  }
}

/** `{{ p.durationMin | minutes }}` — `null` is an open-ended session. */
@Pipe({ name: 'minutes', standalone: true })
export class MinutesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value ? formatMinutes(value) : 'مدة مفتوحة';
  }
}

export const CATALOG_PIPES = [PriceRangePipe, MinutesPipe] as const;
