import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Banner above a section that renders demo data while its endpoint is still
 * being built. Projected content replaces the default text.
 *
 *   <app-preview-notice />
 *   <app-preview-notice>سجل الجلسات قيد التطوير…</app-preview-notice>
 */
@Component({
  selector: 'app-preview-notice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="pv" role="note">
      <app-icon name="clock" [size]="16" />
      <p>
        <strong>قيد التطوير</strong>
        <span><ng-content>البيانات المعروضة هنا تجريبية للعرض فقط، وسيتم ربط هذا القسم بالخادم قريبًا.</ng-content></span>
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; margin-bottom: 12px; }
    .pv {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-radius: 12px;
      border: 1px dashed #e9c58b;
      background: #fffaf1;
      color: #92400e;
    }
    p { margin: 0; font-size: 12.5px; line-height: 1.6; }
    strong { margin-inline-end: 6px; font-weight: 700; }
  `],
})
export class PreviewNoticeComponent {}
