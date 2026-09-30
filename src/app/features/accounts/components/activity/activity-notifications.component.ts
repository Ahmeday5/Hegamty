import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { AppNotification } from '../../../people/people.models';

/** In-app notifications an account received (the only channel the platform uses). */
@Component({
  selector: 'app-activity-notifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, DevBadgeComponent, ...FORMAT_PIPES],
  template: `
    <div class="panel">
      <div class="panel__head">
        <div>
          <h3 class="panel__title">إشعارات التطبيق</h3>
          <p class="panel__sub">الإشعارات التي وصلت إلى هذا الحساب داخل التطبيق</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="!unread()" (click)="markAllRead()">
            <app-icon name="check" [size]="14" /> تعليم الكل كمقروء
          </button>
          <button type="button" class="btn btn-soft btn-sm" disabled data-tip="قيد التطوير">
            <app-icon name="send" [size]="14" /> إشعار جديد <app-dev-badge size="sm" />
          </button>
        </div>
      </div>
      <div class="panel__body">
        <ul class="notes">
          @for (n of items(); track n.id; let i = $index) {
            <li class="note fx" [class.is-unread]="!n.read" [style.--d]="i">
              <span class="tile tile--sm tile--green"><app-icon name="bell" [size]="15" /></span>
              <div class="note__body">
                <div class="note__top"><strong>{{ n.title }}</strong><time>{{ n.date | relTime }}</time></div>
                <p>{{ n.body }}</p>
              </div>
              @if (!n.read) { <span class="note__dot" aria-label="غير مقروء"></span> }
            </li>
          } @empty {
            <li class="empty"><span class="empty__icon"><app-icon name="bell" [size]="24" /></span><p class="empty__title">لا توجد إشعارات</p></li>
          }
        </ul>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .note { position: relative; display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--brd); transition: border-color 0.2s; }
    .note:hover { border-color: #cfe3e5; }
    .note.is-unread { background: #f3fafa; border-color: #c9e4e6; }
    .note.is-unread .note__top { padding-inline-end: 18px; }
    .note__body { flex: 1; min-width: 0; }
    .note__body p { margin: 3px 0 0; font-size: 13px; color: var(--txt2); }
    .note__top { display: flex; justify-content: space-between; gap: 12px; }
    .note__top strong { font-size: 13.5px; }
    .note__top time { font-size: 11.5px; color: var(--txt3); white-space: nowrap; }
    .note__dot { position: absolute; top: 14px; inset-inline-end: 14px; width: 8px; height: 8px; border-radius: 50%; background: var(--pr); box-shadow: 0 0 0 4px var(--pr-ring); }
  `],
})
export class ActivityNotificationsComponent {
  readonly notifications = input.required<AppNotification[]>();

  protected readonly items = signal<AppNotification[]>([]);
  protected readonly unread = computed(() => this.items().filter((n) => !n.read).length);

  constructor() {
    effect(() => {
      const list = this.notifications();
      untracked(() => this.items.set([...list]));
    }, { allowSignalWrites: true });
  }

  protected markAllRead(): void {
    this.items.update((list) => list.map((n) => ({ ...n, read: true })));
  }
}
