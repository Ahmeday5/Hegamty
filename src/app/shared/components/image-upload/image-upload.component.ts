import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, model, signal, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

const DEFAULT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const TYPE_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'image/svg+xml': 'SVG',
};

/**
 * Single-image picker with drag & drop and a live preview.
 *
 *   <app-image-upload [(file)]="iconFile" [currentUrl]="section.iconUrl" inputId="icon" />
 *
 * `file` stays `null` until the user picks something, so "no new file" means
 * "keep `currentUrl`". Type and size are validated before the file is
 * accepted; the preview's object URL is always revoked.
 */
@Component({
  selector: 'app-image-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="iu" [class.is-drag]="dragging()" [class.is-invalid]="invalid() || !!error()" [class.is-disabled]="disabled()"
      [class.has-image]="!!previewUrl()"
      (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
      <div class="iu__preview" [class.is-empty]="!previewUrl()">
        @if (previewUrl(); as url) {
          <img [src]="url" alt="" (error)="brokenPreview.set(true)" />
        } @else {
          <app-icon name="panel" [size]="26" />
        }
      </div>

      <div class="iu__body">
        @if (file(); as f) {
          <strong class="iu__name" [attr.title]="f.name">{{ f.name }}</strong>
          <span class="iu__meta">{{ sizeLabel(f.size) }} · صورة جديدة</span>
        } @else if (previewUrl()) {
          <strong class="iu__name">الصورة الحالية</strong>
          <span class="iu__meta">اختر صورة جديدة لاستبدالها</span>
        } @else {
          <strong class="iu__name">اسحب الصورة هنا أو اخترها من جهازك</strong>
          <span class="iu__meta">{{ typesLabel() }} · حتى {{ maxSizeMb() }} ميجابايت</span>
        }
        <div class="iu__actions">
          <button type="button" class="btn btn-soft btn-sm" [disabled]="disabled()" (click)="browse()">
            <app-icon name="download" [size]="14" /> {{ previewUrl() ? 'تغيير الصورة' : 'اختيار صورة' }}
          </button>
          @if (file()) {
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled()" (click)="clear()">
              {{ currentUrl() ? 'استعادة الحالية' : 'إزالة' }}
            </button>
          }
        </div>
      </div>

      <input #picker class="iu__input" type="file" [id]="inputId()" [accept]="accept().join(',')" [disabled]="disabled()"
        [attr.aria-describedby]="error() ? inputId() + '-err' : null" (change)="onPick($event)" />
    </div>
    @if (error(); as e) { <div class="iu__err" [id]="inputId() + '-err'" role="alert">{{ e }}</div> }
  `,
  styles: [`
    :host { display: block; }
    .iu {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px;
      border: 1.5px dashed var(--brd2);
      border-radius: 14px;
      background: var(--bg);
      transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
    }
    .iu.has-image { border-style: solid; border-color: var(--brd); background: var(--white); }
    .iu.is-drag { border-color: var(--pr); border-style: dashed; background: var(--pr-l); box-shadow: 0 0 0 4px var(--pr-ring); }
    .iu.is-invalid { border-color: var(--re); }
    .iu.is-disabled { opacity: 0.65; }
    .iu__preview {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 72px;
      height: 72px;
      border-radius: 16px;
      overflow: hidden;
      /* checkerboard so transparent PNG/SVG icons stay visible on any color */
      background:
        conic-gradient(#eef3f3 25%, #ffffff 0 50%, #eef3f3 0 75%, #ffffff 0) 0 0 / 12px 12px;
      border: 1px solid var(--brd);
    }
    .iu__preview.is-empty { background: var(--white); color: var(--txt3); }
    .iu__preview img { width: 100%; height: 100%; object-fit: contain; }
    .iu__body { flex: 1; min-width: 0; display: grid; gap: 3px; }
    .iu__name { font-size: 13px; font-weight: 700; color: var(--txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .iu__meta { font-size: 11.5px; color: var(--txt3); }
    .iu__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .iu__input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .iu__err { margin-top: 6px; font-size: 11.5px; color: var(--re); }
  `],
})
export class ImageUploadComponent {
  readonly file = model<File | null>(null);
  readonly inputId = input.required<string>();
  /** Image already saved on the server (shown until a new file is picked). */
  readonly currentUrl = input<string | null>(null);
  readonly accept = input<readonly string[]>(DEFAULT_TYPES);
  readonly maxSizeMb = input(2);
  readonly invalid = input(false);
  readonly disabled = input(false);

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  protected readonly dragging = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly brokenPreview = signal(false);
  private readonly objectUrl = signal<string | null>(null);

  protected readonly previewUrl = computed(() => {
    const url = this.objectUrl() ?? this.currentUrl();
    return url && !this.brokenPreview() ? url : null;
  });
  protected readonly typesLabel = computed(() => this.accept().map((t) => TYPE_LABELS[t] ?? t).join(' · '));

  constructor() {
    // One object URL per picked file; cleanup releases it on change and on destroy.
    effect(
      (onCleanup) => {
        const f = this.file();
        this.brokenPreview.set(false);
        if (!f) {
          this.objectUrl.set(null);
          return;
        }
        const url = URL.createObjectURL(f);
        this.objectUrl.set(url);
        onCleanup(() => URL.revokeObjectURL(url));
      },
      { allowSignalWrites: true },
    );
    effect(() => {
      this.currentUrl();
      this.brokenPreview.set(false);
    }, { allowSignalWrites: true });
  }

  protected browse(): void {
    this.picker().nativeElement.click();
  }

  protected clear(): void {
    this.file.set(null);
    this.error.set(null);
  }

  protected onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.take(input.files?.[0]);
    input.value = ''; // allow re-picking the same file
  }

  protected onDragOver(e: DragEvent): void {
    if (this.disabled()) return;
    e.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    if (!this.disabled()) this.take(e.dataTransfer?.files?.[0]);
  }

  protected sizeLabel(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت` : `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت`;
  }

  private take(f: File | null | undefined): void {
    if (!f) return;
    if (!this.accept().includes(f.type)) {
      this.error.set(`نوع الملف غير مدعوم — المسموح: ${this.typesLabel()}`);
      return;
    }
    if (f.size > this.maxSizeMb() * 1024 * 1024) {
      this.error.set(`حجم الصورة أكبر من ${this.maxSizeMb()} ميجابايت`);
      return;
    }
    this.error.set(null);
    this.file.set(f);
  }
}
