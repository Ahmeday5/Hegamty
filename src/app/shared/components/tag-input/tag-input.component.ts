import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { foldText as tagKey } from '../../utils/text-normalize.util';

/**
 * Multi-value text input: type and press Enter (or paste a comma / newline
 * separated list) to add chips; Backspace on an empty field removes the last
 * one. Duplicates — within the list or against `exclude` — are rejected with
 * an inline hint instead of silently disappearing.
 *
 *   <app-tag-input [(values)]="names" inputId="gov" [exclude]="existing" />
 *
 * Call `commit()` before submitting so a half-typed value isn't lost.
 */
@Component({
  selector: 'app-tag-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="tags" [class.is-invalid]="invalid()" [class.is-disabled]="disabled()" (click)="focus()">
      @for (v of values(); track v; let i = $index) {
        <span class="tag">
          <span class="tag__text">{{ v }}</span>
          <button type="button" class="tag__x" [disabled]="disabled()" [attr.aria-label]="'إزالة ' + v"
            (click)="removeAt(i); $event.stopPropagation()">
            <app-icon name="x" [size]="11" [stroke]="2.6" />
          </button>
        </span>
      }
      <input #field [id]="inputId()" type="text" autocomplete="off" [value]="draft()" [disabled]="disabled()"
        [attr.maxlength]="maxLength()" [placeholder]="values().length ? '' : placeholder()"
        [attr.aria-invalid]="invalid() || null" [attr.aria-describedby]="notice() ? inputId() + '-notice' : null"
        (input)="onInput($any($event.target).value)" (keydown)="onKeydown($event)" (paste)="onPaste($event)"
        (blur)="commit()" />
    </div>
    @if (notice(); as n) {
      <div class="notice" [id]="inputId() + '-notice'" role="status">{{ n }}</div>
    }
  `,
  styles: [`
    :host { display: block; }
    .tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 6px 8px;
      border: 1.5px solid var(--brd);
      border-radius: var(--r);
      background: var(--white);
      cursor: text;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .tags:focus-within { border-color: var(--pr); box-shadow: 0 0 0 4px var(--pr-ring); }
    .tags.is-invalid { border-color: var(--re); }
    .tags.is-invalid:focus-within { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.12); }
    .tags.is-disabled { background: var(--bg3); cursor: not-allowed; }
    input {
      flex: 1 1 150px;
      min-width: 120px;
      border: none;
      outline: none;
      padding: 4px;
      font-family: inherit;
      font-size: 13px;
      color: var(--txt);
      background: transparent;
    }
    input::placeholder { color: #a0abb0; }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      padding: 3px 5px 3px 10px;
      border-radius: 999px;
      background: var(--pr-l);
      color: var(--pr-d);
      font-size: 12px;
      font-weight: 600;
      animation: fx-pop 0.2s var(--ease);
    }
    .tag__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag__x {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: rgba(6, 74, 80, 0.1);
      color: var(--pr-d);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .tag__x:hover:not(:disabled) { background: var(--re); color: var(--white); }
    .tag__x:focus-visible { outline: 2px solid var(--pr); outline-offset: 1px; }
    .notice { margin-top: 6px; font-size: 11.5px; font-weight: 500; color: #b45309; }
  `],
})
export class TagInputComponent {
  readonly values = model<string[]>([]);
  readonly inputId = input.required<string>();
  readonly placeholder = input('اكتب ثم اضغط Enter');
  /** Existing values that must not be added again (e.g. already saved items). */
  readonly exclude = input<readonly string[]>([]);
  readonly maxLength = input(80);
  readonly invalid = input(false);
  readonly disabled = input(false);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly draft = signal('');
  protected readonly notice = signal<string | null>(null);

  private readonly excludedKeys = computed(() => new Set(this.exclude().map(tagKey)));

  /** Flushes whatever is typed into chips. Returns the resulting list. */
  commit(): string[] {
    this.add(this.draft());
    this.draft.set('');
    return this.values();
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected onInput(value: string): void {
    this.notice.set(null);
    // Typing a separator commits the chip right away.
    if (/[,،\n]/.test(value)) {
      this.add(value);
      this.draft.set('');
      this.field().nativeElement.value = '';
    } else {
      this.draft.set(value);
    }
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.commit();
    } else if (e.key === 'Backspace' && !this.draft() && this.values().length) {
      this.removeAt(this.values().length - 1);
    }
  }

  protected onPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[,،\n\t]/.test(text)) return;
    e.preventDefault();
    this.add(text);
  }

  protected removeAt(index: number): void {
    this.values.update((list) => list.filter((_, i) => i !== index));
    this.notice.set(null);
  }

  private add(raw: string): void {
    const parts = raw.split(/[,،\n\t]+/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) return;

    const taken = new Set([...this.excludedKeys(), ...this.values().map(tagKey)]);
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const p of parts) {
      const key = tagKey(p);
      if (taken.has(key)) rejected.push(p);
      else {
        taken.add(key);
        accepted.push(p.slice(0, this.maxLength()));
      }
    }
    if (accepted.length) this.values.update((list) => [...list, ...accepted]);
    this.notice.set(rejected.length ? `تم تجاهل المكرر: ${rejected.join('، ')}` : null);
  }
}
