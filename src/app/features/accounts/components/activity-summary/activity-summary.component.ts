import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { Booking, countBookings } from '../../../bookings/bookings.models';
import { Review, summarizeRatings } from '../../../reviews/reviews.models';
import { RatingStarsComponent } from '../../../reviews/components/rating-stars.component';

export type ActivitySummaryTab = 'bookings' | 'reviews';

/**
 * An account's bookings by status and its rating, from the loaded bookings
 * and reviews (`null` = still loading). Tiles jump to the matching tab.
 */
@Component({
  selector: 'app-activity-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RatingStarsComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel">
      <div class="panel__head"><h3 class="panel__title">ملخص النشاط</h3></div>
      <div class="panel__body">
        <div class="mini-stats">
          <button type="button" class="mini" (click)="open.emit('bookings')">
            <small>الحجوزات</small>
            @if (bookings()) { <strong>{{ counts().all | num }}</strong> } @else { <span class="skel mini__skel"></span> }
          </button>
          <button type="button" class="mini" (click)="open.emit('bookings')">
            <small>مؤكدة</small>
            @if (bookings()) { <strong class="ok">{{ counts().confirmed | num }}</strong> } @else { <span class="skel mini__skel"></span> }
          </button>
          <button type="button" class="mini" (click)="open.emit('bookings')">
            <small>ملغاة</small>
            @if (bookings()) { <strong class="bad">{{ counts().cancelled | num }}</strong> } @else { <span class="skel mini__skel"></span> }
          </button>
          <button type="button" class="mini" (click)="open.emit('reviews')">
            <small>التقييمات</small>
            @if (reviews()) { <strong>{{ rating().count | num }}</strong> } @else { <span class="skel mini__skel"></span> }
          </button>
        </div>

        <div class="rate">
          <div class="rate__head">
            <span>نسبة التأكيد</span>
            <strong>{{ confirmRate() }}%</strong>
          </div>
          <div class="bar bar--brand"><span class="bar__fill" [style.width.%]="confirmRate()"></span></div>
        </div>

        @if (reviews() && rating().count) {
          <div class="avg">
            <span>{{ ratingLabel() }}</span>
            <span class="avg__val">
              <app-rating-stars [value]="rating().average" />
              <strong>{{ rating().average | num: 1 }}</strong>
            </span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .mini-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .mini {
      display: grid;
      justify-items: center;
      gap: 2px;
      padding: 10px;
      border-radius: 12px;
      background: #f7fafa;
      border: 1px solid var(--brd);
      font: inherit;
      color: inherit;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .mini:hover { border-color: #c9e2e4; background: #f1f8f8; }
    .mini small { font-size: 11px; color: var(--txt3); }
    .mini strong { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .mini__skel { display: block; width: 32px; height: 20px; }
    .ok { color: #15803d; }
    .bad { color: var(--re); }
    .rate { margin-top: 14px; }
    .rate__head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 7px; font-size: 12.5px; color: var(--txt2); }
    .rate__head strong { color: var(--pr); }
    .avg { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--brd); font-size: 12.5px; color: var(--txt2); }
    .avg__val { display: inline-flex; align-items: center; gap: 8px; }
    .avg__val strong { color: var(--black); font-size: 14px; }
    @media (max-width: 575px) { .mini-stats { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ActivitySummaryComponent {
  readonly bookings = input<Booking[] | null>(null);
  readonly reviews = input<Review[] | null>(null);
  /** "متوسط تقييم الفني" / "متوسط تقييمات العميل". */
  readonly ratingLabel = input('متوسط التقييم');
  readonly open = output<ActivitySummaryTab>();

  protected readonly counts = computed(() => countBookings(this.bookings() ?? []));
  protected readonly rating = computed(() => summarizeRatings(this.reviews() ?? []));
  protected readonly confirmRate = computed(() => {
    const c = this.counts();
    return c.all ? Math.round((c.confirmed / c.all) * 100) : 0;
  });
}
