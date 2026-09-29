import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asList } from '../../core/utils/api-list.util';
import { Country, CountryCreate, CountryUpdate, Governorate } from './countries.models';
import { resolveCountryMeta } from './country-registry';

// ─────────── wire format ───────────

interface GovernorateDto {
  id: number;
  name: string;
  nameEn: string | null;
  countryId: number;
}

interface CountryDto {
  id: number;
  name: string;
  nameEn: string | null;
  currency: string | null;
  governorates: GovernorateDto[] | null;
}

const ENDPOINT = 'admin/countries';
const collator = new Intl.Collator('ar');

function toGovernorate(dto: GovernorateDto): Governorate {
  return { id: String(dto.id), name: dto.name?.trim() ?? '', nameEn: dto.nameEn?.trim() ?? '' };
}

function toCountry(dto: CountryDto): Country {
  const name = dto.name?.trim() ?? '';
  const nameEn = dto.nameEn?.trim() ?? '';
  return {
    id: String(dto.id),
    name,
    nameEn,
    currency: dto.currency?.trim() ?? '',
    ...resolveCountryMeta(name, nameEn),
    governorates: (dto.governorates ?? []).map(toGovernorate).sort((a, b) => collator.compare(a.name, b.name)),
  };
}

/**
 * HTTP boundary for `/admin/countries`. Maps DTOs to the domain model so
 * nothing outside this file knows about numeric ids or nullable fields.
 *
 * Mutations use inline handling (no global loader / toast): the calling UI
 * shows its own button spinner and a context-aware error message.
 */
@Injectable({ providedIn: 'root' })
export class CountriesApi {
  private readonly api = inject(ApiService);

  list(): Observable<Country[]> {
    return this.api.get<unknown>(ENDPOINT).pipe(map((res) => asList<CountryDto>(res).map(toCountry)));
  }

  get(id: string): Observable<Country> {
    return this.api.get<CountryDto>(`${ENDPOINT}/${id}`).pipe(map(toCountry));
  }

  create(body: CountryCreate): Observable<Country> {
    return this.api.post<CountryDto>(ENDPOINT, body, { context: withInlineHandling() }).pipe(map(toCountry));
  }

  update(id: string, body: CountryUpdate): Observable<Country> {
    return this.api.put<CountryDto>(`${ENDPOINT}/${id}`, body, { context: withInlineHandling() }).pipe(map(toCountry));
  }

  remove(id: string): Observable<void> {
    return this.api.delete<unknown>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(() => undefined));
  }

  /** Appends governorates; the response is the whole country with its updated list. */
  addGovernorates(id: string, governorateNames: string[]): Observable<Country> {
    return this.api
      .post<CountryDto>(`${ENDPOINT}/${id}/governorates`, { governorateNames }, { context: withInlineHandling() })
      .pipe(map(toCountry));
  }
}
