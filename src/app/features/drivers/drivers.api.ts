import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { Driver, DriverCounts, DriverFilter, NO_DRIVER_FILTER } from './drivers.models';

// ─────────── wire format ───────────

interface DriverDto {
  id: number;
  fullName: string | null;
  phone: string | null;
  nationalIdNumber: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleType: string | null;
  plateNumber: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
  isBanned: boolean;
  createdAt: string | null;
}

const ENDPOINT = 'admin/drivers';

// ─────────── mapping ───────────

const text = (v: string | null | undefined) => v?.trim() ?? '';

function toDriver(dto: DriverDto): Driver {
  return {
    id: String(dto.id),
    fullName: text(dto.fullName) || '—',
    phone: text(dto.phone),
    nationalIdNumber: text(dto.nationalIdNumber),
    vehicle: {
      model: text(dto.vehicleModel),
      color: text(dto.vehicleColor),
      type: text(dto.vehicleType),
      plate: text(dto.plateNumber),
    },
    photoUrl: resolveAssetUrl(dto.profileImageUrl),
    active: !!dto.isActive,
    available: !!dto.isAvailable,
    banned: !!dto.isBanned,
    createdAt: parseApiDate(dto.createdAt),
  };
}

function toParams(f: DriverFilter, page: PageRequest): Record<string, unknown> {
  return {
    PageIndex: page.pageIndex,
    PageSize: page.pageSize,
    name: f.name,
    phone: f.phone,
    isActive: f.active,
    isBanned: f.banned,
  };
}

/**
 * HTTP boundary for drivers. Reads are silent (the pages render their own
 * loading / error states); ban / unban use inline handling too — the caller
 * owns spinner and message. Actions respond with `data: null`.
 */
@Injectable({ providedIn: 'root' })
export class DriversApi {
  private readonly api = inject(ApiService);

  list(filter: DriverFilter, page: PageRequest): Observable<Page<Driver>> {
    return this.getPage(filter, page).pipe(map((paged) => ({ items: paged.data.map(toDriver), page: toPageMeta(paged, page) })));
  }

  /** Every page for the filters, drained (exports). */
  listAll(filter: DriverFilter): Observable<Driver[]> {
    return fetchAllPages((pageIndex, pageSize) => this.getPage(filter, { pageIndex, pageSize })).pipe(map((list) => list.map(toDriver)));
  }

  /** Totals behind the KPIs and tabs — one single-row page each, read from `count`. */
  counts(): Observable<DriverCounts> {
    const countOf = (f: Partial<DriverFilter>) =>
      this.getPage({ ...NO_DRIVER_FILTER, ...f }, { pageIndex: 1, pageSize: 1 }).pipe(map((p) => p.count));
    return forkJoin({
      all: countOf({}),
      active: countOf({ active: true }),
      inactive: countOf({ active: false }),
      banned: countOf({ banned: true }),
    });
  }

  byId(id: string): Observable<Driver> {
    return this.api.get<DriverDto>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(toDriver));
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

  private getPage(filter: DriverFilter, page: PageRequest) {
    return this.api
      .get<unknown>(ENDPOINT, { params: toParams(filter, page), context: withInlineHandling() })
      .pipe(map((res) => asPaged<DriverDto>(res)));
  }
}
