import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { BarChartComponent } from '../../../../shared/components/charts/bar-chart.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { APP_LOCALE } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { PersonFormComponent } from '../../components/person-form/person-form.component';
import { BOOKING_META, DetailTab, PEOPLE_CONFIG, STATUS_META, TX_META } from '../../people.config';
import {
  ActivityItem,
  AppNotification,
  BookingStatus,
  PersonActivity,
  PersonKind,
} from '../../people.models';
import { PeopleStore } from '../../people.store';
import { PeopleActionsService } from '../../people-actions.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';

const ACTIVITY_META: Record<ActivityItem['kind'], { icon: IconName; tone: string }> = {
  login: { icon: 'smartphone', tone: 'blue' },
  booking: { icon: 'calendar', tone: 'green' },
  payment: { icon: 'card', tone: 'purple' },
  review: { icon: 'star', tone: 'amber' },
  profile: { icon: 'user', tone: 'teal' },
  status: { icon: 'shield', tone: 'pink' },
};

const CHANNEL_META: Record<AppNotification['channel'], { icon: IconName; label: string; tone: string }> = {
  push: { icon: 'bell', label: 'إشعار التطبيق', tone: 'green' },
  sms: { icon: 'message', label: 'رسالة SMS', tone: 'blue' },
  email: { icon: 'mail', label: 'البريد الإلكتروني', tone: 'purple' },
};

@Component({
  selector: 'app-person-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FormsModule,
    IconComponent,
    AvatarComponent,
    KpiCardComponent,
    BarChartComponent,
    ModalComponent,
    CountUpDirective,
    PersonFormComponent,
    CountryFlagComponent,
    ...FORMAT_PIPES,
    ...COUNTRY_PIPES,
  ],
  templateUrl: './person-detail.component.html',
  styleUrl: './person-detail.component.scss',
})
export class PersonDetailComponent {
  readonly kind = input.required<PersonKind>();
  readonly id = input.required<string>();
  /** `?tab=` — keeps the selected tab deep-linkable and back-button friendly. */
  readonly tab = input<string>();

  private readonly store = inject(PeopleStore);
  private readonly actions = inject(PeopleActionsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly statusMeta = STATUS_META;
  protected readonly bookingMeta = BOOKING_META;
  protected readonly txMeta = TX_META;
  protected readonly activityMeta = ACTIVITY_META;
  protected readonly channelMeta = CHANNEL_META;
  protected readonly channels = Object.keys(CHANNEL_META) as AppNotification['channel'][];

  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly person = computed(() => this.store.list(this.kind())().find((p) => p.id === this.id()));
  protected readonly data = computed<PersonActivity | null>(() => {
    const p = this.person();
    return p ? this.store.activity(p) : null;
  });

  protected readonly activeTab = computed<DetailTab>(() => {
    const t = this.tab();
    return this.cfg().tabs.some((x) => x.id === t) ? (t as DetailTab) : 'overview';
  });

  protected readonly tabCounts = computed<Partial<Record<DetailTab, number>>>(() => {
    const d = this.data();
    if (!d) return {};
    return {
      bookings: d.bookings.length,
      transactions: d.transactions.length,
      reviews: d.reviews.length,
      notifications: this.notifications().filter((n) => !n.read).length || undefined,
    };
  });

  // ── Overview ──
  protected readonly completionRate = computed(() => {
    const p = this.person();
    return p && p.bookings ? Math.round((p.completed / p.bookings) * 100) : 0;
  });
  protected readonly monthLabels = computed(() => {
    const fmt = new Intl.DateTimeFormat(APP_LOCALE, { month: 'short' });
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => fmt.format(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)));
  });

  // ── Bookings tab ──
  protected readonly bookingFilter = signal<BookingStatus | 'all'>('all');
  protected readonly bookingTabs = computed(() => {
    const list = this.data()?.bookings ?? [];
    return [
      { id: 'all' as const, label: 'الكل', count: list.length },
      ...(Object.keys(BOOKING_META) as BookingStatus[]).map((s) => ({
        id: s,
        label: BOOKING_META[s].label,
        count: list.filter((b) => b.status === s).length,
      })),
    ];
  });
  protected readonly bookings = computed(() => {
    const f = this.bookingFilter();
    return (this.data()?.bookings ?? []).filter((b) => f === 'all' || b.status === f);
  });

  // ── Transactions tab ──
  protected readonly txSummary = computed(() => {
    const tx = (this.data()?.transactions ?? []).filter((t) => t.status === 'success');
    const incoming = tx.filter((t) => TX_META[t.type].sign > 0).reduce((a, t) => a + t.amount, 0);
    const outgoing = tx.filter((t) => TX_META[t.type].sign < 0).reduce((a, t) => a + t.amount, 0);
    return { incoming, outgoing, count: this.data()?.transactions.length ?? 0 };
  });

  // ── Reviews tab ──
  protected readonly ratingBreakdown = computed(() => {
    const reviews = this.data()?.reviews ?? [];
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((r) => r.rating === stars).length;
      return { stars, count, pct: Math.round((count / total) * 100) };
    });
  });

  // ── Notifications (local, so "send" and "mark read" feel real) ──
  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly notifyOpen = signal(false);
  protected readonly notifyDraft = { title: '', body: '', channel: 'push' as AppNotification['channel'] };
  protected readonly sending = signal(false);

  // ── Edit modal ──
  protected readonly formOpen = signal(false);

  constructor() {
    effect(() => {
      const d = this.data();
      untracked(() => this.notifications.set(d ? [...d.notifications] : []));
    }, { allowSignalWrites: true });
  }

  protected selectTab(tab: DetailTab): void {
    this.router.navigate([], {
      queryParams: { tab: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected stars(n: number): boolean[] {
    return [1, 2, 3, 4, 5].map((i) => i <= Math.round(n));
  }

  protected markAllRead(): void {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
    this.toast.info('تم تعليم جميع الإشعارات كمقروءة');
  }

  protected openNotify(): void {
    this.notifyDraft.title = '';
    this.notifyDraft.body = '';
    this.notifyDraft.channel = 'push';
    this.notifyOpen.set(true);
  }

  protected sendNotification(): void {
    const p = this.person();
    const { title, body, channel } = this.notifyDraft;
    if (!p || !title.trim() || !body.trim() || this.sending()) return;
    this.sending.set(true);
    setTimeout(() => {
      this.notifications.update((list) => [
        { id: `NT-${Date.now()}`, title: title.trim(), body: body.trim(), channel, date: new Date().toISOString(), read: true },
        ...list,
      ]);
      this.sending.set(false);
      this.notifyOpen.set(false);
      this.toast.success(`تم إرسال الإشعار إلى ${p.name}`);
    }, 700);
  }

  protected toggleBlock(): void {
    const p = this.person();
    if (p) this.actions.toggleBlock(p);
  }

  protected async remove(): Promise<void> {
    const p = this.person();
    if (p && (await this.actions.remove(p))) this.router.navigate(['/', this.kind()]);
  }
}
