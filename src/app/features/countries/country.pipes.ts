import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatNumber } from '../../shared/utils/format.util';
import { CountriesStore } from './countries.store';
import { CountryScopeService } from './country-scope.service';

/**
 * `{{ amount | cmoney: record.countryId }}` — an amount in the currency of the
 * country it belongs to. Impure so a currency edit on the countries page is
 * reflected immediately (the transform is a map lookup + number format).
 */
@Pipe({ name: 'cmoney', standalone: true, pure: false })
export class CountryMoneyPipe implements PipeTransform {
  private readonly countries = inject(CountriesStore);

  transform(value: number | null | undefined, countryId: string, decimals = 0): string {
    return `${formatNumber(value ?? 0, decimals)} ${this.countries.symbol(countryId)}`.trim();
  }
}

/**
 * `{{ total | smoney }}` — an amount already expressed in the current scope
 * currency (see `CountryScopeService.sum`), labelled with that currency.
 */
@Pipe({ name: 'smoney', standalone: true, pure: false })
export class ScopeMoneyPipe implements PipeTransform {
  private readonly scope = inject(CountryScopeService);

  transform(value: number | null | undefined): string {
    return `${formatNumber(value ?? 0)} ${this.scope.currency()}`;
  }
}

/** `{{ record.countryId | countryName }}` */
@Pipe({ name: 'countryName', standalone: true, pure: false })
export class CountryNamePipe implements PipeTransform {
  private readonly countries = inject(CountriesStore);

  transform(countryId: string | null | undefined): string {
    return this.countries.byId(countryId)?.name ?? '—';
  }
}

/** `{{ record.countryId | ccy }}` — just the symbol (not `currency`, which Angular's CommonModule owns). */
@Pipe({ name: 'ccy', standalone: true, pure: false })
export class CountryCurrencyPipe implements PipeTransform {
  private readonly countries = inject(CountriesStore);

  transform(countryId: string | null | undefined): string {
    return countryId ? this.countries.symbol(countryId) : '';
  }
}

export const COUNTRY_PIPES = [CountryMoneyPipe, ScopeMoneyPipe, CountryNamePipe, CountryCurrencyPipe] as const;
