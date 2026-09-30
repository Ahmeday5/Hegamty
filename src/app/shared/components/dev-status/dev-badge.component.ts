import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Marks a field, column or action the backend doesn't serve yet.
 *
 *   <app-dev-badge />                         → "قيد التطوير" pill
 *   <app-dev-badge size="sm" tip="…" />       → compact pill for table headers
 */
@Component({
  selector: 'app-dev-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dev" [class.dev--sm]="size() === 'sm'" [attr.data-tip]="tip() || null">{{ label() }}</span>`,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .dev {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border-radius: 999px;
      border: 1px dashed #e9c58b;
      background: #fff8ec;
      color: #a45a0b;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
    }
    .dev--sm { padding: 0 6px; font-size: 10px; }
  `],
})
export class DevBadgeComponent {
  readonly label = input('قيد التطوير');
  readonly size = input<'sm' | 'md'>('md');
  readonly tip = input('');
}
