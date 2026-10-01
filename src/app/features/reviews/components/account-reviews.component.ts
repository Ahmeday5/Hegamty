import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../shared/pipes/format.pipes';
import { RecordState } from '../../../core/utils/record-loader';
import { pageOf } from '../../../core/models/page.model';
import { RATING_LABELS, Review, Stars, summarizeRatings } from '../reviews.models';
import { RatingStarsComponent } from './rating-stars.component';
import { RatingSummaryComponent } from './rating-summary.component';
import { BookingRefComponent } from '../../bookings/components/booking-ref/booking-ref.component';

const PAGE_SIZE = 10;

/**
 * An account's reviews on its profile: rating summary (doubling as a star
 * filter) next to the review feed, paged locally. On a technician's profile
 * each review shows its author; on a customer's, the technician it rates.
 */
@Component({
  selector: 'app-account-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    AvatarComponent,
    PaginationComponent,
    RatingStarsComponent,
    RatingSummaryComponent,
    BookingRefComponent,
    ...FORMAT_PIPES,
  ],
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="grid ar-grid" aria-busy="true" aria-label="جارٍ التحميل">
          <span class="skel ar-skel ar-skel--summary"></span>
          <div class="ar-feed">@for (r of [0, 1, 2]; track r) { <span class="skel ar-skel"></span> }</div>
        </div>
      }
      @case ('error') {
        <div class="panel empty">
          <span class="empty__icon empty__icon--red"><app-icon name="alert" [size]="24" /></span>
          <p class="empty__title">تعذّر تحميل التقييمات</p>
          <p class="empty__text">{{ error() }}</p>
          <button type="button" class="btn btn-soft btn-sm" (click)="retry.emit()"><app-icon name="refresh" [size]="14" /> إعادة المحاولة</button>
        </div>
      }
      @default {
        @if (reviews()?.length) {
          <div class="grid ar-grid">
            <app-rating-summary [summary]="summary()" [selected]="rating()" (select)="setRating($event)" />
            <div class="ar-feed">
              @for (r of page().items; track r.id; let i = $index) {
                <article class="panel ar-card fx" [style.--d]="i">
                  <header class="ar-card__head">
                    @if (party() === 'specialist') {
                      <app-avatar [name]="r.client.name" [size]="36" />
                      <div class="ar-card__who">
                        <a [routerLink]="['/customers', r.client.id]">{{ r.client.name }}</a>
                        <time>{{ r.createdAt | arDate }}</time>
                      </div>
                    } @else {
                      <app-avatar [name]="r.specialist.name" [size]="36" />
                      <div class="ar-card__who">
                        <a [routerLink]="['/technicians', r.specialist.id]">{{ r.specialist.name }}</a>
                        <time>{{ r.createdAt | arDate }}</time>
                      </div>
                    }
                    <div class="ar-card__rate">
                      <app-rating-stars [value]="r.rating" />
                      <span>{{ labels[r.rating] }}</span>
                    </div>
                  </header>
                  @if (r.comment) { <p class="ar-card__text">{{ r.comment }}</p> }
                  @else { <p class="ar-card__text ar-card__text--none">تقييم بدون تعليق</p> }
                  @if (r.bookingId) {
                    <app-booking-ref [bookingId]="r.bookingId" [clientId]="r.client.id" [specialistId]="r.specialist.id" />
                  }
                </article>
              } @empty {
                <div class="panel empty">
                  <span class="empty__icon"><app-icon name="star" [size]="24" /></span>
                  <p class="empty__title">لا توجد تقييمات بـ{{ rating() }} نجوم</p>
                  <button type="button" class="btn btn-soft btn-sm" (click)="setRating(null)">كل التقييمات</button>
                </div>
              }
              @if (page().page.count > page().page.pageSize) {
                <app-pagination [pageIndex]="page().page.pageIndex" [pageSize]="page().page.pageSize" [count]="page().page.count"
                  [totalPages]="page().page.totalPages" [showPageSize]="false" (pageChange)="pageIndex.set($event)" />
              }
            </div>
          </div>
        } @else {
          <div class="panel empty">
            <span class="empty__icon"><app-icon name="star" [size]="24" /></span>
            <p class="empty__title">لا توجد تقييمات بعد</p>
            <p class="empty__text">
              {{ party() === 'specialist' ? 'تظهر هنا تقييمات العملاء للفني بعد جلساتهم.' : 'تظهر هنا التقييمات التي يتركها العميل للفنيين.' }}
            </p>
          </div>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .ar-grid { grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); align-items: start; }
    @media (max-width: 991.98px) { .ar-grid { grid-template-columns: minmax(0, 1fr); } }
    .ar-feed { display: grid; gap: 12px; }
    .ar-card { padding: 14px 16px; }
    .ar-card__head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .ar-card__who { display: grid; flex: 1; min-width: 0; }
    .ar-card__who a { font-size: 13.5px; font-weight: 600; color: var(--black); text-decoration: none; }
    .ar-card__who a:hover { color: var(--pr); text-decoration: underline; }
    .ar-card__who time { font-size: 11.5px; color: var(--txt3); }
    .ar-card__rate { display: grid; justify-items: end; gap: 2px; font-size: 11.5px; color: var(--txt3); }
    .ar-card__text { margin: 0 0 10px; font-size: 13px; line-height: 1.75; color: var(--txt2); white-space: pre-line; }
    .ar-card__text--none { color: var(--txt3); font-style: italic; }
    .ar-skel { display: block; height: 96px; border-radius: 14px; }
    .ar-skel--summary { height: 280px; }
    .empty__icon--red { background: var(--re-l); color: var(--re); }
  `],
})
export class AccountReviewsComponent {
  readonly reviews = input<Review[] | null>(null);
  readonly state = input.required<RecordState>();
  readonly error = input<string | null>(null);
  /** Whose profile this is — each review then shows the other party. */
  readonly party = input.required<'client' | 'specialist'>();
  readonly retry = output<void>();

  protected readonly labels = RATING_LABELS;
  protected readonly rating = signal<Stars | null>(null);
  protected readonly pageIndex = signal(1);

  protected readonly summary = computed(() => summarizeRatings(this.reviews() ?? []));

  protected readonly page = computed(() => {
    const rating = this.rating();
    const rows = (this.reviews() ?? []).filter((r) => rating === null || r.rating === rating);
    const last = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    return pageOf(rows, { pageIndex: Math.min(this.pageIndex(), last), pageSize: PAGE_SIZE });
  });

  constructor() {
    effect(
      () => {
        this.reviews();
        untracked(() => this.pageIndex.set(1));
      },
      { allowSignalWrites: true },
    );
  }

  protected setRating(rating: Stars | null): void {
    this.rating.set(rating);
    this.pageIndex.set(1);
  }
}
