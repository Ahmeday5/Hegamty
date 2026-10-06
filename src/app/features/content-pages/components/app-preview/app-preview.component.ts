import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';

/**
 * The page as the app renders it, inside a phone frame: app bar, an image
 * carousel (when there are images) and the text with its line breaks. It
 * follows the draft live, so the admin sees the result before publishing.
 */
@Component({
  selector: 'app-app-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ...FORMAT_PIPES],
  templateUrl: './app-preview.component.html',
  styleUrl: './app-preview.component.scss',
})
export class AppPreviewComponent {
  readonly title = input.required<string>();
  readonly content = input('');
  readonly images = input<string[]>([]);
  readonly updatedAt = input<string | null>(null);
  /** Labels the frame as showing unpublished edits. */
  readonly draft = input(false);

  protected readonly slide = signal(0);
  protected readonly hasText = computed(() => !!this.content().trim());
  /** The slide index stays valid when images are removed. */
  protected readonly activeSlide = computed(() => Math.min(this.slide(), Math.max(0, this.images().length - 1)));

  protected onScroll(e: Event): void {
    const el = e.target as HTMLElement;
    // RTL scrollLeft is ≤ 0 in modern browsers — the magnitude is what matters.
    this.slide.set(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
  }
}
