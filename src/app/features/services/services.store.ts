import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ClinicService, ServiceDraft } from './services.models';
import { CountriesStore } from '../countries/countries.store';
import { PRICE_FACTOR } from '../people/people.mock';

const DAY = 86400000;

type Template = Omit<ClinicService, 'id' | 'createdAt' | 'countryId'>;

/** Base catalog, priced for SA; localized per market below. */
const CATALOG: Template[] = [
  { categoryId: 'CT-1', name: 'حجامة رطبة', description: 'الحجامة التقليدية بالشرط الخفيف لتنشيط الدورة الدموية.', price: 250, durationMin: 45, active: true, bookingsCount: 684, rating: 4.9 },
  { categoryId: 'CT-1', name: 'حجامة جافة', description: 'كاسات شفط بدون شرط لتخفيف آلام العضلات.', price: 180, durationMin: 30, active: true, bookingsCount: 431, rating: 4.8 },
  { categoryId: 'CT-1', name: 'حجامة رياضية', description: 'جلسة مخصصة للرياضيين لتسريع الاستشفاء.', price: 300, durationMin: 50, active: true, bookingsCount: 287, rating: 4.9 },
  { categoryId: 'CT-1', name: 'حجامة تجميلية', description: 'حجامة وجه لطيفة لتحسين نضارة البشرة.', price: 220, durationMin: 35, active: true, bookingsCount: 163, rating: 4.7 },
  { categoryId: 'CT-2', name: 'مساج علاجي', description: 'مساج للأنسجة العميقة يستهدف مناطق الشد والتيبس.', price: 200, durationMin: 60, active: true, bookingsCount: 198, rating: 4.6 },
  { categoryId: 'CT-2', name: 'مساج استرخائي', description: 'جلسة هادئة لتخفيف التوتر وتحسين النوم.', price: 170, durationMin: 45, active: true, bookingsCount: 142, rating: 4.7 },
  { categoryId: 'CT-3', name: 'العلاج بالإبر الجافة', description: 'تقنية دقيقة لإرخاء نقاط الألم العضلية المزمنة.', price: 280, durationMin: 40, active: false, bookingsCount: 74, rating: 4.5 },
  { categoryId: 'CT-4', name: 'جلسة استشارة', description: 'تقييم الحالة وتحديد نوع الجلسة المناسبة وعددها.', price: 100, durationMin: null, active: true, bookingsCount: 356, rating: 4.7 },
];

/** Which catalog entries each market sells. */
const MARKETS: Record<string, { items: number[]; demand: number }> = {
  SA: { items: [0, 1, 2, 3, 4, 5, 6, 7], demand: 1 },
  EG: { items: [0, 1, 2, 4, 7], demand: 0.55 },
  AE: { items: [0, 1, 2, 3, 4, 5, 7], demand: 0.4 },
  KW: { items: [0, 1, 4, 7], demand: 0.25 },
};

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/** Services catalog per country. "Copy to country" launches a service in another market. */
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

  countInCategory(categoryId: string): number {
    return this.items().filter((s) => s.categoryId === categoryId).length;
  }

  create(draft: ServiceDraft): ClinicService {
    const service: ClinicService = { ...draft, id: `SV-${this.nextNo()}`, bookingsCount: 0, rating: 0, createdAt: new Date().toISOString() };
    this.items.update((list) => [service, ...list]);
    return service;
  }

  /** Clones a service into another market, inactive, so the admin sets the local price first. */
  copyTo(id: string, countryId: string): ClinicService | undefined {
    const src = this.byId(id);
    if (!src) return undefined;
    const { name, description, categoryId, price, durationMin } = src;
    return this.create({ countryId, categoryId, name, description, price, durationMin, active: false });
  }

  update(id: string, draft: Partial<ServiceDraft>): void {
    this.items.update((list) => list.map((s) => (s.id === id ? { ...s, ...draft } : s)));
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((s) => s.id !== id));
  }

  private nextNo(): number {
    return 101 + this.items().reduce((m, s) => Math.max(m, Number(s.id.split('-')[1]) - 100 || 0), 0);
  }

  private seed(): ClinicService[] {
    let no = 101;
    return this.countries.all().flatMap((country) => {
      const m = MARKETS[country.id];
      const factor = PRICE_FACTOR[country.id];
      if (!m || !factor) return [];
      const step = factor < 0.2 ? 1 : factor > 3 ? 50 : 5;
      return m.items.map((idx, i) => {
        const t = CATALOG[idx];
        return {
          ...t,
          id: `SV-${no++}`,
          countryId: country.id,
          price: roundTo(t.price * factor, step),
          bookingsCount: Math.round(t.bookingsCount * m.demand),
          createdAt: new Date(Date.now() - (400 - i * 35) * DAY).toISOString(),
        };
      });
    });
  }
}
