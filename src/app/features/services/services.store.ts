import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ClinicService, ServiceDraft } from './services.models';
import { CountriesStore } from '../countries/countries.store';

const DAY = 86400000;

type Template = Omit<ClinicService, 'id' | 'createdAt' | 'countryId'>;

/** Base catalog, priced in SAR; localized per market below. */
const CATALOG: Template[] = [
  { name: 'حجامة رطبة', description: 'الحجامة التقليدية بالشرط الخفيف لإخراج الدم الفاسد وتنشيط الدورة الدموية.', category: 'cupping', price: 250, durationMin: 45, homeVisit: true, homeFee: 100, active: true, bookingsCount: 684, rating: 4.9, tone: 'green', icon: 'droplet' },
  { name: 'حجامة جافة', description: 'كاسات شفط بدون شرط لتخفيف آلام العضلات وتحسين المرونة.', category: 'cupping', price: 180, durationMin: 30, homeVisit: true, homeFee: 80, active: true, bookingsCount: 431, rating: 4.8, tone: 'blue', icon: 'droplet' },
  { name: 'حجامة رياضية', description: 'جلسة مخصصة للرياضيين لتسريع الاستشفاء وتقليل الإجهاد العضلي.', category: 'cupping', price: 300, durationMin: 50, homeVisit: false, homeFee: 0, active: true, bookingsCount: 287, rating: 4.9, tone: 'purple', icon: 'activity' },
  { name: 'حجامة تجميلية', description: 'حجامة وجه لطيفة لتحسين نضارة البشرة وتقليل الانتفاخ.', category: 'cupping', price: 220, durationMin: 35, homeVisit: false, homeFee: 0, active: true, bookingsCount: 163, rating: 4.7, tone: 'pink', icon: 'sparkles' },
  { name: 'حجامة منزلية شاملة', description: 'زيارة منزلية كاملة مع فني وسائق وتجهيزات معقمة بالكامل.', category: 'cupping', price: 350, durationMin: 60, homeVisit: true, homeFee: 0, active: true, bookingsCount: 239, rating: 4.8, tone: 'teal', icon: 'home' },
  { name: 'مساج علاجي', description: 'مساج للأنسجة العميقة يستهدف مناطق الشد والتيبس.', category: 'therapy', price: 200, durationMin: 60, homeVisit: true, homeFee: 90, active: true, bookingsCount: 198, rating: 4.6, tone: 'amber', icon: 'award' },
  { name: 'العلاج بالإبر الجافة', description: 'تقنية دقيقة لإرخاء نقاط الألم العضلية المزمنة.', category: 'therapy', price: 280, durationMin: 40, homeVisit: false, homeFee: 0, active: false, bookingsCount: 74, rating: 4.5, tone: 'purple', icon: 'stethoscope' },
  { name: 'جلسة استشارة', description: 'تقييم الحالة الصحية وتحديد نوع الجلسة المناسبة وعددها.', category: 'consultation', price: 100, durationMin: 20, homeVisit: false, homeFee: 0, active: true, bookingsCount: 356, rating: 4.7, tone: 'blue', icon: 'message' },
  { name: 'استشارة عن بُعد', description: 'مكالمة فيديو مع أخصائي لمتابعة الحالة بعد الجلسات.', category: 'consultation', price: 80, durationMin: 15, homeVisit: false, homeFee: 0, active: true, bookingsCount: 121, rating: 4.4, tone: 'teal', icon: 'smartphone' },
];

/** Which catalog entries each market sells, its local price factor and rounding step. */
const MARKETS: Record<string, { items: number[]; factor: number; step: number; demand: number }> = {
  SA: { items: [0, 1, 2, 3, 4, 5, 6, 7, 8], factor: 1, step: 5, demand: 1 },
  EG: { items: [0, 1, 2, 4, 5, 7], factor: 5.6, step: 50, demand: 0.55 },
  AE: { items: [0, 1, 2, 3, 4, 5, 7], factor: 1.05, step: 5, demand: 0.4 },
  KW: { items: [0, 1, 4, 7, 8], factor: 0.085, step: 1, demand: 0.25 },
};

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/**
 * Services catalog, per country: each record belongs to one market and is
 * priced in its currency. "Copy to country" on the services page is how an
 * admin launches an existing service in a new market.
 */
@Injectable({ providedIn: 'root' })
export class ServicesStore {
  private readonly countries = inject(CountriesStore);
  private readonly items = signal<ClinicService[]>(this.seed());

  readonly all: Signal<ClinicService[]> = this.items.asReadonly();
  readonly active = computed(() => this.items().filter((s) => s.active));

  byId(id: string): ClinicService | undefined {
    return this.items().find((s) => s.id === id);
  }

  countIn(countryId: string): number {
    return this.items().filter((s) => s.countryId === countryId).length;
  }

  create(draft: ServiceDraft): ClinicService {
    const service: ClinicService = {
      ...draft,
      id: `SV-${this.nextNo()}`,
      bookingsCount: 0,
      rating: 0,
      createdAt: new Date().toISOString(),
    };
    this.items.update((list) => [service, ...list]);
    return service;
  }

  /** Clones a service into another market, converting prices through the base currency. */
  copyTo(id: string, countryId: string): ClinicService | undefined {
    const src = this.byId(id);
    if (!src) return undefined;
    const from = this.countries.rate(src.countryId);
    const to = this.countries.rate(countryId);
    const step = to >= 5 ? 1 : to < 0.2 ? 10 : 5;
    const convert = (v: number) => (v ? roundTo((v * from) / to, step) : 0);
    return this.create({
      countryId,
      name: src.name,
      description: src.description,
      category: src.category,
      price: convert(src.price),
      durationMin: src.durationMin,
      homeVisit: src.homeVisit,
      homeFee: convert(src.homeFee),
      active: false, // launched inactive so the admin can review the localized price first
      tone: src.tone,
      icon: src.icon,
    });
  }

  update(id: string, draft: Partial<ServiceDraft>): void {
    this.items.update((list) => list.map((s) => (s.id === id ? { ...s, ...draft } : s)));
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((s) => s.id !== id));
  }

  private nextNo(): number {
    return 101 + this.items().reduce((m, s) => Math.max(m, Number(s.id.split('-')[1]) - 100), 0);
  }

  private seed(): ClinicService[] {
    let no = 101;
    return this.countries.active().flatMap((country) => {
      const m = MARKETS[country.id];
      if (!m) return [];
      return m.items.map((idx, i) => {
        const t = CATALOG[idx];
        return {
          ...t,
          id: `SV-${no++}`,
          countryId: country.id,
          price: roundTo(t.price * m.factor, m.step),
          homeFee: t.homeFee ? roundTo(t.homeFee * m.factor, m.step) : 0,
          bookingsCount: Math.round(t.bookingsCount * m.demand),
          createdAt: new Date(Date.now() - (400 - i * 35) * DAY).toISOString(),
        };
      });
    });
  }
}
