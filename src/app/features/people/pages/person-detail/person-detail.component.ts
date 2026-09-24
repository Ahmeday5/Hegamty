import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BarChartComponent } from '../../../../shared/components/charts/bar-chart.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { APP_LOCALE } from '../../../../shared/utils/format.util';
import { ToastService } from '../../../../core/services/toast.service';
import { PersonFormComponent } from '../../components/person-form/person-form.component';
import { BOOKING_META, DetailTab, PEOPLE_CONFIG, STATUS_META, ageOf, isNewAccount } from '../../people.config';
import { AppNotification, BookingStatus, PersonDocument, PersonHistory, PersonKind } from '../../people.models';
import { PeopleStore } from '../../people.store';
import { PeopleActionsService } from '../../people-actions.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { PackagesStore } from '../../../packages/packages.store';
import { PERIOD_META, SUB_STATE_META } from '../../../packages/packages.models';

const DOC_ICON: Record<PersonDocument['key'], IconName> = {
  photo: 'user',
  id_front: 'shield',
  id_back: 'shield',
  license: 'car',
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
  /** `?tab=` keeps the selected tab deep-linkable. */
  readonly tab = input<string>();

  private readonly store = inject(PeopleStore);
  private readonly actions = inject(PeopleActionsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly packages = inject(PackagesStore);

  protected readonly statusMeta = STATUS_META;
  protected readonly bookingMeta = BOOKING_META;
  protected readonly subMeta = SUB_STATE_META;
  protected readonly periodMeta = PERIOD_META;
  protected readonly docIcon = DOC_ICON;

  protected readonly cfg = computed(() => PEOPLE_CONFIG[this.kind()]);
  protected readonly person = computed(() => this.store.list(this.kind())().find((p) => p.id === this.id()));
  protected readonly data = computed<PersonHistory | null>(() => {
    const p = this.person();
    return p ? this.store.history(p) : null;
  });
  protected readonly age = computed(() => {
    const p = this.person();
    return p?.birthDate ? ageOf(p.birthDate) : 0;
  });
  protected readonly isNew = computed(() => {
    const p = this.person();
    return !!p && isNewAccount(p);
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
      reviews: d.reviews.length,
      notifications: this.notifications().filter((n) => !n.read).length || undefined,
    };
  });

  // ── Technician subscription ──
  protected readonly subscription = computed(() => {
    const p = this.person();
    if (!p || p.kind !== 'technicians') return null;
    const sub = this.packages.latestFor(p.id);
    const pkg = sub ? this.packages.byId(sub.packageId) : undefined;
    const state = this.packages.stateOf(sub);
    const total = sub ? Math.max(1, (+new Date(sub.endsAt) - +new Date(sub.startedAt)) / 86400000) : 1;
    const left = sub ? Math.max(0, this.packages.daysLeft(sub)) : 0;
    return { sub, pkg, state, left, pct: Math.round((left / total) * 100), history: this.packages.historyFor(p.id) };
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

  // ── Documents lightbox ──
  protected readonly viewingDoc = signal<PersonDocument | null>(null);

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

  // ── Reviews tab ──
  protected readonly ratingBreakdown = computed(() => {
    const reviews = this.data()?.reviews ?? [];
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((r) => r.rating === stars).length;
      return { stars, count, pct: Math.round((count / total) * 100) };
    });
  });

  // ── Notifications (in-app only) ──
  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly notifyOpen = signal(false);
  protected readonly notifyDraft = { title: '', body: '' };
  protected readonly sending = signal(false);

  protected readonly formOpen = signal(false);

  constructor() {
    effect(() => {
      const d = this.data();
      untracked(() => this.notifications.set(d ? [...d.notifications] : []));
    }, { allowSignalWrites: true });
  }

  protected selectTab(tab: DetailTab): void {
    this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
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
    this.notifyOpen.set(true);
  }

  protected sendNotification(): void {
    const p = this.person();
    const { title, body } = this.notifyDraft;
    if (!p || !title.trim() || !body.trim() || this.sending()) return;
    this.sending.set(true);
    setTimeout(() => {
      this.notifications.update((list) => [
        { id: `NT-${Date.now()}`, title: title.trim(), body: body.trim(), date: new Date().toISOString(), read: true },
        ...list,
      ]);
      this.sending.set(false);
      this.notifyOpen.set(false);
      this.toast.success(`تم إرسال الإشعار إلى ${p.name} عبر التطبيق`);
    }, 600);
  }

  protected toggleActive(): void {
    const p = this.person();
    if (p) this.actions.toggleActive(p);
  }

  protected async remove(): Promise<void> {
    const p = this.person();
    if (p && (await this.actions.remove(p))) this.router.navigate(['/', this.kind()]);
  }
}
