import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/**
 * A section's uploaded icon image, framed on white so any artwork stays
 * legible. Falls back to a neutral glyph when there's no image or it fails
 * to load (e.g. a deleted file on the server).
 *
 *   <app-section-icon [url]="section.iconUrl" [size]="44" />
 */
@Component({
  selector: 'app-section-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <span class="si" [class.is-fallback]="!url() || failed()" [style.--s.px]="size()">
      @if (url() && !failed()) {
        <img [src]="url()" alt="" loading="lazy" decoding="async" (error)="failed.set(true)" />
      } @else {
        <app-icon name="grid" [size]="size() * 0.46" />
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .si {
      display: grid;
      place-items: center;
      width: var(--s);
      height: var(--s);
      border-radius: calc(var(--s) * 0.3);
      background: var(--white);
      border: 1px solid #d6e9ea;
      box-shadow: 0 1px 2px rgba(10, 38, 42, 0.06);
      overflow: hidden;
    }
    .si img { width: 76%; height: 76%; object-fit: contain; }
    .si.is-fallback { background: var(--grad-pr); border-color: transparent; color: var(--white); }
  `],
})
export class SectionIconComponent {
  readonly url = input<string | null>(null);
  readonly size = input(40);

  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      this.url();
      this.failed.set(false);
    }, { allowSignalWrites: true });
  }
}
