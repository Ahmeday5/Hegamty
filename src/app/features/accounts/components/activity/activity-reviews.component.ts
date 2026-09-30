import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { Review } from '../../../people/people.models';

/** Rating summary with a per-star breakdown, next to the review list. */
@Component({
  selector: 'app-activity-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, AvatarComponent, ...FORMAT_PIPES],
  template: `
    <div class="grid grid--reviews">
      <div class="panel rating-card">
        <div class="panel__body">
          <p class="rating-card__big">{{ rating() || '—' }}</p>
          <div class="stars">
            @for (on of stars(rating()); track $index) { <app-icon name="star" [size]="18" [filled]="on" [class.on]="on" /> }
          </div>
          <p class="rating-card__count">بناءً على {{ reviewsCount() | num }} تقييم</p>
          <div class="breakdown">
            @for (r of breakdown(); track r.stars; let i = $index) {
              <div class="breakdown__row">
                <span>{{ r.stars }} <app-icon name="star" [size]="12" [filled]="true" /></span>
                <div class="bar"><span class="bar__fill breakdown__fill" [style.width.%]="r.pct" [style.--d]="i"></span></div>
                <span class="muted">{{ r.count }}</span>
              </div>
            }
          </div>
        </div>
      </div>
      <div class="reviews">
        @for (r of reviews(); track r.id; let i = $index) {
          <article class="panel review fx" [style.--d]="i + 1">
            <header class="review__head">
              <app-avatar [name]="r.author" [size]="36" />
              <div><strong>{{ r.author }}</strong><time>{{ r.date | arDate }}</time></div>
              <div class="stars">
                @for (on of stars(r.rating); track $index) { <app-icon name="star" [size]="14" [filled]="on" [class.on]="on" /> }
              </div>
            </header>
            <p class="review__text">{{ r.comment }}</p>
            <span class="chip chip--green">{{ r.service }}</span>
          </article>
        } @empty {
          <div class="panel empty"><span class="empty__icon"><app-icon name="star" [size]="24" /></span><p class="empty__title">لا توجد تقييمات بعد</p></div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .muted { color: var(--txt3); }
    .grid--reviews { grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); align-items: start; }
    @media (max-width: 991.98px) { .grid--reviews { grid-template-columns: minmax(0, 1fr); } }
    .rating-card { text-align: center; }
    .rating-card__big { margin: 0; font-size: 44px; font-weight: 700; line-height: 1.1; background: var(--grad-pr); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .rating-card__count { margin: 6px 0 16px; font-size: 12.5px; color: var(--txt3); }
    .stars { display: inline-flex; gap: 3px; }
    .stars app-icon { color: #e1e8e8; }
    .stars app-icon.on { color: var(--gold); }
    .breakdown { display: grid; gap: 9px; text-align: start; }
    .breakdown__row { display: grid; grid-template-columns: 36px 1fr 26px; align-items: center; gap: 10px; font-size: 12.5px; }
    .breakdown__row > span:first-child { display: inline-flex; align-items: center; gap: 3px; }
    .breakdown__row > span:first-child app-icon { color: var(--gold); }
    .breakdown__fill { background: var(--grad-gold) !important; }
    .reviews { display: grid; gap: 12px; }
    .review { padding: 14px 16px; }
    .review__head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .review__head > div:nth-child(2) { display: grid; flex: 1; }
    .review__head strong { font-size: 13.5px; }
    .review__head time { font-size: 11.5px; color: var(--txt3); }
    .review__text { margin: 0 0 10px; font-size: 13px; line-height: 1.75; color: var(--txt2); }
  `],
})
export class ActivityReviewsComponent {
  readonly reviews = input.required<Review[]>();
  readonly rating = input.required<number>();
  readonly reviewsCount = input.required<number>();

  protected readonly breakdown = computed(() => {
    const reviews = this.reviews();
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((r) => r.rating === stars).length;
      return { stars, count, pct: Math.round((count / total) * 100) };
    });
  });

  protected stars(n: number): boolean[] {
    return [1, 2, 3, 4, 5].map((i) => i <= Math.round(n));
  }
}
