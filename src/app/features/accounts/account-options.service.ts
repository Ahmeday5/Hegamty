import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { ClientsApi } from '../clients/clients.api';
import { NO_CLIENT_FILTER } from '../clients/clients.models';
import { SpecialistsApi } from '../specialists/specialists.api';
import { NO_SPECIALIST_FILTER } from '../specialists/specialists.models';
import { AccountLocationFilter, locationKey } from './account-profile';

export type AccountKind = 'client' | 'specialist';

const collator = new Intl.Collator('ar');
const byLabel = (a: SearchableSelectOption, b: SearchableSelectOption) => collator.compare(a.label, b.label);

/**
 * Pick-lists of customers / technicians within a country (and optionally a
 * governorate), for the account filters of the bookings and reviews pages.
 * Each list is fetched once per location and shared; failures aren't cached.
 */
@Injectable({ providedIn: 'root' })
export class AccountOptionsService {
  private readonly clients = inject(ClientsApi);
  private readonly specialists = inject(SpecialistsApi);
  private readonly cache = new Map<string, Observable<SearchableSelectOption[]>>();

  options(kind: AccountKind, location: AccountLocationFilter): Observable<SearchableSelectOption[]> {
    const key = `${kind}|${locationKey(location)}`;
    let list = this.cache.get(key);
    if (!list) {
      list = this.fetch(kind, location).pipe(
        map((options) => options.sort(byLabel)),
        catchError((err) => {
          this.cache.delete(key);
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache.set(key, list);
    }
    return list;
  }

  /** Drop cached lists (e.g. on an explicit refresh). */
  invalidate(): void {
    this.cache.clear();
  }

  private fetch(kind: AccountKind, location: AccountLocationFilter): Observable<SearchableSelectOption[]> {
    const toOption = (a: { id: string; fullName: string; phone: string }): SearchableSelectOption => ({
      value: a.id,
      label: a.fullName,
      hint: a.phone || `#${a.id}`,
    });
    return kind === 'client'
      ? this.clients.listAll({ ...NO_CLIENT_FILTER, ...location }).pipe(map((rows) => rows.map(toOption)))
      : this.specialists.listAll({ ...NO_SPECIALIST_FILTER, ...location }).pipe(map((rows) => rows.map(toOption)));
  }
}
