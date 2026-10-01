import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asList, asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { ANY_LOCATION, AccountLocationFilter } from '../accounts/account-profile';
import { locationParams, toGender, toGeoPoint, toPlace } from '../accounts/account-wire';
import { Client, ClientAddress, ClientCounts, ClientFilter } from './clients.models';

// ─────────── wire format ───────────

interface ClientDto {
  id: number;
  fullName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  nationalIdUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  isBanned: boolean;
  /** English. */
  governorateName: string | null;
  governorateNameAr: string | null;
  governorateId: number | null;
  /** Arabic. */
  countryName: string | null;
  countryNameEn: string | null;
  residentCountryId: number | null;
  /** Arabic. */
  nationalityCountryName: string | null;
  nationalityCountryNameEn: string | null;
  nationalityCountryId: number | null;
  profileImage: string | null;
  createdAt: string | null;
}

interface ClientAddressDto {
  id: number;
  label: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  addressText: string | null;
  notes: string | null;
}

const ENDPOINT = 'admin/clients';

// ─────────── mapping ───────────

function toClient(dto: ClientDto): Client {
  return {
    id: String(dto.id),
    fullName: dto.fullName?.trim() || '—',
    phone: dto.phone?.trim() ?? '',
    email: dto.email?.trim() ?? '',
    gender: toGender(dto.gender),
    age: dto.age && dto.age > 0 ? dto.age : null,
    address: dto.address?.trim() ?? '',
    active: !!dto.isActive,
    banned: !!dto.isBanned,
    residence: {
      country: toPlace(dto.residentCountryId, dto.countryName, dto.countryNameEn),
      governorate: toPlace(dto.governorateId, dto.governorateNameAr, dto.governorateName),
    },
    nationality: toPlace(dto.nationalityCountryId, dto.nationalityCountryName, dto.nationalityCountryNameEn),
    position: toGeoPoint(dto.latitude, dto.longitude),
    photoUrl: resolveAssetUrl(dto.profileImage),
    nationalIdUrl: resolveAssetUrl(dto.nationalIdUrl),
    createdAt: parseApiDate(dto.createdAt),
  };
}

function toAddress(dto: ClientAddressDto): ClientAddress {
  return {
    id: String(dto.id),
    label: dto.label?.trim() ?? '',
    phone: dto.phone?.trim() ?? '',
    text: dto.addressText?.trim() ?? '',
    notes: dto.notes?.trim() ?? '',
    position: toGeoPoint(dto.latitude, dto.longitude),
  };
}

/** `banned` isn't a server param — it's applied by the store. */
function toParams(filter: Omit<ClientFilter, 'banned'>, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: filter.name,
    phone: filter.phone,
    isActive: filter.active,
    ...locationParams(filter),
  };
}

/**
 * HTTP boundary for customers. Reads are silent (the pages render their own
 * loading/error states); actions use inline handling — the caller owns
 * spinner and message. Actions respond with `data: null`.
 */
@Injectable({ providedIn: 'root' })
export class ClientsApi {
  private readonly api = inject(ApiService);

  list(filter: Omit<ClientFilter, 'banned'>, page: PageRequest): Observable<Page<Client>> {
    return this.api.get<unknown>(ENDPOINT, { params: toParams(filter, page), context: withInlineHandling() }).pipe(
      map((res) => {
        const paged = asPaged<ClientDto>(res);
        return { items: paged.data.map(toClient), page: toPageMeta(paged, page) };
      }),
    );
  }

  /** Every page for the filters, drained (exports). */
  listAll(filter: Omit<ClientFilter, 'banned'>): Observable<Client[]> {
    return fetchAllPages((pageIndex, pageSize) =>
      this.api
        .get<unknown>(ENDPOINT, { params: toParams(filter, { pageIndex, pageSize }), context: withInlineHandling() })
        .pipe(map((res) => asPaged<ClientDto>(res))),
    ).pipe(map((list) => list.map(toClient)));
  }

  /** Totals per activity within a residence area — one single-row page each, read from `count`. */
  counts(location: AccountLocationFilter = ANY_LOCATION): Observable<ClientCounts> {
    const countOf = (active: boolean | null) =>
      this.api
        .get<unknown>(ENDPOINT, {
          params: toParams({ name: null, phone: null, active, ...location }, { pageIndex: 1, pageSize: 1 }),
          context: withInlineHandling(),
        })
        .pipe(map((res) => asPaged<ClientDto>(res).count));
    return forkJoin({ all: countOf(null), active: countOf(true), inactive: countOf(false) });
  }

  byId(id: string): Observable<Client> {
    return this.api.get<ClientDto>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(toClient));
  }

  /** Addresses the customer saved in the app. */
  addresses(id: string): Observable<ClientAddress[]> {
    return this.api
      .get<unknown>(`${ENDPOINT}/${id}/addresses`, { context: withInlineHandling() })
      .pipe(map((res) => asList<ClientAddressDto>(res).map(toAddress)));
  }

  ban(id: string): Observable<void> {
    return this.act(id, 'ban');
  }

  unban(id: string): Observable<void> {
    return this.act(id, 'unban');
  }

  private act(id: string, action: 'ban' | 'unban'): Observable<void> {
    return this.api
      .post<unknown>(`${ENDPOINT}/${id}/${action}`, null, { context: withInlineHandling() })
      .pipe(map(() => undefined));
  }
}
