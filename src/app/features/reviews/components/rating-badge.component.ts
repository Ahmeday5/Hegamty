import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { formatNumber } from '../../../shared/utils/format.util';

/** Compact average for table cells: "★ 4.5 (12)", or "لا تقييمات" when there are none. */
@Component({
  selector: 'app-rating-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (count()) {
      <span class="rb" [attr.aria-label]="label()">
        <app-icon name="star" [size]="13" [filled]="true" />
        <strong>{{ average() }}</strong>
        <span class="rb__count">({{ countText() }})</span>
      </span>
    } @else {
      <span class="rb rb--none">لا تقييمات</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .rb { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    app-icon { color: var(--gold); }
    strong { font-weight: 700; color: var(--black); }
    .rb__count { font-size: 12px; color: var(--txt3); }
    .rb--none { font-size: 12px; color: var(--txt3); }
  `],
})
export class RatingBadgeComponent {
  /** 0–5. */
  readonly value = input.required<number>();
  readonly count = input.required<number>();

  protected readonly average = computed(() => formatNumber(this.value(), 1));
  protected readonly countText = computed(() => formatNumber(this.count()));
  protected readonly label = computed(() => `متوسط التقييم ${this.average()} من 5 — ${this.countText()} تقييم`);
}
