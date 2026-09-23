import { Pipe, PipeTransform } from '@angular/core';
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
} from '../utils/format.util';

@Pipe({ name: 'num', standalone: true })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 0): string {
    return formatNumber(value ?? 0, decimals);
  }
}

@Pipe({ name: 'compact', standalone: true })
export class CompactPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatCompact(value ?? 0);
  }
}

/** `{{ amount | money: 'ر.س' }}` — explicit currency; prefer `cmoney` for country-bound records. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, symbol = ''): string {
    return formatMoney(value ?? 0, symbol);
  }
}

@Pipe({ name: 'arDate', standalone: true })
export class ArDatePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, withTime = false): string {
    if (value === null || value === undefined || value === '') return '—';
    return withTime ? formatDateTime(value) : formatDate(value);
  }
}

/** Pure — relative labels are recomputed whenever the view is re-created. */
@Pipe({ name: 'relTime', standalone: true })
export class RelTimePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    return formatRelative(value);
  }
}

export const FORMAT_PIPES = [NumPipe, CompactPipe, MoneyPipe, ArDatePipe, RelTimePipe] as const;
