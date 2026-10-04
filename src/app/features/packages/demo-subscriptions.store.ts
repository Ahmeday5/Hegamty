import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { PeopleStore } from '../people/people.store';
import { CountriesStore } from '../countries/countries.store';
import { PRICE_FACTOR } from '../people/people.mock';
import { hash, int, pick, rng } from '../../shared/utils/random.util';
import { EXPIRING_DAYS, PERIOD_META, Subscription, SubscriptionState, SubscriptionSummary, TechPackage } from './packages.models';

const DAY = 86400000;

type Template = Pick<TechPackage, 'name' | 'durationDays' | 'price' | 'featured' | 'description' | 'features'>;

const TEMPLATES: Template[] = [
  {
    name: 'الباقة الربع سنوية', durationDays: PERIOD_META.quarterly.days, price: 499, featured: false,
    description: 'ابدأ باستقبال الطلبات مع مرونة التجديد كل 3 أشهر.',
    features: ['استقبال طلبات غير محدودة', 'الظهور في نتائج البحث', 'دعم فني عبر التطبيق'],
  },
  {
    name: 'الباقة النصف سنوية', durationDays: PERIOD_META.semiannual.days, price: 899, featured: true,
    description: 'الخيار الأوفر للفنيين النشطين مع أولوية في الظهور.',
    features: ['استقبال طلبات غير محدودة', 'أولوية الظهور للعملاء', 'شارة فني موثّق', 'دعم فني مميز'],
  },
  {
    name: 'باقة 9 أشهر', durationDays: PERIOD_META.ninemonths.days, price: 1249, featured: false,
    description: 'التزام أطول بسعر أقل للشهر الواحد.',
    features: ['استقبال طلبات غير محدودة', 'أولوية الظهور للعملاء', 'شارة فني موثّق', 'دعم فني مميز'],
  },
  {
    name: 'الباقة السنوية', durationDays: PERIOD_META.yearly.days, price: 1599, featured: false,
    description: 'أفضل قيمة على مدار العام لمن يعمل بشكل دائم.',
    features: ['استقبال طلبات غير محدودة', 'أعلى أولوية في الظهور', 'شارة فني موثّق', 'تقارير أداء شهرية', 'دعم فني مميز'],
  },
];

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/**
 * Demo technician subscriptions — there's no subscriptions endpoint yet.
 * Purchases reference their own seeded packages (not the live catalog, whose
 * ids are unrelated), so every view of this data is labelled "قيد التطوير".
 * Replace with the API when it lands, then delete this store.
 */
@Injectable({ providedIn: 'root' })
export class DemoSubscriptionsStore {
  private readonly people = inject(PeopleStore);
  private readonly countries = inject(CountriesStore);

  private readonly packages = signal<TechPackage[]>(this.seedPackages());
  private readonly subs = signal<Subscription[]>(this.seedSubscriptions());

  /** The seeded packages the demo purchases point to. */
  readonly all: Signal<TechPackage[]> = this.packages.asReadonly();
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
    return this.packages().find((p) => p.id === id);
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

  summaryFor(technicianId: string): SubscriptionSummary {
    const sub = this.latestFor(technicianId);
    const total = sub ? Math.max(1, (+new Date(sub.endsAt) - +new Date(sub.startedAt)) / DAY) : 1;
    const left = sub ? Math.max(0, this.daysLeft(sub)) : 0;
    return {
      sub,
      pkg: sub ? this.byId(sub.packageId) : undefined,
      state: this.stateOf(sub),
      left,
      pct: Math.round((left / total) * 100),
      history: this.historyFor(technicianId),
    };
  }

  // ─────────── fixtures ───────────

  private seedPackages(): TechPackage[] {
    return this.countries.all().flatMap((c) => {
      const factor = c.iso ? PRICE_FACTOR[c.iso] : undefined;
      if (!factor) return [];
      const step = factor < 0.2 ? 1 : factor > 3 ? 50 : 10;
      return TEMPLATES.map((t, i) => ({
        ...t,
        id: `PK-${c.id}-${i + 1}`,
        countryId: c.id,
        countryName: c.name,
        currency: c.currency,
        price: roundTo(t.price * factor, step),
        active: true,
      }));
    });
  }

  private seedSubscriptions(): Subscription[] {
    const packages = this.packages();
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
        const start = end - pkg.durationDays * DAY;
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
