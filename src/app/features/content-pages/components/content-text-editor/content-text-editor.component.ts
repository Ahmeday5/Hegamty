import { ChangeDetectionStrategy, Component, ElementRef, afterRender, computed, input, model, viewChild } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { textStats } from '../../content-pages.models';

const BULLET = '• ';

/**
 * Plain-text editor for an app page: auto-growing textarea, a list shortcut
 * and live text stats. The apps render the text as-is, so line breaks and
 * "• " bullets are the only formatting.
 *
 *   <app-content-text-editor [(value)]="draft" inputId="about" placeholder="…" />
 */
@Component({
  selector: 'app-content-text-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ...FORMAT_PIPES],
  templateUrl: './content-text-editor.component.html',
  styleUrl: './content-text-editor.component.scss',
})
export class ContentTextEditorComponent {
  readonly value = model.required<string>();
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly label = input('المحتوى');

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');

  protected readonly stats = computed(() => textStats(this.value()));

  constructor() {
    // Grow with the text (no inner scrollbar) — also after programmatic changes like "discard".
    afterRender(() => {
      const el = this.area().nativeElement;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  }

  protected onInput(e: Event): void {
    this.value.set((e.target as HTMLTextAreaElement).value);
  }

  /** Toggles "• " at the start of every selected line (or the caret's line). */
  protected toggleBullets(): void {
    const el = this.area().nativeElement;
    const text = el.value;
    const from = text.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const toBreak = text.indexOf('\n', el.selectionEnd);
    const to = toBreak === -1 ? text.length : toBreak;
    const lines = text.slice(from, to).split('\n');
    const allBulleted = lines.every((l) => !l.trim() || l.startsWith(BULLET));
    const next = lines
      .map((l) => (!l.trim() ? l : allBulleted ? l.slice(BULLET.length) : l.startsWith(BULLET) ? l : BULLET + l))
      .join('\n');
    this.replace(from, to, next);
  }

  /** Enter on a bulleted line continues the list; Enter on an empty bullet ends it. */
  protected onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const el = this.area().nativeElement;
    if (el.selectionStart !== el.selectionEnd) return;
    const caret = el.selectionStart;
    const lineStart = el.value.lastIndexOf('\n', caret - 1) + 1;
    const line = el.value.slice(lineStart, caret);
    if (!line.startsWith(BULLET)) return;
    e.preventDefault();
    if (line === BULLET) this.replace(lineStart, caret, '');
    else this.replace(caret, caret, '\n' + BULLET);
  }

  private replace(from: number, to: number, insert: string): void {
    const el = this.area().nativeElement;
    el.focus();
    el.setSelectionRange(from, to);
    // execCommand keeps the browser's undo stack; fall back to a manual splice.
    const done = document.execCommand?.('insertText', false, insert);
    if (!done) {
      el.setRangeText(insert, from, to, 'end');
    }
    this.value.set(el.value);
  }
}
