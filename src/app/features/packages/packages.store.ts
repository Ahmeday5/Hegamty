import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { PeopleStore } from '../people/people.store';
import { CountriesStore } from '../countries/countries.store';
import { PRICE_FACTOR } from '../people/people.mock';
import { hash, int, pick, rng } from '../../shared/utils/random.util';
import {
  EXPIRING_DAYS,
  PERIOD_META,
  PackageDraft,
  PackagePeriod,
  Subscription,
  SubscriptionState,
  TechPackage,
} from './packages.models';

const DAY = 86400000;

const TEMPLATES: { name: string; period: PackagePeriod; price: number; featured: boolean; description: string; features: string[] }[] = [
  {
    name: 'الباقة الشهرية', period: 'monthly', price: 199, featured: false,
    description: 'ابدأ باستقبال الطلبات مع مرونة كاملة للتجديد شهريًا.',
    features: ['استقبال طلبات غير محدودة', 'الظهور في نتائج البحث', 'دعم فني عبر التطبيق'],
  },
  {
    name: 'الباقة الربع سنوية', period: 'quarterly', price: 499, featured: true,
    description: 'الخيار الأوفر للفنيين النشطين مع أولوية في الظهور.',
    features: ['استقبال طلبات غير محدودة', 'أولوية الظهور للعملاء', 'شارة فني موثّق', 'دعم فني مميز'],
  },
  {
    name: 'الباقة السنوية', period: 'yearly', price: 1699, featured: false,
    description: 'أفضل قيمة على مدار العام لمن يعمل بشكل دائم.',
    features: ['استقبال طلبات غير محدودة', 'أعلى أولوية في الظهور', 'شارة فني موثّق', 'تقارير أداء شهرية', 'دعم فني مميز'],
  },
];

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/**
 * Packages catalog + technician subscriptions. Fixtures give every seeded
 * market three packages and a realistic purchase history for technicians.
 */
@Injectable({ providedIn: 'root' })
export class PackagesStore {
  private readonly people = inject(PeopleStore);
  private readonly countries = inject(CountriesStore);

  private readonly items = signal<TechPackage[]>(this.seedPackages());
  private readonly subs = signal<Subscription[]>(this.seedSubscriptions());

  readonly all: Signal<TechPackage[]> = this.items.asReadonly();
  readonly subscriptions: Signal<Subscription[]> = this.subs.asReadonly();

  /** Latest subscription per technician. */
  private readonly latestByTech = computed(() => {
    const map = new Map<string, Subscription>();
    for (const s of this.subs()) {
      const cur = map.get(s.technicianId);
      if (!cur || +new Date(s.endsAt) > +new Date(cur.endsAt)) map.set(s.technicianId, s);
    }
    return map;
  });

  byId(id: string): TechPackage | undefined {
    return this.items().find((p) => p.id === id);
  }

  countIn(countryId: string): number {
    return this.items().filter((p) => p.countryId === countryId).length;
  }

  latestFor(technicianId: string): Subscription | undefined {
    return this.latestByTech().get(technicianId);
  }

  historyFor(technicianId: string): Subscription[] {
    return this.subs()
      .filter((s) => s.technicianId === technicianId)
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
  }

  stateOf(s: Subscription | undefined): SubscriptionState | 'none' {
    if (!s) return 'none';
    const left = this.daysLeft(s);
    return left <= 0 ? 'expired' : left <= EXPIRING_DAYS ? 'expiring' : 'active';
  }

  daysLeft(s: Subscription): number {
    return Math.ceil((+new Date(s.endsAt) - Date.now()) / DAY);
  }

  subscribersOf(packageId: string): number {
    return [...this.latestByTech().values()].filter((s) => s.packageId === packageId && this.stateOf(s) !== 'expired').length;
  }

  create(draft: PackageDraft): TechPackage {
    const pkg: TechPackage = { ...draft, id: `PK-${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString() };
    this.items.update((list) => [pkg, ...list]);
    return pkg;
  }

  update(id: string, draft: Partial<PackageDraft>): void {
    this.items.update((list) => list.map((p) => (p.id === id ? { ...p, ...draft } : p)));
  }

  hasSubscriptions(id: string): boolean {
    return this.subs().some((s) => s.packageId === id);
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((p) => p.id !== id));
  }

  // ─────────── fixtures ───────────

  private seedPackages(): TechPackage[] {
    return this.countries.all().flatMap((c) => {
      const factor = PRICE_FACTOR[c.id];
      if (!factor) return [];
      const step = factor < 0.2 ? 1 : factor > 3 ? 50 : 10;
      return TEMPLATES.map((t, i) => ({
        ...t,
        id: `PK-${c.id}-${i + 1}`,
        countryId: c.id,
        price: roundTo(t.price * factor, step),
        active: true,
        createdAt: new Date(Date.now() - (500 - i * 20) * DAY).toISOString(),
      }));
    });
  }

  private seedSubscriptions(): Subscription[] {
    const packages = this.items();
    const now = Date.now();
    const out: Subscription[] = [];
    for (const tech of this.people.list('technicians')()) {
      if (!tech.bookings) continue; // freshly registered, never subscribed
      const pool = packages.filter((p) => p.countryId === tech.countryId);
      if (!pool.length) continue;
      const r = rng(hash(tech.id + ':subs'));
      // Walk backwards from "now-ish" through 1–4 consecutive subscriptions.
      let end = now + (tech.status === 'active' ? int(r, -3, 80) : -int(r, 5, 120)) * DAY;
      for (let i = 0, n = int(r, 1, 4); i < n; i++) {
        const pkg = pick(r, pool);
        const start = end - PERIOD_META[pkg.period].days * DAY;
        if (start < +new Date(tech.joinedAt)) break;
        out.push({
          id: `SB-${tech.id}-${i}`,
          technicianId: tech.id,
          packageId: pkg.id,
          countryId: tech.countryId,
          price: pkg.price,
          startedAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
        });
        end = start - int(r, 0, 20) * DAY;
      }
    }
    return out;
  }
}
