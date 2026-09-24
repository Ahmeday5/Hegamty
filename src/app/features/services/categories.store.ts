import { Injectable, Signal, signal } from '@angular/core';
import { CategoryDraft, ServiceCategory } from './services.models';

const DAY = 86400000;

const SEED: Omit<ServiceCategory, 'createdAt'>[] = [
  { id: 'CT-1', name: 'الحجامة', description: 'جلسات الحجامة بأنواعها الرطبة والجافة والرياضية والتجميلية.', active: true },
  { id: 'CT-2', name: 'المساج', description: 'جلسات المساج العلاجي والاسترخائي.', active: true },
  { id: 'CT-3', name: 'العلاج الطبيعي', description: 'تقنيات علاجية مساندة مثل الإبر الجافة والتمارين.', active: true },
  { id: 'CT-4', name: 'الاستشارات', description: 'تقييم الحالة ومتابعتها قبل الجلسات وبعدها.', active: true },
];

/** Service categories, shared by every country's catalog. */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly items = signal<ServiceCategory[]>(
    SEED.map((c, i) => ({ ...c, createdAt: new Date(Date.now() - (600 - i * 30) * DAY).toISOString() })),
  );

  readonly all: Signal<ServiceCategory[]> = this.items.asReadonly();

  byId(id: string): ServiceCategory | undefined {
    return this.items().find((c) => c.id === id);
  }

  create(draft: CategoryDraft): ServiceCategory {
    const cat: ServiceCategory = { ...draft, id: `CT-${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString() };
    this.items.update((list) => [...list, cat]);
    return cat;
  }

  update(id: string, draft: Partial<CategoryDraft>): void {
    this.items.update((list) => list.map((c) => (c.id === id ? { ...c, ...draft } : c)));
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((c) => c.id !== id));
  }
}
