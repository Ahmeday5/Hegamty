import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { PagedResponse } from '../../core/models/api-response.model';
import {
  CatalogFilter,
  CatalogService,
  CatalogServiceCreate,
  CatalogServiceUpdate,
  CountryPricingDraft,
  DurationPriceDraft,
  PageMeta,
  PageRequest,
  PricingGovernorate,
  PricingUpdate,
  ServicePricing,
} from './service-catalog.models';

// ─────────── wire format ───────────

interface GovernorateDto {
  id: number;
  name: string;
  nameEn: string | null;
}

interface PricingDto {
  id: number;
  countryId: number;
  countryName: string | null;
  currency: string | null;
  hasDuration?: boolean;
  durationMinutes: number | null;
  priceMin: number;
  priceMax: number;
  governorates: GovernorateDto[] | null;
}

interface CatalogServiceDto {
  id: number;
  sectionId: number;
  sectionName: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  pricings: PricingDto[] | null;
}

interface DurationPriceBody {
  hasDuration: boolean;
  durationMinutes: number;
  priceMin: number;
  priceMax: number;
}

export interface CatalogPage {
  items: CatalogService[];
  page: PageMeta;
}

const ENDPOINT = 'admin/service-catalog';
const collator = new Intl.Collator('ar');

// ─────────── mapping ───────────

function toGovernorate(dto: GovernorateDto): PricingGovernorate {
  return { id: String(dto.id), name: dto.name?.trim() ?? '', nameEn: dto.nameEn?.trim() ?? '' };
}

function toPricing(dto: PricingDto): ServicePricing {
  const minutes = Number(dto.durationMinutes) || 0;
  const hasDuration = dto.hasDuration ?? minutes > 0;
  return {
    id: String(dto.id),
    countryId: String(dto.countryId),
    countryName: dto.countryName?.trim() ?? '',
    currency: dto.currency?.trim() ?? '',
    durationMin: hasDuration && minutes > 0 ? minutes : null,
    priceMin: Number(dto.priceMin) || 0,
    priceMax: Number(dto.priceMax) || 0,
    governorates: (dto.governorates ?? []).map(toGovernorate).sort((a, b) => collator.compare(a.name, b.name)),
  };
}

/** Open-ended sessions sort after timed ones. */
const byDuration = (a: ServicePricing, b: ServicePricing) =>
  (a.durationMin ?? Number.MAX_SAFE_INTEGER) - (b.durationMin ?? Number.MAX_SAFE_INTEGER);

function toService(dto: CatalogServiceDto): CatalogService {
  return {
    id: String(dto.id),
    sectionId: String(dto.sectionId),
    sectionName: dto.sectionName?.trim() ?? '',
    name: dto.name?.trim() ?? '',
    description: dto.description?.trim() ?? '',
    active: !!dto.isActive,
    pricings: (dto.pricings ?? [])
      .map(toPricing)
      .sort((a, b) => collator.compare(a.countryName, b.countryName) || byDuration(a, b)),
  };
}

function toPage(paged: PagedResponse<CatalogServiceDto>, req: PageRequest): CatalogPage {
  return {
    items: paged.data.map(toService),
    page: {
      pageIndex: paged.pageIndex || req.pageIndex,
      pageSize: paged.pageSize || req.pageSize,
      count: paged.count,
      totalPages: Math.max(1, paged.totalPages),
    },
  };
}

/** Open-ended sessions are sent with `hasDuration: false` and a zero duration. */
function toDurationPriceBody(p: DurationPriceDraft): DurationPriceBody {
  return {
    hasDuration: p.durationMin !== null,
    durationMinutes: p.durationMin ?? 0,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
  };
}

function toCountryPricingBody(p: CountryPricingDraft) {
  return {
    countryId: Number(p.countryId),
    governorateIds: p.governorateIds.map(Number),
    durationPrices: p.prices.map(toDurationPriceBody),
  };
}

function toServiceBody(s: CatalogServiceUpdate) {
  return { sectionId: Number(s.sectionId), name: s.name, description: s.description, isActive: s.active };
}

function toParams(filter: CatalogFilter, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: filter.name.trim() || null,
    sectionId: filter.sectionId,
    countryId: filter.countryId,
    governorateId: filter.governorateId,
    isActive: filter.active,
  };
}

/**
 * HTTP boundary for the service catalog. Every pricing mutation responds with
 * the whole service, so callers always get a fresh `CatalogService` back.
 * Mutations use inline handling — the calling UI owns spinner and message.
 */
@Injectable({ providedIn: 'root' })
export class ServiceCatalogApi {
  private readonly api = inject(ApiService);

  /** One server page for the given filters. */
  list(filter: CatalogFilter, page: PageRequest): Observable<CatalogPage> {
    return this.api
      .get<unknown>(ENDPOINT, { params: toParams(filter, page) })
      .pipe(map((res) => toPage(asPaged<CatalogServiceDto>(res), page)));
  }

  /** Every page, drained — for aggregates (e.g. per-country counts). Silent: no loader / toast. */
  listAll(filter: CatalogFilter): Observable<CatalogService[]> {
    const context: HttpContext = withInlineHandling();
    return fetchAllPages((pageIndex, pageSize) =>
      this.api
        .get<unknown>(ENDPOINT, { params: toParams(filter, { pageIndex, pageSize }), context })
        .pipe(map((res) => asPaged<CatalogServiceDto>(res))),
    ).pipe(map((list) => list.map(toService)));
  }

  create(body: CatalogServiceCreate): Observable<CatalogService> {
    const payload = { ...toServiceBody(body), pricings: body.pricings.map(toCountryPricingBody) };
    return this.api.post<CatalogServiceDto>(ENDPOINT, payload, { context: withInlineHandling() }).pipe(map(toService));
  }

  update(id: string, body: CatalogServiceUpdate): Observable<CatalogService> {
    return this.api
      .put<CatalogServiceDto>(`${ENDPOINT}/${id}`, toServiceBody(body), { context: withInlineHandling() })
      .pipe(map(toService));
  }

  remove(id: string): Observable<void> {
    return this.api.delete<unknown>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(() => undefined));
  }

  /** Adds a country (or more durations for one) with its governorates. */
  addPricing(serviceId: string, pricing: CountryPricingDraft): Observable<CatalogService> {
    return this.api
      .post<CatalogServiceDto>(`${ENDPOINT}/${serviceId}/pricing`, toCountryPricingBody(pricing), { context: withInlineHandling() })
      .pipe(map(toService));
  }

  updatePricing(serviceId: string, pricingId: string, pricing: PricingUpdate): Observable<CatalogService> {
    const body = { ...toDurationPriceBody(pricing), governorateIds: pricing.governorateIds.map(Number) };
    return this.api
      .put<CatalogServiceDto>(`${ENDPOINT}/${serviceId}/pricing/${pricingId}`, body, { context: withInlineHandling() })
      .pipe(map(toService));
  }

  removePricing(serviceId: string, pricingId: string): Observable<CatalogService> {
    return this.api
      .delete<CatalogServiceDto>(`${ENDPOINT}/${serviceId}/pricing/${pricingId}`, { context: withInlineHandling() })
      .pipe(map(toService));
  }
}
