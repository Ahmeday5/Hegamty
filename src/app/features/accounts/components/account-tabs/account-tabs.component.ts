import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';

export interface AccountTab<T extends string = string> {
  id: T;
  label: string;
  icon: IconName;
  count?: number | null;
  /** Section renders demo data until its endpoint exists. */
  dev?: boolean;
}

/** Section switcher of an account detail page. */
@Component({
  selector: 'app-account-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <nav class="tabs" role="tablist" aria-label="أقسام الملف">
      @for (t of tabs(); track t.id) {
        <button type="button" class="tabs__btn" role="tab" [class.is-on]="active() === t.id" [attr.aria-selected]="active() === t.id"
          (click)="select.emit(t.id)">
          <app-icon [name]="t.icon" [size]="16" /> {{ t.label }}
          @if (t.count) { <span class="tabs__count">{{ t.count }}</span> }
          @if (t.dev) { <span class="tabs__dev" title="قيد التطوير — بيانات تجريبية">تجريبي</span> }
        </button>
      }
    </nav>
  `,
  styles: [`
    :host { display: block; margin-bottom: 14px; }
    .tabs {
      display: flex;
      gap: 4px;
      padding: 5px;
      overflow-x: auto;
      border-radius: 14px;
      background: var(--white);
      border: 1px solid var(--brd);
      box-shadow: var(--shadow);
      scrollbar-width: none;
    }
    .tabs__btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 14px;
      border: none;
      border-radius: 10px;
      background: transparent;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--txt2);
      white-space: nowrap;
      cursor: pointer;
      transition: color 0.2s, background 0.2s;
    }
    .tabs__btn:hover { color: var(--pr); background: var(--pr-l); }
    .tabs__btn.is-on { color: var(--white); background: var(--grad-pr); box-shadow: 0 8px 18px -10px rgba(6, 74, 80, 0.7); animation: fx-pop 0.3s var(--ease); }
    .tabs__count { min-width: 18px; padding: 0 6px; border-radius: 999px; font-size: 10.5px; line-height: 18px; text-align: center; background: var(--pr-l); color: var(--pr); }
    .tabs__dev { padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 17px; border: 1px dashed #e9c58b; background: #fff8ec; color: #a45a0b; }
    .tabs__btn.is-on .tabs__count { background: rgba(255, 255, 255, 0.22); color: var(--white); }
    .tabs__btn.is-on .tabs__dev { background: rgba(255, 255, 255, 0.18); border-color: rgba(255, 255, 255, 0.5); color: var(--white); }
    @media (prefers-reduced-motion: reduce) { .tabs__btn.is-on { animation: none; } }
  `],
})
export class AccountTabsComponent<T extends string = string> {
  readonly tabs = input.required<readonly AccountTab<T>[]>();
  readonly active = input.required<T>();
  readonly select = output<T>();
}
