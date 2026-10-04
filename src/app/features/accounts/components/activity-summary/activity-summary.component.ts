import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { BOOKING_STATUSES, BOOKING_STATUS_META, BookingStats } from '../../../bookings/bookings.models';
import { Review, summarizeRatings } from '../../../reviews/reviews.models';
import { RatingStarsComponent } from '../../../reviews/components/rating-stars.component';

export type ActivitySummaryTab = 'bookings' | 'reviews';

/**
 * An account's bookings by status (server stats) and its rating (from the
 * loaded reviews). `null` inputs are still loading. Rows jump to the matching tab.
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
        @if (statsError()) {
          <div class="as-error">
            <span><app-icon name="alert" [size]="14" /> تعذّر تحميل إحصائيات الحجوزات</span>
            <button type="button" class="btn btn-soft btn-sm" (click)="retry.emit()"><app-icon name="refresh" [size]="13" /> إعادة المحاولة</button>
          </div>
        } @else {
          <button type="button" class="as-head" (click)="open.emit('bookings')" aria-label="عرض الحجوزات">
            <span class="as-total">
              @if (stats(); as s) { <strong>{{ s.all | num }}</strong> } @else { <span class="skel as-total__skel"></span> }
              <small>إجمالي الحجوزات</small>
            </span>
            <span class="as-rate">
              <small>نسبة الإتمام</small>
              @if (stats()) { <strong>{{ completionRate() }}%</strong> } @else { <span class="skel as-rate__skel"></span> }
            </span>
          </button>

          <div class="as-bar" role="img" [attr.aria-label]="barLabel()">
            @for (r of rows(); track r.id) {
              @if (r.count) { <span [style.flex-grow]="r.count" [style.background]="r.color"></span> }
            }
          </div>

          <ul class="as-legend">
            @for (r of rows(); track r.id) {
              <li>
                <span class="as-dot" [style.background]="r.color"></span>
                <span class="as-legend__label">{{ r.label }}</span>
                @if (stats()) {
                  <strong>{{ r.count | num }}</strong>
                  <small>{{ r.pct }}%</small>
                } @else {
                  <span class="skel as-legend__skel"></span>
                }
              </li>
            }
          </ul>
        }

        <button type="button" class="as-rating" (click)="open.emit('reviews')">
          <span class="as-rating__label"><app-icon name="star" [size]="14" /> {{ ratingLabel() }}</span>
          @if (!reviews()) {
            <span class="skel as-legend__skel"></span>
          } @else if (rating().count) {
            <span class="as-rating__val">
              <app-rating-stars [value]="rating().average" [size]="13" />
              <strong>{{ rating().average | num: 1 }}</strong>
              <small>({{ rating().count | num }})</small>
            </span>
          } @else {
            <small class="as-muted">لا توجد تقييمات بعد</small>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: start; }
    .skel { display: block; }

    .as-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; width: 100%; }
    .as-total { display: grid; gap: 2px; }
    .as-total strong { font-size: 26px; font-weight: 800; line-height: 1.1; color: var(--black); font-variant-numeric: tabular-nums; }
    .as-total__skel { width: 46px; height: 28px; }
    .as-total small, .as-rate small { font-size: 11.5px; color: var(--txt3); }
    .as-rate { display: grid; gap: 2px; justify-items: end; }
    .as-rate strong { font-size: 15px; font-weight: 700; color: #15803d; font-variant-numeric: tabular-nums; }
    .as-rate__skel { width: 36px; height: 18px; }

    .as-bar { display: flex; gap: 3px; height: 8px; margin: 12px 0 10px; border-radius: 999px; background: var(--bg3); overflow: hidden; }
    .as-bar span { min-width: 6px; transition: flex-grow 0.5s var(--ease); }

    .as-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
    .as-legend li { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--txt2); min-width: 0; }
    .as-legend__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .as-legend strong { color: var(--black); font-variant-numeric: tabular-nums; }
    .as-legend small { min-width: 32px; text-align: end; color: var(--txt3); font-variant-numeric: tabular-nums; }
    .as-legend__skel { width: 40px; height: 12px; }
    .as-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }

    .as-rating { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--brd); font-size: 12.5px; color: var(--txt2); }
    .as-rating__label { display: inline-flex; align-items: center; gap: 6px; }
    .as-rating__label app-icon { color: var(--gold); }
    .as-rating__val { display: inline-flex; align-items: center; gap: 6px; }
    .as-rating__val strong { color: var(--black); font-size: 14px; }
    .as-rating__val small, .as-muted { color: var(--txt3); font-size: 12px; }
    .as-rating:hover .as-rating__label { color: var(--pr); }

    .as-error { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--re); }
    .as-error span { display: inline-flex; align-items: center; gap: 6px; }

    @media (max-width: 575px) { .as-legend { grid-template-columns: 1fr; } }
  `],
})
export class ActivitySummaryComponent {
  /** Server-side booking totals; `null` while loading. */
  readonly stats = input<BookingStats | null>(null);
  readonly statsError = input(false);
  readonly reviews = input<Review[] | null>(null);
  /** "متوسط تقييم الفني" / "متوسط تقييمات العميل". */
  readonly ratingLabel = input('متوسط التقييم');
  readonly open = output<ActivitySummaryTab>();
  readonly retry = output<void>();

  protected readonly rating = computed(() => summarizeRatings(this.reviews() ?? []));

  protected readonly rows = computed(() => {
    const s = this.stats();
    const all = s?.all ?? 0;
    return BOOKING_STATUSES.map((id) => {
      const count = s?.[id] ?? 0;
      return { id, label: BOOKING_STATUS_META[id].plural, color: BOOKING_STATUS_META[id].color, count, pct: all ? Math.round((count / all) * 100) : 0 };
    });
  });

  /** Completed out of all bookings. */
  protected readonly completionRate = computed(() => {
    const s = this.stats();
    return s?.all ? Math.round((s.completed / s.all) * 100) : 0;
  });

  protected readonly barLabel = computed(() => this.rows().map((r) => `${r.label}: ${r.count}`).join('، '));
}
