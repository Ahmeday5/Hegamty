import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { withInlineHandling } from '../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../core/utils/api-list.util';
import { parseApiDate } from '../../core/utils/api-date.util';
import { Page, PageRequest, toPageMeta } from '../../core/models/page.model';
import { PartiesDto, toParties } from '../accounts/account-wire';
import { PlaceResolver } from '../accounts/place-resolver.service';
import { Review, ReviewQuery, Stars } from './reviews.models';

// ─────────── wire format ───────────

interface ReviewDto extends PartiesDto {
  id: number;
  bookingId: number | null;
  rating: number | null;
  comment: string | null;
  createdAt: string | null;
}

const ENDPOINT = 'admin/reviews';

const toStars = (n: number | null): Stars => Math.min(5, Math.max(1, Math.round(Number(n) || 1))) as Stars;

function toParams(q: ReviewQuery, page: PageRequest): Record<string, unknown> {
  return { PageIndex: page.pageIndex, PageSize: page.pageSize, clientId: q.clientId, specialistId: q.specialistId };
}

/**
 * HTTP boundary for reviews (read-only — customers leave them in the app).
 * Reads are silent: the calling page renders its own loading / error states.
 */
@Injectable({ providedIn: 'root' })
export class ReviewsApi {
  private readonly api = inject(ApiService);
  private readonly places = inject(PlaceResolver);

  list(query: ReviewQuery, page: PageRequest): Observable<Page<Review>> {
    return this.getPage(ENDPOINT, toParams(query, page)).pipe(
      map((paged) => ({ items: paged.data.map((d) => this.toReview(d)), page: toPageMeta(paged, page) })),
    );
  }

  /** Every page for the filters, drained (local filters, summary, exports). */
  listAll(query: ReviewQuery): Observable<Review[]> {
    return this.drain(ENDPOINT, (page) => toParams(query, page));
  }

  /** All reviews a technician received. */
  ofSpecialist(id: string): Observable<Review[]> {
    return this.drain(`admin/specialists/${id}/reviews`, (page) => ({ PageIndex: page.pageIndex, PageSize: page.pageSize }));
  }

  /** All reviews a customer left. */
  ofClient(id: string): Observable<Review[]> {
    return this.drain(`admin/clients/${id}/reviews`, (page) => ({ PageIndex: page.pageIndex, PageSize: page.pageSize }));
  }

  private getPage(url: string, params: Record<string, unknown>) {
    return this.api.get<unknown>(url, { params, context: withInlineHandling() }).pipe(map((res) => asPaged<ReviewDto>(res)));
  }

  private drain(url: string, params: (page: PageRequest) => Record<string, unknown>): Observable<Review[]> {
    return fetchAllPages((pageIndex, pageSize) => this.getPage(url, params({ pageIndex, pageSize }))).pipe(
      map((list) => list.map((d) => this.toReview(d))),
    );
  }

  private toReview(dto: ReviewDto): Review {
    return {
      id: String(dto.id),
      bookingId: dto.bookingId && dto.bookingId > 0 ? String(dto.bookingId) : null,
      ...toParties(dto, this.places),
      rating: toStars(dto.rating),
      comment: dto.comment?.trim() ?? '',
      createdAt: parseApiDate(dto.createdAt),
    };
  }
}
