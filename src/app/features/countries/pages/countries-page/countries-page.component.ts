import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { PeopleStore } from '../../../people/people.store';
import { ServicesStore } from '../../../services/services.store';
import { BookingsStore } from '../../../bookings/bookings.store';
import { CountryFormComponent } from '../../components/country-form/country-form.component';
import { CountryFlagComponent } from '../../country-flag.component';
import { CountriesStore } from '../../countries.store';
import { CountryScopeService } from '../../country-scope.service';
import { BASE_CURRENCY, Country } from '../../countries.models';

@Component({
  selector: 'app-countries-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, CountryFormComponent, CountryFlagComponent, ...FORMAT_PIPES],
  templateUrl: './countries-page.component.html',
  styleUrl: './countries-page.component.scss',
})
export class CountriesPageComponent {
  private readonly store = inject(CountriesStore);
  private readonly people = inject(PeopleStore);
  private readonly services = inject(ServicesStore);
  private readonly bookings = inject(BookingsStore);
  private readonly scope = inject(CountryScopeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly base = BASE_CURRENCY;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Country | null>(null);

  protected readonly rows = computed(() =>
    this.store.all().map((c) => {
      const inCountry = <T extends { countryId: string }>(list: T[]) => list.filter((x) => x.countryId === c.id);
      return {
        country: c,
        vatPct: Math.round(c.vatRate * 1000) / 10,
        customers: inCountry(this.people.list('customers')()).length,
        technicians: inCountry(this.people.list('technicians')()).length,
        drivers: inCountry(this.people.list('drivers')()).length,
        services: inCountry(this.services.all()).filter((s) => s.active).length,
        bookings: inCountry(this.bookings.all()).length,
      };
    }),
  );

  protected readonly kpis = computed(() => {
    const all = this.store.all();
    return {
      total: all.length,
      active: all.filter((c) => c.active).length,
      cities: all.reduce((a, c) => a + c.cities.length, 0),
      currencies: new Set(all.map((c) => c.currencyCode)).size,
    };
  });

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(c: Country): void {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  protected async toggleActive(c: Country): Promise<void> {
    if (c.active) {
      const ok = await this.dialog.confirm({
        title: `إيقاف ${c.name}`,
        message: `سيتم إخفاء ${c.name} من اختيار الدولة في التطبيق، ولن يتمكن عملاؤها من إنشاء حجوزات جديدة. تبقى جميع البيانات محفوظة ويمكنك إعادة التفعيل في أي وقت.`,
        confirmText: 'إيقاف الدولة',
        type: 'warning',
      });
      if (!ok) return;
    }
    this.store.update(c.id, { active: !c.active });
    if (c.active) this.toast.warning(`تم إيقاف ${c.name}`);
    else this.toast.success(`تم تفعيل ${c.name} وأصبحت متاحة في التطبيق`);
  }

  protected async remove(c: Country): Promise<void> {
    const linked = this.people.countIn(c.id) + this.services.countIn(c.id) + this.bookings.countIn(c.id);
    if (linked > 0) {
      this.toast.error(`لا يمكن حذف ${c.name} لوجود ${linked} سجل مرتبط بها (حسابات وخدمات وحجوزات). يمكنك إيقافها بدلًا من ذلك.`);
      return;
    }
    const ok = await this.dialog.confirm({
      title: `حذف ${c.name}`,
      message: `سيتم حذف ${c.name} نهائيًا من قائمة الدول.`,
      confirmText: 'حذف نهائي',
      type: 'danger',
    });
    if (!ok) return;
    this.store.remove(c.id);
    this.toast.success(`تم حذف ${c.name}`);
  }

  /** Jump to a page already scoped to this country. */
  protected viewIn(c: Country, path: string): void {
    this.scope.select(c.id);
    this.router.navigate([path]);
  }
}
