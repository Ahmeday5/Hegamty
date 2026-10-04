import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { PackageCounts, PackageDraft, PackageFilter, TechPackage } from './packages.models';

// ─────────── wire format ───────────

interface PackageDto {
  id: number;
  countryId: number;
  countryName: string | null;
  currency: string | null;
  price: number | null;
  name: string | null;
  durationDays: number | null;
  description: string | null;
  features: string[] | null;
  isActive: boolean;
  isFeatured: boolean;
}

interface PackageBody {
  countryId: number;
  price: number;
  name: string;
  durationDays: number;
  description: string;
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
}

const ENDPOINT = 'admin/packages';

// ─────────── mapping ───────────

function toPackage(dto: PackageDto): TechPackage {
  return {
    id: String(dto.id),
    countryId: String(dto.countryId),
    countryName: dto.countryName?.trim() ?? '',
    currency: dto.currency?.trim() ?? '',
    name: dto.name?.trim() || '—',
    description: dto.description?.trim() ?? '',
    durationDays: Math.max(1, Math.round(Number(dto.durationDays) || 0)),
    price: Math.max(0, Number(dto.price) || 0),
    features: (dto.features ?? []).map((f) => f?.trim()).filter((f): f is string => !!f),
    featured: !!dto.isFeatured,
    active: !!dto.isActive,
  };
}

function toBody(d: PackageDraft): PackageBody {
  return {
    countryId: Number(d.countryId),
    price: d.price,
    name: d.name.trim(),
    durationDays: d.durationDays,
    description: d.description.trim(),
    features: d.features,
    isActive: d.active,
    isFeatured: d.featured,
  };
}

function toParams(f: PackageFilter, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: f.name,
    countryId: f.countryId,
    isActive: f.active,
  };
}

/**
 * HTTP boundary for technician packages. Everything uses inline handling —
 * the calling page owns spinners, empty/error states and messages.
 */
@Injectable({ providedIn: 'root' })
export class PackagesApi {
  private readonly api = inject(ApiService);

  list(filter: PackageFilter, page: PageRequest): Observable<Page<TechPackage>> {
    return this.getPage(filter, page).pipe(map((paged) => ({ items: paged.data.map(toPackage), page: toPageMeta(paged, page) })));
  }

  /** Every page for the filters, drained (exports). */
  listAll(filter: PackageFilter): Observable<TechPackage[]> {
    return fetchAllPages((pageIndex, pageSize) => this.getPage(filter, { pageIndex, pageSize })).pipe(map((list) => list.map(toPackage)));
  }

  /** Totals per status for a search/country — one single-row page each, read from `count`. */
  counts(filter: Omit<PackageFilter, 'active'>): Observable<PackageCounts> {
    const countOf = (active: boolean | null) => this.getPage({ ...filter, active }, { pageIndex: 1, pageSize: 1 }).pipe(map((p) => p.count));
    return forkJoin({ all: countOf(null), active: countOf(true), inactive: countOf(false) });
  }

  byId(id: string): Observable<TechPackage> {
    return this.api.get<PackageDto>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(toPackage));
  }

  create(draft: PackageDraft): Observable<TechPackage> {
    return this.api.post<PackageDto>(ENDPOINT, toBody(draft), { context: withInlineHandling() }).pipe(map(toPackage));
  }

  update(id: string, draft: PackageDraft): Observable<TechPackage> {
    return this.api.put<PackageDto>(`${ENDPOINT}/${id}`, toBody(draft), { context: withInlineHandling() }).pipe(map(toPackage));
  }

  remove(id: string): Observable<void> {
    return this.api.delete<unknown>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(() => undefined));
  }

  private getPage(filter: PackageFilter, page: PageRequest) {
    return this.api
      .get<unknown>(ENDPOINT, { params: toParams(filter, page), context: withInlineHandling() })
      .pipe(map((res) => asPaged<PackageDto>(res)));
  }
}
