import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { PeopleStore } from '../../../people/people.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';
import { PackageFormComponent } from '../../components/package-form/package-form.component';
import { PackagesStore } from '../../packages.store';
import { PERIOD_META, SUB_STATE_META, SubscriptionState, TechPackage } from '../../packages.models';

type SubFilter = 'all' | SubscriptionState;
const DAY = 86400000;

@Component({
  selector: 'app-packages-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AvatarComponent, KpiCardComponent, PaginationComponent, PackageFormComponent, CountryFlagComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './packages-page.component.html',
  styleUrl: './packages-page.component.scss',
})
export class PackagesPageComponent {
  private readonly store = inject(PackagesStore);
  private readonly people = inject(PeopleStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly scope = inject(CountryScopeService);

  protected readonly periodMeta = PERIOD_META;
  protected readonly subMeta = SUB_STATE_META;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TechPackage | null>(null);

  protected readonly subFilter = signal<SubFilter>('all');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = 10;

  protected readonly packages = computed(() =>
    this.scope
      .filter(this.store.all())
      .map((p) => ({ pkg: p, subscribers: this.store.subscribersOf(p.id) }))
      .sort((a, b) => a.pkg.countryId.localeCompare(b.pkg.countryId) || PERIOD_META[a.pkg.period].days - PERIOD_META[b.pkg.period].days),
  );

  /** Latest subscription per technician in scope, joined with names. */
  private readonly rows = computed(() => {
    const techs = new Map(this.people.list('technicians')().map((t) => [t.id, t]));
    const latest = new Map<string, ReturnType<PackagesStore['latestFor']>>();
    for (const s of this.scope.filter(this.store.subscriptions())) {
      const cur = latest.get(s.technicianId);
      if (!cur || +new Date(s.endsAt) > +new Date(cur.endsAt)) latest.set(s.technicianId, s);
    }
    return [...latest.values()]
      .filter((s): s is NonNullable<typeof s> => !!s && techs.has(s.technicianId))
      .map((s) => ({
        sub: s,
        tech: techs.get(s.technicianId)!,
        pkg: this.store.byId(s.packageId),
        state: this.store.stateOf(s) as SubscriptionState,
        left: this.store.daysLeft(s),
      }))
      .sort((a, b) => a.left - b.left);
  });

  protected readonly kpis = computed(() => {
    const rows = this.rows();
    const now = Date.now();
    const recent = this.scope.filter(this.store.subscriptions()).filter((s) => +new Date(s.startedAt) > now - 30 * DAY);
    const techs = this.scope.filter(this.people.list('technicians')()).filter((t) => t.status === 'active');
    const subscribed = new Set(rows.filter((r) => r.state !== 'expired').map((r) => r.tech.id));
    return {
      active: rows.filter((r) => r.state === 'active').length,
      expiring: rows.filter((r) => r.state === 'expiring').length,
      revenue: recent.reduce((a, s) => a + s.price, 0),
      newSubs: recent.length,
      unsubscribed: techs.filter((t) => !subscribed.has(t.id)).length,
    };
  });

  protected readonly filterTabs = computed(() => {
    const rows = this.rows();
    return [
      { id: 'all' as SubFilter, label: 'الكل', count: rows.length },
      ...(['active', 'expiring', 'expired'] as SubscriptionState[]).map((s) => ({ id: s as SubFilter, label: SUB_STATE_META[s].label, count: rows.filter((r) => r.state === s).length })),
    ];
  });

  protected readonly filtered = computed(() => {
    const f = this.subFilter();
    const term = this.search().trim().toLowerCase();
    return this.rows()
      .filter((r) => f === 'all' || r.state === f)
      .filter((r) => !term || r.tech.name.toLowerCase().includes(term) || r.tech.phone.includes(term) || (r.pkg?.name ?? '').includes(term));
  });
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  protected readonly pageRows = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));

  protected setFilter(f: SubFilter): void {
    this.subFilter.set(f);
    this.page.set(1);
  }
  protected onSearch(v: string): void {
    this.search.set(v);
    this.page.set(1);
  }

  protected barPct(left: number, period: keyof typeof PERIOD_META | undefined): number {
    const days = period ? PERIOD_META[period].days : 30;
    return Math.max(0, Math.min(100, Math.round((left / days) * 100)));
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(p: TechPackage): void {
    this.editing.set(p);
    this.formOpen.set(true);
  }

  protected toggleActive(p: TechPackage): void {
    this.store.update(p.id, { active: !p.active });
    if (p.active) this.toast.warning(`تم إيقاف "${p.name}" — الاشتراكات الحالية تستمر حتى نهايتها`);
    else this.toast.success(`تم تفعيل "${p.name}" وأصبحت متاحة للفنيين`);
  }

  protected async remove(p: TechPackage): Promise<void> {
    if (this.store.hasSubscriptions(p.id)) {
      this.toast.error(`لا يمكن حذف "${p.name}" لوجود اشتراكات مرتبطة بها. يمكنك إيقافها بدلًا من ذلك.`);
      return;
    }
    const ok = await this.dialog.confirm({ title: 'حذف الباقة', message: `سيتم حذف "${p.name}" نهائيًا.`, confirmText: 'حذف', type: 'danger' });
    if (!ok) return;
    this.store.remove(p.id);
    this.toast.success(`تم حذف "${p.name}"`);
  }

  protected openTech(id: string): void {
    this.router.navigate(['/technicians', id]);
  }
}
