import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asList } from '../../core/utils/api-list.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { CategoryDraft, SectionCountry, ServiceCategory } from './services.models';

// ─────────── wire format ───────────

interface SectionCountryDto {
  id: number;
  name: string;
  nameEn: string | null;
}

interface SectionDto {
  id: number;
  name: string;
  description: string | null;
  /** Server-relative image path, e.g. `/Images/Sections/Icons/…png`. */
  icon: string | null;
  isActive: boolean;
  countries: SectionCountryDto[] | null;
}

/** Server-side list filters; omitted keys aren't sent. */
export interface SectionQuery {
  name?: string;
  countryId?: string;
}

const ENDPOINT = 'admin/sections';
const collator = new Intl.Collator('ar');

function toCountry(dto: SectionCountryDto): SectionCountry {
  return { id: String(dto.id), name: dto.name?.trim() ?? '', nameEn: dto.nameEn?.trim() ?? '' };
}

function toCategory(dto: SectionDto): ServiceCategory {
  return {
    id: String(dto.id),
    name: dto.name?.trim() ?? '',
    description: dto.description?.trim() ?? '',
    iconUrl: resolveAssetUrl(dto.icon),
    active: !!dto.isActive,
    countries: (dto.countries ?? []).map(toCountry).sort((a, b) => collator.compare(a.name, b.name)),
  };
}

/**
 * The endpoint takes `multipart/form-data` (it carries the icon file). Field
 * names match the backend's model binder; arrays are sent as repeated keys.
 * No `Content-Type` is set — the browser adds it with the multipart boundary.
 */
function toFormData(draft: CategoryDraft): FormData {
  const fd = new FormData();
  fd.append('Name', draft.name);
  fd.append('Description', draft.description);
  fd.append('IsActive', String(draft.active));
  for (const id of draft.countryIds) fd.append('CountryIds', id);
  if (draft.iconFile) fd.append('IconImage', draft.iconFile, draft.iconFile.name);
  return fd;
}

/**
 * HTTP boundary for services sections (`/admin/sections`). Mutations use
 * inline handling — the calling UI owns its spinner and error message.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(ApiService);

  /** The full catalog (every picker needs all sections). */
  list(): Observable<ServiceCategory[]> {
    return this.api.get<unknown>(ENDPOINT).pipe(map((res) => asList<SectionDto>(res).map(toCategory)));
  }

  /** Server-side filtering — silent (no loader / toast) as it runs while typing. */
  search(query: SectionQuery): Observable<ServiceCategory[]> {
    return this.api
      .get<unknown>(ENDPOINT, { params: { name: query.name, countryId: query.countryId }, context: withInlineHandling() })
      .pipe(map((res) => asList<SectionDto>(res).map(toCategory)));
  }

  create(draft: CategoryDraft): Observable<ServiceCategory> {
    return this.api.post<SectionDto>(ENDPOINT, toFormData(draft), { context: withInlineHandling() }).pipe(map(toCategory));
  }

  update(id: string, draft: CategoryDraft): Observable<ServiceCategory> {
    return this.api
      .put<SectionDto>(`${ENDPOINT}/${id}`, toFormData(draft), { context: withInlineHandling() })
      .pipe(map(toCategory));
  }

  remove(id: string): Observable<void> {
    return this.api.delete<unknown>(`${ENDPOINT}/${id}`, { context: withInlineHandling() }).pipe(map(() => undefined));
  }
}
