import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/** Five stars, filled up to `value` (rounded). */
@Component({
  selector: 'app-rating-stars',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <span class="stars" role="img" [attr.aria-label]="value() + ' من 5'">
      @for (on of filled(); track $index) { <app-icon name="star" [size]="size()" [filled]="on" [class.on]="on" /> }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .stars { display: inline-flex; gap: 2px; }
    app-icon { color: #e1e8e8; }
    app-icon.on { color: var(--gold); }
  `],
})
export class RatingStarsComponent {
  readonly value = input.required<number>();
  readonly size = input(14);

  protected readonly filled = computed(() => {
    const n = Math.round(this.value());
    return [1, 2, 3, 4, 5].map((i) => i <= n);
  });
}
