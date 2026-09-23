import { Injectable, Signal, computed, signal } from '@angular/core';
import { Country, CountryDraft } from './countries.models';

const DAY = 86400000;

const SEED: Omit<Country, 'createdAt'>[] = [
  {
    id: 'SA', name: 'السعودية', currencyCode: 'SAR', currencySymbol: 'ر.س', phoneCode: '+966', phoneLength: 10,
    vatRate: 0.15, rateToBase: 1, active: true, tone: 'green',
    cities: ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الطائف', 'أبها', 'تبوك', 'بريدة'],
  },
  {
    id: 'EG', name: 'مصر', currencyCode: 'EGP', currencySymbol: 'ج.م', phoneCode: '+20', phoneLength: 11,
    vatRate: 0.14, rateToBase: 0.077, active: true, tone: 'red',
    cities: ['القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا', 'أسيوط', 'الأقصر', 'بورسعيد'],
  },
  {
    id: 'AE', name: 'الإمارات', currencyCode: 'AED', currencySymbol: 'د.إ', phoneCode: '+971', phoneLength: 10,
    vatRate: 0.05, rateToBase: 1.02, active: true, tone: 'teal',
    cities: ['دبي', 'أبوظبي', 'الشارقة', 'عجمان', 'العين', 'رأس الخيمة'],
  },
  {
    id: 'KW', name: 'الكويت', currencyCode: 'KWD', currencySymbol: 'د.ك', phoneCode: '+965', phoneLength: 8,
    vatRate: 0, rateToBase: 12.2, active: true, tone: 'blue',
    cities: ['مدينة الكويت', 'حولي', 'الفروانية', 'الجهراء', 'الأحمدي'],
  },
  {
    id: 'JO', name: 'الأردن', currencyCode: 'JOD', currencySymbol: 'د.أ', phoneCode: '+962', phoneLength: 10,
    vatRate: 0.16, rateToBase: 5.29, active: false, tone: 'purple',
    cities: ['عمّان', 'إربد', 'الزرقاء', 'العقبة'],
  },
];

/**
 * Countries catalog — the root of every other record. Seeded locally until
 * the backend exposes `/countries`.
 */
@Injectable({ providedIn: 'root' })
export class CountriesStore {
  private readonly items = signal<Country[]>(
    SEED.map((c, i) => ({ ...c, createdAt: new Date(Date.now() - (720 - i * 120) * DAY).toISOString() })),
  );

  readonly all: Signal<Country[]> = this.items.asReadonly();
  readonly active = computed(() => this.items().filter((c) => c.active));
  private readonly byIdMap = computed(() => new Map(this.items().map((c) => [c.id, c])));

  byId(id: string | null | undefined): Country | undefined {
    return id ? this.byIdMap().get(id) : undefined;
  }

  symbol(id: string): string {
    return this.byId(id)?.currencySymbol ?? '';
  }

  vat(id: string): number {
    return this.byId(id)?.vatRate ?? 0;
  }

  rate(id: string): number {
    return this.byId(id)?.rateToBase ?? 1;
  }

  create(draft: CountryDraft): Country {
    const country: Country = { ...draft, id: draft.id.toUpperCase(), createdAt: new Date().toISOString() };
    this.items.update((list) => [...list, country]);
    return country;
  }

  update(id: string, draft: Partial<CountryDraft>): void {
    this.items.update((list) => list.map((c) => (c.id === id ? { ...c, ...draft, id: c.id } : c)));
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((c) => c.id !== id));
  }
}
