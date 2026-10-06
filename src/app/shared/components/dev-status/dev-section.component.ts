import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { DevBadgeComponent } from './dev-badge.component';

/**
 * Placeholder for a whole section (tab, panel) the backend doesn't serve
 * yet — states it plainly instead of showing invented data.
 *
 *   <app-dev-section icon="star" title="تقييمات السائق" text="ستظهر هنا تقييمات العملاء…" />
 */
@Component({
  selector: 'app-dev-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, DevBadgeComponent],
  template: `
    <div class="ds" role="note">
      <span class="ds__icon"><app-icon [name]="icon()" [size]="26" /></span>
      <p class="ds__title">{{ title() }} <app-dev-badge /></p>
      @if (text()) { <p class="ds__text">{{ text() }}</p> }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ds { display: grid; justify-items: center; gap: 8px; padding: 42px 20px; text-align: center; }
    .ds__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      border: 1px dashed #e9c58b;
      background: #fffaf1;
      color: #a45a0b;
    }
    .ds__title { display: inline-flex; align-items: center; gap: 8px; margin: 4px 0 0; font-size: 15px; font-weight: 700; color: var(--black); }
    .ds__text { max-width: 420px; margin: 0; font-size: 13px; line-height: 1.7; color: var(--txt3); }
  `],
})
export class DevSectionComponent {
  readonly icon = input<IconName>('clock');
  readonly title = input.required<string>();
  readonly text = input('');
}
