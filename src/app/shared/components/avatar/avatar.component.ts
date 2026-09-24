import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const TONES = [
  ['#e3f3f4', '#0f7c84'],
  ['#e8efff', '#2563eb'],
  ['#fef3e2', '#d97706'],
  ['#f1ebff', '#7c3aed'],
  ['#e0f5f2', '#0d9488'],
  ['#fdebf4', '#db2777'],
] as const;

/**
 * Initial-letter avatar with a stable, name-derived color. A single letter
 * on purpose: two Arabic initials would join into a ligature and read as a
 * word.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="av" [class.av--ring]="ring()" [style.--s.px]="size()"
    [style.background]="tone()[0]" [style.color]="tone()[1]">{{ initial() }}</span>`,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .av {
      display: grid;
      place-items: center;
      width: var(--s);
      height: var(--s);
      border-radius: 50%;
      font-size: calc(var(--s) * 0.42);
      font-weight: 700;
      line-height: 1;
      user-select: none;
    }
    .av--ring { box-shadow: 0 0 0 4px #fff, 0 10px 24px -8px rgba(6, 74, 80, 0.35); }
  `],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input(38);
  readonly ring = input(false);

  protected readonly initial = computed(() => this.name().trim().charAt(0) || '?');
  protected readonly tone = computed(() => {
    let h = 0;
    for (const ch of this.name()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TONES[h % TONES.length];
  });
}
