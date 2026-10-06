import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { ApiError } from '../../core/models/api-response.model';
import { parseApiDate } from '../../core/utils/api-date.util';
import { resolveAssetUrl } from '../../core/utils/asset-url.util';
import { ContentImage, ContentPage, ContentPageKind, EMPTY_CONTENT_PAGE } from './content-pages.models';

// ─────────── wire format ───────────

interface ContentImageDto {
  id: number;
  imageUrl: string | null;
}

interface ContentPageDto {
  content: string | null;
  updatedAt: string | null;
  /** About-us only. */
  images?: ContentImageDto[] | null;
}

/** Public read path and admin write path of each page. */
const PATHS: Record<ContentPageKind, { read: string; write: string }> = {
  about: { read: 'about-us', write: 'admin/about-us' },
  privacy: { read: 'privacy-policy', write: 'admin/privacy-policy' },
};

// ─────────── mapping ───────────

function toImage(dto: ContentImageDto): ContentImage | null {
  const url = resolveAssetUrl(dto.imageUrl);
  return url ? { id: String(dto.id), url } : null;
}

function toPage(dto: ContentPageDto | null | undefined): ContentPage {
  if (!dto) return EMPTY_CONTENT_PAGE;
  return {
    content: dto.content ?? '',
    updatedAt: parseApiDate(dto.updatedAt),
    images: (dto.images ?? []).map(toImage).filter((i): i is ContentImage => !!i),
  };
}

/**
 * About-us is `multipart/form-data` (it carries new images; existing ones
 * are kept and removed one by one). No `Content-Type` is set — the browser
 * adds it with the boundary.
 */
function toAboutForm(content: string, newImages: readonly File[]): FormData {
  const fd = new FormData();
  fd.append('Content', content);
  for (const f of newImages) fd.append('NewImages', f, f.name);
  return fd;
}

/**
 * HTTP boundary for the app's static pages. Everything uses inline handling
 * — the editor owns spinners, empty / error states and messages.
 */
@Injectable({ providedIn: 'root' })
export class ContentPagesApi {
  private readonly api = inject(ApiService);

  /** A page that was never published reads as empty (whether the server answers `null` or 404). */
  get(kind: ContentPageKind): Observable<ContentPage> {
    return this.api.get<ContentPageDto | null>(PATHS[kind].read, { context: withInlineHandling() }).pipe(
      map(toPage),
      catchError((err: ApiError) => (err?.status === 404 ? of(EMPTY_CONTENT_PAGE) : throwError(() => err))),
    );
  }

  /** Replaces the text; on about-us, `newImages` are appended to the gallery. */
  update(kind: ContentPageKind, content: string, newImages: readonly File[] = []): Observable<ContentPage> {
    const body = kind === 'about' ? toAboutForm(content, newImages) : { content };
    return this.api.put<ContentPageDto>(PATHS[kind].write, body, { context: withInlineHandling() }).pipe(map(toPage));
  }

  /** Removes one about-us image; answers with the page as it now stands. */
  deleteAboutImage(imageId: string): Observable<ContentPage> {
    return this.api
      .delete<ContentPageDto>(`${PATHS.about.write}/images/${imageId}`, { context: withInlineHandling() })
      .pipe(map(toPage));
  }
}
