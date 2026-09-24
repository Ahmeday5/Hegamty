import { Injectable, Signal, computed, signal } from '@angular/core';
import { Country, CountryDraft } from './countries.models';

const DAY = 86400000;

const SEED: Omit<Country, 'createdAt'>[] = [
  { id: 'SA', name: 'السعودية', currency: 'ريال', dialCode: '+966', cities: ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الطائف', 'أبها', 'تبوك', 'بريدة'] },
  { id: 'EG', name: 'مصر', currency: 'جنيه', dialCode: '+20', cities: ['القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا', 'أسيوط', 'الأقصر', 'بورسعيد'] },
  { id: 'AE', name: 'الإمارات', currency: 'درهم', dialCode: '+971', cities: ['دبي', 'أبوظبي', 'الشارقة', 'عجمان', 'العين', 'رأس الخيمة'] },
  { id: 'KW', name: 'الكويت', currency: 'دينار', dialCode: '+965', cities: ['مدينة الكويت', 'حولي', 'الفروانية', 'الجهراء', 'الأحمدي'] },
  { id: 'JO', name: 'الأردن', currency: 'دينار', dialCode: '+962', cities: ['عمّان', 'إربد', 'الزرقاء', 'العقبة'] },
];

/** Countries catalog — the root of every other record. */
@Injectable({ providedIn: 'root' })
export class CountriesStore {
  private readonly items = signal<Country[]>(
    SEED.map((c, i) => ({ ...c, createdAt: new Date(Date.now() - (720 - i * 120) * DAY).toISOString() })),
  );

  readonly all: Signal<Country[]> = this.items.asReadonly();
  private readonly byIdMap = computed(() => new Map(this.items().map((c) => [c.id, c])));

  byId(id: string | null | undefined): Country | undefined {
    return id ? this.byIdMap().get(id) : undefined;
  }

  currency(id: string): string {
    return this.byId(id)?.currency ?? '';
  }

  dialCodeTaken(code: string, exceptId?: string): boolean {
    return this.items().some((c) => c.dialCode === code && c.id !== exceptId);
  }

  create(draft: CountryDraft): Country {
    const country: Country = { ...draft, id: `C${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString() };
    this.items.update((list) => [...list, country]);
    return country;
  }

  update(id: string, draft: CountryDraft): void {
    this.items.update((list) => list.map((c) => (c.id === id ? { ...c, ...draft } : c)));
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((c) => c.id !== id));
  }
}
