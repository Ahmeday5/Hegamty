import { Injectable, inject } from '@angular/core';
import { foldText } from '../../shared/utils/text-normalize.util';
import { CountriesStore } from '../countries/countries.store';
import { AccountPlace } from './account-profile';

export interface RawPlace {
  countryId?: number | null;
  countryName?: string | null;
  governorateId?: number | null;
  governorateName?: string | null;
}

const idOf = (n: number | null | undefined): string | null => (n && n > 0 ? String(n) : null);

/**
 * Completes a place that an endpoint references by name only (bookings,
 * reviews): ids and Arabic names come from the countries catalog, matched in
 * either language. Ids win when the server sends them; unknown names are kept as-is.
 */
@Injectable({ providedIn: 'root' })
export class PlaceResolver {
  private readonly countries = inject(CountriesStore);

  resolve(raw: RawPlace): AccountPlace {
    const countryName = raw.countryName?.trim() ?? '';
    const governorateName = raw.governorateName?.trim() ?? '';
    const country = this.countries.byId(idOf(raw.countryId)) ?? this.countries.byName(countryName);

    const govId = idOf(raw.governorateId);
    const govKey = foldText(governorateName);
    const governorate = country?.governorates.find(
      (g) => (govId && g.id === govId) || (!!govKey && (foldText(g.name) === govKey || foldText(g.nameEn) === govKey)),
    );

    return {
      country: country
        ? { id: country.id, name: country.name }
        : countryName || idOf(raw.countryId)
          ? { id: idOf(raw.countryId), name: countryName }
          : null,
      governorate: governorate
        ? { id: governorate.id, name: governorate.name }
        : governorateName || govId
          ? { id: govId, name: governorateName }
          : null,
    };
  }
}
