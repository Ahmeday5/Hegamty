import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CountriesStore } from './countries.store';

/**
 * Stylized CSS flags for the seeded markets (flag emoji don't render on
 * Windows). Countries added later from the dashboard fall back to their ISO
 * code on the country's tone color.
 */
const FLAGS: Record<string, string> = {
  SA: 'linear-gradient(#006c35, #006c35)',
  EG: 'linear-gradient(#ce1126 0 33.3%, #fff 33.3% 66.6%, #000 66.6%)',
  AE: 'linear-gradient(90deg, #ef3340 0 26%, transparent 26%), linear-gradient(#00843d 0 33.3%, #fff 33.3% 66.6%, #000 66.6%)',
  KW: 'linear-gradient(90deg, #000 0 24%, transparent 24%), linear-gradient(#007a3d 0 33.3%, #fff 33.3% 66.6%, #ce1126 66.6%)',
  JO: 'linear-gradient(90deg, #ce1126 0 30%, transparent 30%), linear-gradient(#000 0 33.3%, #fff 33.3% 66.6%, #007a3d 66.6%)',
};

/** Brand-green badge with initials for markets added from the dashboard. */
const FALLBACK_BG = 'linear-gradient(135deg, #0c6a72, #064a50)';

@Component({
  selector: 'app-country-flag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flag" [style.--w.px]="size()" [style.background]="bg()" [attr.title]="name()" role="img"
      [attr.aria-label]="name()">
      @if (!known()) { <span class="flag__code">{{ initial() }}</span> }
      @if (code() === 'SA') { <span class="flag__sa"></span> }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .flag {
      position: relative;
      display: grid;
      place-items: center;
      width: var(--w);
      height: calc(var(--w) * 0.7);
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.08);
    }
    .flag__code { font-size: calc(var(--w) * 0.34); font-weight: 700; color: #fff; letter-spacing: 0.02em; }
    /* hint of the Saudi sword + script */
    .flag__sa { width: 60%; height: 8%; border-radius: 2px; background: rgba(255, 255, 255, 0.85); translate: 0 60%; }
  `],
})
export class CountryFlagComponent {
  readonly code = input.required<string>();
  readonly size = input(24);

  private readonly countries = inject(CountriesStore);
  protected readonly known = computed(() => this.code() in FLAGS);
  protected readonly name = computed(() => this.countries.byId(this.code())?.name ?? this.code());
  protected readonly initial = computed(() => this.countries.byId(this.code())?.name.charAt(0) ?? '؟');
  protected readonly bg = computed(() => FLAGS[this.code()] ?? FALLBACK_BG);
}
