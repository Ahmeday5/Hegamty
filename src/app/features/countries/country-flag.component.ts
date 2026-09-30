import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CountriesStore } from './countries.store';
import { flagUrl } from './country-registry';

/**
 * Real country flag (bundled 4:3 SVGs from `flag-icons`, MIT — emoji flags
 * don't render on Windows). Countries outside the registry, or a flag that
 * fails to load, get a brand-colored monogram instead.
 *
 *   <app-country-flag [countryId]="b.countryId" [size]="20" />
 *   <app-country-flag [iso]="preview.iso" [name]="draftName" />   // live preview
 */
@Component({
  selector: 'app-country-flag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flag" [style.--w.px]="size()" [attr.title]="label()" role="img" [attr.aria-label]="label()">
      @if (src(); as url) {
        <img [src]="url" alt="" width="4" height="3" decoding="async" (error)="failed.set(true)" />
      } @else {
        <span class="flag__mono">{{ initial() }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; vertical-align: middle; }
    .flag {
      position: relative;
      display: grid;
      place-items: center;
      width: var(--w);
      aspect-ratio: 4 / 3;
      border-radius: max(2px, calc(var(--w) * 0.08));
      overflow: hidden;
      background: linear-gradient(135deg, #11868f, #064a50);
      box-shadow: 0 1px 2px rgba(10, 38, 42, 0.14);
    }
    /* Hairline inside the edge so white flag fields never melt into a white card. */
    .flag::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: inset 0 0 0 1px rgba(10, 38, 42, 0.14);
      pointer-events: none;
    }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .flag__mono {
      font-size: calc(var(--w) * 0.4);
      font-weight: 700;
      line-height: 1;
      color: #fff;
    }
  `],
})
export class CountryFlagComponent {
  /** Country to render; its ISO code and name come from the store. */
  readonly countryId = input<string | null | undefined>(null);
  /** Explicit ISO code (overrides the store lookup, e.g. for a form preview). */
  readonly iso = input<string | null | undefined>(undefined);
  /**
   * Explicit accessible name (overrides the store lookup). Without a
   * `countryId`, it is also matched against the store — for records that
   * reference their country by name only.
   */
  readonly name = input<string>('');
  /** Width in px; height follows the 4:3 ratio. */
  readonly size = input(24);

  private readonly countries = inject(CountriesStore);
  private readonly country = computed(() => {
    const id = this.countryId();
    return id ? this.countries.byId(id) : this.countries.byName(this.name());
  });

  protected readonly failed = signal(false);
  protected readonly label = computed(() => this.name() || this.country()?.name || '');
  protected readonly initial = computed(() => this.label().trim().replace(/^ال/, '').charAt(0) || '؟');
  protected readonly src = computed(() => {
    const iso = this.iso() !== undefined ? this.iso() : this.country()?.iso;
    return iso && !this.failed() ? flagUrl(iso) : null;
  });

  constructor() {
    // A new country / ISO gets a fresh attempt even if the previous image failed.
    effect(() => {
      this.iso();
      this.country();
      this.failed.set(false);
    }, { allowSignalWrites: true });
  }
}
