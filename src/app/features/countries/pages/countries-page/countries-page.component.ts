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
import { PackagesStore } from '../../../packages/packages.store';
import { CountryFormComponent } from '../../components/country-form/country-form.component';
import { CountryFlagComponent } from '../../country-flag.component';
import { CountriesStore } from '../../countries.store';
import { CountryScopeService } from '../../country-scope.service';
import { Country } from '../../countries.models';

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
  private readonly packages = inject(PackagesStore);
  private readonly scope = inject(CountryScopeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Country | null>(null);

  protected readonly rows = computed(() =>
    this.store.all().map((c) => {
      const inCountry = <T extends { countryId: string }>(list: T[]) => list.filter((x) => x.countryId === c.id);
      return {
        country: c,
        customers: inCountry(this.people.list('customers')()).length,
        technicians: inCountry(this.people.list('technicians')()).length,
        drivers: inCountry(this.people.list('drivers')()).length,
        services: inCountry(this.services.all()).filter((s) => s.active).length,
        packages: inCountry(this.packages.all()).filter((p) => p.active).length,
        bookings: inCountry(this.bookings.all()).length,
      };
    }),
  );

  protected readonly kpis = computed(() => {
    const all = this.store.all();
    const rows = this.rows();
    return {
      total: all.length,
      live: rows.filter((r) => r.services > 0).length,
      cities: all.reduce((a, c) => a + c.cities.length, 0),
      currencies: new Set(all.map((c) => c.currency)).size,
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

  protected async remove(c: Country): Promise<void> {
    const linked =
      this.people.countIn(c.id) + this.services.countIn(c.id) + this.bookings.countIn(c.id) + this.packages.countIn(c.id);
    if (linked > 0) {
      this.toast.error(`لا يمكن حذف ${c.name} لوجود ${linked} سجل مرتبط بها (حسابات وخدمات وباقات وحجوزات).`);
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
