import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asList, asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import {
  SPECIALIST_STATUSES,
  Specialist,
  SpecialistCounts,
  SpecialistFilter,
  SpecialistService,
  SpecialistStatus,
} from './specialists.models';

// ─────────── wire format ───────────

type StatusDto = 'Pending' | 'Approved' | 'Rejected';

interface SpecialistDto {
  id: number;
  fullName: string | null;
  phone: string | null;
  age: number | null;
  yearsOfExperience: number | null;
  description: string | null;
  status: StatusDto;
  isBanned: boolean;
  nationalIdFrontUrl: string | null;
  nationalIdBackUrl: string | null;
  nationalIdWithPersonUrl: string | null;
  profileImageUrl: string | null;
}

interface SpecialistServiceDto {
  id: number;
  serviceCatalogPricingId: number;
  name: string | null;
  sectionName: string | null;
  countryName: string | null;
  currency: string | null;
  price: number;
  priceMin: number;
  priceMax: number;
  durationMinutes: number | null;
  description: string | null;
}

/** Review decisions, bans and lifts share one `POST /{id}/{action}` shape. */
type SpecialistAction = 'approve' | 'reject' | 'ban' | 'unban';

const ENDPOINT = 'admin/specialists';

const STATUS_TO_WIRE: Record<SpecialistStatus, StatusDto> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};
const STATUS_FROM_WIRE: Record<StatusDto, SpecialistStatus> = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
};

// ─────────── mapping ───────────

function toSpecialist(dto: SpecialistDto): Specialist {
  return {
    id: String(dto.id),
    fullName: dto.fullName?.trim() || '—',
    phone: dto.phone?.trim() ?? '',
    age: dto.age && dto.age > 0 ? dto.age : null,
    experienceYears: Math.max(0, Number(dto.yearsOfExperience) || 0),
    description: dto.description?.trim() ?? '',
    status: STATUS_FROM_WIRE[dto.status] ?? 'pending',
    banned: !!dto.isBanned,
    photoUrl: resolveAssetUrl(dto.profileImageUrl),
    documents: {
      idFront: resolveAssetUrl(dto.nationalIdFrontUrl),
      idBack: resolveAssetUrl(dto.nationalIdBackUrl),
      idWithPerson: resolveAssetUrl(dto.nationalIdWithPersonUrl),
    },
  };
}

function toService(dto: SpecialistServiceDto): SpecialistService {
  const minutes = Number(dto.durationMinutes) || 0;
  return {
    id: String(dto.id),
    pricingId: String(dto.serviceCatalogPricingId),
    name: dto.name?.trim() ?? '',
    sectionName: dto.sectionName?.trim() ?? '',
    countryName: dto.countryName?.trim() ?? '',
    currency: dto.currency?.trim() ?? '',
    price: Number(dto.price) || 0,
    priceMin: Number(dto.priceMin) || 0,
    priceMax: Number(dto.priceMax) || 0,
    durationMin: minutes > 0 ? minutes : null,
    description: dto.description?.trim() ?? '',
  };
}

/** `banned` isn't a server param — it's applied by the store. */
function toParams(filter: Omit<SpecialistFilter, 'banned'>, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: filter.name,
    phone: filter.phone,
    status: filter.status ? STATUS_TO_WIRE[filter.status] : null,
  };
}

/**
 * HTTP boundary for technicians. Reads are silent (the pages render their
 * own loading/error states); actions use inline handling — the caller owns
 * spinner and message. Actions respond with `data: null`, so callers apply
 * the known outcome locally.
 */
@Injectable({ providedIn: 'root' })
export class SpecialistsApi {
  private readonly api = inject(ApiService);

  list(filter: Omit<SpecialistFilter, 'banned'>, page: PageRequest): Observable<Page<Specialist>> {
    return this.api.get<unknown>(ENDPOINT, { params: toParams(filter, page), context: withInlineHandling() }).pipe(
      map((res) => {
        const paged = asPaged<SpecialistDto>(res);
        return { items: paged.data.map(toSpecialist), page: toPageMeta(paged, page) };
      }),
    );
  }

  /** Every page for the filters, drained (exports). */
  listAll(filter: Omit<SpecialistFilter, 'banned'>): Observable<Specialist[]> {
    return fetchAllPages((pageIndex, pageSize) =>
      this.api
        .get<unknown>(ENDPOINT, { params: toParams(filter, { pageIndex, pageSize }), context: withInlineHandling() })
        .pipe(map((res) => asPaged<SpecialistDto>(res))),
    ).pipe(map((list) => list.map(toSpecialist)));
  }

  /** Totals per review status — one single-row page each, read from `count`. */
  counts(): Observable<SpecialistCounts> {
    const countOf = (status: SpecialistStatus | null) =>
      this.api
        .get<unknown>(ENDPOINT, {
          params: toParams({ name: null, phone: null, status }, { pageIndex: 1, pageSize: 1 }),
          context: withInlineHandling(),
        })
        .pipe(map((res) => asPaged<SpecialistDto>(res).count));
    return forkJoin({
      all: countOf(null),
      ...(Object.fromEntries(SPECIALIST_STATUSES.map((s) => [s, countOf(s)])) as Record<SpecialistStatus, Observable<number>>),
    });
  }

  byId(id: string): Observable<Specialist> {
    return this.api.get<SpecialistDto>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(toSpecialist));
  }

  services(id: string): Observable<SpecialistService[]> {
    return this.api
      .get<unknown>(`${ENDPOINT}/${id}/services`, { context: withInlineHandling() })
      .pipe(map((res) => asList<SpecialistServiceDto>(res).map(toService)));
  }

  approve(id: string): Observable<void> {
    return this.act(id, 'approve');
  }

  reject(id: string): Observable<void> {
    return this.act(id, 'reject');
  }

  ban(id: string): Observable<void> {
    return this.act(id, 'ban');
  }

  unban(id: string): Observable<void> {
    return this.act(id, 'unban');
  }

  private act(id: string, action: SpecialistAction): Observable<void> {
    return this.api
      .post<unknown>(`${ENDPOINT}/${id}/${action}`, null, { context: withInlineHandling() })
      .pipe(map(() => undefined));
  }
}
