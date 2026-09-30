import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { Client, ClientCounts, ClientFilter } from './clients.models';

// ─────────── wire format ───────────

interface ClientDto {
  id: number;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  isActive: boolean;
  isBanned: boolean;
  governorateName: string | null;
  countryName: string | null;
  profileImage: string | null;
  createdAt: string | null;
}

const ENDPOINT = 'admin/clients';

// ─────────── mapping ───────────

function toClient(dto: ClientDto): Client {
  return {
    id: String(dto.id),
    fullName: dto.fullName?.trim() || '—',
    phone: dto.phone?.trim() ?? '',
    email: dto.email?.trim() ?? '',
    age: dto.age && dto.age > 0 ? dto.age : null,
    active: !!dto.isActive,
    banned: !!dto.isBanned,
    countryName: dto.countryName?.trim() ?? '',
    governorateName: dto.governorateName?.trim() ?? '',
    photoUrl: resolveAssetUrl(dto.profileImage),
    createdAt: parseApiDate(dto.createdAt),
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

  /** Totals per activity — one single-row page each, read from `count`. */
  counts(): Observable<ClientCounts> {
    const countOf = (active: boolean | null) =>
      this.api
        .get<unknown>(ENDPOINT, {
          params: toParams({ name: null, phone: null, active }, { pageIndex: 1, pageSize: 1 }),
          context: withInlineHandling(),
        })
        .pipe(map((res) => asPaged<ClientDto>(res).count));
    return forkJoin({ all: countOf(null), active: countOf(true), inactive: countOf(false) });
  }

  byId(id: string): Observable<Client> {
    return this.api.get<ClientDto>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(toClient));
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
