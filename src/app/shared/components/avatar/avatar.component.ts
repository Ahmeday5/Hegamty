import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

const TONES = [
  ['#e3f3f4', '#0f7c84'],
  ['#e8efff', '#2563eb'],
  ['#fef3e2', '#d97706'],
  ['#f1ebff', '#7c3aed'],
  ['#e0f5f2', '#0d9488'],
  ['#fdebf4', '#db2777'],
] as const;

/**
 * Profile photo when `src` is given and loads; otherwise an initial-letter
 * avatar with a stable, name-derived color. A single letter on purpose: two
 * Arabic initials would join into a ligature and read as a word.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="av" [class.av--ring]="ring()" [style.--s.px]="size()"
    [style.background]="tone()[0]" [style.color]="tone()[1]">
    @if (photo(); as url) {
      <img [src]="url" [alt]="name()" loading="lazy" decoding="async" (error)="failed.set(true)" />
    } @else {
      {{ initial() }}
    }
  </span>`,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .av {
      display: grid;
      place-items: center;
      width: var(--s);
      height: var(--s);
      border-radius: 50%;
      overflow: hidden;
      font-size: calc(var(--s) * 0.42);
      font-weight: 700;
      line-height: 1;
      user-select: none;
    }
    .av--ring { box-shadow: 0 0 0 4px #fff, 0 10px 24px -8px rgba(6, 74, 80, 0.35); }
    img { width: 100%; height: 100%; object-fit: cover; }
  `],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly src = input<string | null>(null);
  readonly size = input(38);
  readonly ring = input(false);

  protected readonly failed = signal(false);
  protected readonly photo = computed(() => (this.failed() ? null : this.src()));
  protected readonly initial = computed(() => this.name().trim().charAt(0) || '?');
  protected readonly tone = computed(() => {
    let h = 0;
    for (const ch of this.name()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TONES[h % TONES.length];
  });

  constructor() {
    // A new photo gets a fresh chance to load.
    effect(() => {
      this.src();
      this.failed.set(false);
    }, { allowSignalWrites: true });
  }
}
