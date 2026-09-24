import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { DialogService } from '../../../core/services/dialog.service';
import { IconComponent, IconName } from '../../../shared/components/icon/icon.component';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { RelTimePipe } from '../../../shared/pipes/format.pipes';
import { formatLongDate } from '../../../shared/utils/format.util';
import { PeopleStore } from '../../../features/people/people.store';
import { PEOPLE_CONFIG } from '../../../features/people/people.config';
import { Person } from '../../../features/people/people.models';
import { CountriesStore } from '../../../features/countries/countries.store';
import { ALL_COUNTRIES, CountryScopeService } from '../../../features/countries/country-scope.service';
import { CountryFlagComponent } from '../../../features/countries/country-flag.component';
import { ToastService } from '../../../core/services/toast.service';

const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدير النظام',
  Manager: 'مدير',
  Staff: 'موظف',
};

interface SystemNote {
  id: number;
  icon: IconName;
  tone: string;
  title: string;
  text: string;
  date: string;
  read: boolean;
}

const MIN = 60000;

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, AvatarComponent, RelTimePipe, CountryFlagComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);
  private readonly people = inject(PeopleStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly layout = inject(LayoutService);
  protected readonly scope = inject(CountryScopeService);
  protected readonly countries = inject(CountriesStore).all;
  private readonly toast = inject(ToastService);
  protected readonly ALL = ALL_COUNTRIES;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly currentUser = this.authService.currentUser;
  protected readonly roleLabel = computed(() => {
    const role = this.currentUser()?.role ?? '';
    return ROLE_LABELS[role] ?? role;
  });
  protected readonly today = formatLongDate(new Date());

  // ── Global search ──
  protected readonly term = signal('');
  protected readonly searchFocused = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly results = computed(() => {
    const q = this.term().trim().toLowerCase();
    if (q.length < 2) return [];
    const all: Person[] = this.scope.filter([
      ...this.people.list('customers')(),
      ...this.people.list('technicians')(),
      ...this.people.list('drivers')(),
    ]);
    return all
      .filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 7)
      .map((p) => ({ person: p, kindLabel: PEOPLE_CONFIG[p.kind].singular, icon: PEOPLE_CONFIG[p.kind].icon }));
  });
  protected readonly showResults = computed(() => this.searchFocused() && this.term().trim().length >= 2);

  // ── Menus ──
  protected readonly openMenu = signal<'country' | 'notes' | 'user' | null>(null);
  protected readonly notes = signal<SystemNote[]>([
    { id: 1, icon: 'calendar', tone: 'green', title: 'حجز جديد', text: 'قام أحمد الغامدي بحجز جلسة حجامة رطبة', date: new Date(Date.now() - 4 * MIN).toISOString(), read: false },
    { id: 2, icon: 'user-plus', tone: 'blue', title: 'فني جديد بانتظار المراجعة', text: 'طلب انضمام من سارة القحطاني', date: new Date(Date.now() - 38 * MIN).toISOString(), read: false },
    { id: 3, icon: 'wallet', tone: 'purple', title: 'اشتراك جديد', text: 'اشترك الفني خالد العتيبي في الباقة الربع سنوية', date: new Date(Date.now() - 95 * MIN).toISOString(), read: false },
    { id: 4, icon: 'star', tone: 'amber', title: 'تقييم جديد ★★★★★', text: 'حصل الفني فهد الشهري على تقييم ممتاز', date: new Date(Date.now() - 5 * 60 * MIN).toISOString(), read: true },
    { id: 5, icon: 'ban', tone: 'red', title: 'إلغاء حجز', text: 'ألغت نورة الحربي موعدها المجدول غدًا', date: new Date(Date.now() - 26 * 60 * MIN).toISOString(), read: true },
  ]);
  protected readonly unread = computed(() => this.notes().filter((n) => !n.read).length);

  protected toggleMenu(menu: 'country' | 'notes' | 'user', event: Event): void {
    event.stopPropagation();
    this.openMenu.update((m) => (m === menu ? null : menu));
  }

  protected selectCountry(id: string): void {
    this.openMenu.set(null);
    if (id === this.scope.selected()) return;
    this.scope.select(id);
    this.toast.info(id === ALL_COUNTRIES ? 'يتم الآن عرض بيانات كل الدول' : `يتم الآن عرض بيانات ${this.scope.label()} فقط`);
  }

  protected markAllRead(): void {
    this.notes.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  protected onSearchInput(value: string): void {
    this.term.set(value);
    this.activeIndex.set(0);
  }

  protected onSearchKey(event: KeyboardEvent): void {
    const rows = this.results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = rows[this.activeIndex()];
      if (hit) this.openPerson(hit.person);
      else if (this.term().trim()) this.router.navigate(['/customers'], { queryParams: { q: this.term().trim() } });
    } else if (event.key === 'Escape') {
      (event.target as HTMLInputElement).blur();
    }
  }

  protected openPerson(p: Person): void {
    this.term.set('');
    this.searchFocused.set(false);
    this.searchInput()?.nativeElement.blur();
    this.router.navigate(['/', p.kind, p.id]);
  }

  protected onSearchBlur(): void {
    // Delay so a click on a result registers before the list unmounts.
    setTimeout(() => this.searchFocused.set(false), 150);
  }

  /** Ctrl/⌘ + K focuses the global search from anywhere. */
  @HostListener('document:keydown', ['$event'])
  protected onGlobalKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
    }
    if (event.key === 'Escape') this.openMenu.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.openMenu.set(null);
  }

  protected logout(): void {
    this.openMenu.set(null);
    this.dialog
      .confirm({
        title: 'تسجيل الخروج',
        message: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
        confirmText: 'تسجيل الخروج',
        type: 'warning',
      })
      .then((confirmed) => {
        if (confirmed) {
          this.authService.logout();
          this.layout.closeMobile();
        }
      });
  }
}
