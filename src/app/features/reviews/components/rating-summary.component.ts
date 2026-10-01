import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../shared/pipes/format.pipes';
import { RatingSummary, Stars } from '../reviews.models';
import { RatingStarsComponent } from './rating-stars.component';

/** Average rating with a per-star breakdown; each row toggles a rating filter. */
@Component({
  selector: 'app-rating-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RatingStarsComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel rs">
      <div class="panel__body">
        <p class="rs__big">{{ summary().count ? (summary().average | num: 1) : '—' }}</p>
        <app-rating-stars [value]="summary().average" [size]="18" />
        <p class="rs__count">بناءً على {{ summary().count | num }} تقييم</p>
        <div class="rs__rows" role="group" aria-label="فلترة حسب عدد النجوم">
          @for (r of summary().breakdown; track r.stars; let i = $index) {
            <button type="button" class="rs__row" [class.is-on]="selected() === r.stars" [attr.aria-pressed]="selected() === r.stars"
              [disabled]="!r.count && selected() !== r.stars" (click)="select.emit(selected() === r.stars ? null : r.stars)">
              <span class="rs__stars">{{ r.stars }} <app-icon name="star" [size]="12" [filled]="true" /></span>
              <span class="bar"><span class="bar__fill rs__fill" [style.width.%]="r.pct" [style.--d]="i"></span></span>
              <span class="rs__n">{{ r.count | num }}</span>
            </button>
          }
        </div>
        @if (selected()) {
          <button type="button" class="btn btn-ghost btn-sm rs__clear" (click)="select.emit(null)"><app-icon name="x" [size]="13" /> كل التقييمات</button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .rs { text-align: center; }
    .rs__big { margin: 0; font-size: 44px; font-weight: 700; line-height: 1.1; background: var(--grad-pr); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .rs__count { margin: 6px 0 16px; font-size: 12.5px; color: var(--txt3); }
    .rs__rows { display: grid; gap: 4px; text-align: start; }
    .rs__row {
      display: grid;
      grid-template-columns: 36px 1fr 30px;
      align-items: center;
      gap: 10px;
      padding: 4px 6px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      font: inherit;
      font-size: 12.5px;
      color: var(--txt2);
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }
    .rs__row:hover:not(:disabled) { background: #f7fafa; }
    .rs__row.is-on { background: var(--pr-l); border-color: #c9e2e4; color: var(--pr-d); }
    .rs__row:disabled { cursor: default; opacity: 0.55; }
    .rs__stars { display: inline-flex; align-items: center; gap: 3px; }
    .rs__stars app-icon { color: var(--gold); }
    .rs__fill { background: var(--grad-gold) !important; }
    .rs__n { text-align: end; color: var(--txt3); font-variant-numeric: tabular-nums; }
    .rs__clear { margin-top: 10px; }
  `],
})
export class RatingSummaryComponent {
  readonly summary = input.required<RatingSummary>();
  readonly selected = input<Stars | null>(null);
  readonly select = output<Stars | null>();
}
