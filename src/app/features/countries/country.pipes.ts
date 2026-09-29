import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatNumber } from '../../shared/utils/format.util';
import { CountriesStore } from './countries.store';
import { CountryScopeService } from './country-scope.service';
import { DivisionTerm, countDivisions } from './country-registry';

/**
 * `{{ amount | cmoney: record.countryId }}` — amount in its country's
 * currency. Impure so a currency edit on the countries page shows at once.
 */
@Pipe({ name: 'cmoney', standalone: true, pure: false })
export class CountryMoneyPipe implements PipeTransform {
  private readonly countries = inject(CountriesStore);

  transform(value: number | null | undefined, countryId: string): string {
    return `${formatNumber(value ?? 0)} ${this.countries.currency(countryId)}`.trim();
  }
}

/** `{{ total | smoney }}` — amount in the currently selected country's currency. */
@Pipe({ name: 'smoney', standalone: true, pure: false })
export class ScopeMoneyPipe implements PipeTransform {
  private readonly scope = inject(CountryScopeService);

  transform(value: number | null | undefined): string {
    return `${formatNumber(value ?? 0)} ${this.scope.currency()}`.trim();
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

/** `{{ record.countryId | ccy }}` — the currency name only. */
@Pipe({ name: 'ccy', standalone: true, pure: false })
export class CountryCurrencyPipe implements PipeTransform {
  private readonly countries = inject(CountriesStore);

  transform(countryId: string | null | undefined): string {
    return countryId ? this.countries.currency(countryId) : '';
  }
}

/** `{{ c.governorates.length | divisions: c.division }}` → "13 منطقة", "محافظتان", "5 ولايات". */
@Pipe({ name: 'divisions', standalone: true })
export class DivisionCountPipe implements PipeTransform {
  transform(count: number | null | undefined, term: DivisionTerm): string {
    return countDivisions(count ?? 0, term);
  }
}

export const COUNTRY_PIPES = [CountryMoneyPipe, ScopeMoneyPipe, CountryNamePipe, CountryCurrencyPipe, DivisionCountPipe] as const;
