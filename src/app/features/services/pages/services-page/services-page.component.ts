import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ServiceFormComponent } from '../../components/service-form/service-form.component';
import { ClinicService } from '../../services.models';
import { ServicesStore } from '../../services.store';
import { CategoriesStore } from '../../categories.store';
import { CountryScopeService } from '../../../countries/country-scope.service';
import { CountriesStore } from '../../../countries/countries.store';
import { CountryFlagComponent } from '../../../countries/country-flag.component';
import { COUNTRY_PIPES } from '../../../countries/country.pipes';

type SortKey = 'popular' | 'price-desc' | 'price-asc' | 'newest';
type View = 'cards' | 'table';
const VIEW_KEY = 'services_view';

@Component({
  selector: 'app-services-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, ServiceFormComponent, ModalComponent, CountryFlagComponent, ...FORMAT_PIPES, ...COUNTRY_PIPES],
  templateUrl: './services-page.component.html',
  styleUrl: './services-page.component.scss',
})
export class ServicesPageComponent {
  private readonly store = inject(ServicesStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly countries = inject(CountriesStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  protected readonly scope = inject(CountryScopeService);

  protected readonly sorts: { id: SortKey; label: string }[] = [
    { id: 'popular', label: 'الأكثر طلبًا' },
    { id: 'price-desc', label: 'السعر: من الأعلى' },
    { id: 'price-asc', label: 'السعر: من الأقل' },
    { id: 'newest', label: 'الأحدث' },
  ];

  protected readonly search = signal('');
  protected readonly category = signal<string>('all');
  protected readonly state = signal<'all' | 'active' | 'inactive'>('all');
  protected readonly sort = signal<SortKey>('popular');
  protected readonly view = signal<View>(this.readView());
  protected readonly loading = signal(true);
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ClinicService | null>(null);
  protected readonly copying = signal<ClinicService | null>(null);
  protected readonly copyTarget = signal('');

  private readonly all = computed(() => this.scope.filter(this.store.all()));

  protected readonly kpis = computed(() => {
    const list = this.all();
    return {
      total: list.length,
      active: list.filter((s) => s.active).length,
      categories: new Set(list.map((s) => s.categoryId)).size,
      bookings: list.reduce((a, s) => a + s.bookingsCount, 0),
    };
  });

  protected readonly categoryTabs = computed(() => {
    const list = this.all();
    return [
      { id: 'all', label: 'الكل', count: list.length },
      ...this.categoriesStore.all().map((c) => ({ id: c.id, label: c.name, count: list.filter((s) => s.categoryId === c.id).length })),
    ];
  });

  protected readonly topBookings = computed(() => Math.max(1, ...this.all().map((s) => s.bookingsCount)));
  protected readonly copyTargets = computed(() => {
    const src = this.copying();
    return src ? this.countries.all().filter((c) => c.id !== src.countryId) : [];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const cat = this.category();
    const state = this.state();
    const sort = this.sort();
    return this.all()
      .filter((s) => cat === 'all' || s.categoryId === cat)
      .filter((s) => state === 'all' || (state === 'active' ? s.active : !s.active))
      .filter((s) => !term || s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term))
      .sort((a, b) => {
        switch (sort) {
          case 'price-desc': return b.price - a.price;
          case 'price-asc': return a.price - b.price;
          case 'newest': return +new Date(b.createdAt) - +new Date(a.createdAt);
          default: return b.bookingsCount - a.bookingsCount;
        }
      });
  });

  protected readonly hasFilters = computed(() => !!this.search().trim() || this.category() !== 'all' || this.state() !== 'all');

  constructor() {
    effect((onCleanup) => {
      const t = setTimeout(() => this.loading.set(false), 450);
      onCleanup(() => clearTimeout(t));
    }, { allowSignalWrites: true });
  }

  protected categoryName(id: string): string {
    return this.categoriesStore.byId(id)?.name ?? '—';
  }

  protected setView(v: View): void {
    this.view.set(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  }

  protected resetFilters(): void {
    this.search.set('');
    this.category.set('all');
    this.state.set('all');
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(s: ClinicService): void {
    this.editing.set(s);
    this.formOpen.set(true);
  }

  protected toggleActive(s: ClinicService): void {
    this.store.update(s.id, { active: !s.active });
    if (s.active) this.toast.warning(`تم إيقاف خدمة "${s.name}" ولن تظهر للعملاء`);
    else this.toast.success(`تم تفعيل خدمة "${s.name}"`);
  }

  protected async remove(s: ClinicService): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف الخدمة',
      message: `سيتم حذف خدمة "${s.name}" نهائيًا ولن يتمكن العملاء من حجزها مجددًا.`,
      confirmText: 'حذف الخدمة',
      type: 'danger',
    });
    if (!ok) return;
    this.store.remove(s.id);
    this.toast.success(`تم حذف خدمة "${s.name}"`);
  }

  protected openCopy(s: ClinicService): void {
    this.copying.set(s);
    this.copyTarget.set(this.countries.all().find((c) => c.id !== s.countryId)?.id ?? '');
  }

  protected confirmCopy(): void {
    const src = this.copying();
    const target = this.copyTarget();
    if (!src || !target) return;
    this.store.copyTo(src.id, target);
    this.copying.set(null);
    this.toast.success(`تم نسخ "${src.name}" إلى ${this.countries.byId(target)?.name} كخدمة موقوفة — عدّل السعر بالعملة المحلية ثم فعّلها`);
  }

  private readView(): View {
    try {
      return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
    } catch {
      return 'cards';
    }
  }
}
