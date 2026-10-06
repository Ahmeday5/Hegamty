import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FORMAT_PIPES } from '../../../../shared/pipes/format.pipes';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { CONTENT_PAGE_META, ContentImage, ContentPageKind } from '../../content-pages.models';
import { ContentPageEditor } from '../../content-page-editor';
import { ContentTextEditorComponent } from '../../components/content-text-editor/content-text-editor.component';
import { ContentImagesComponent } from '../../components/content-images/content-images.component';
import { AppPreviewComponent } from '../../components/app-preview/app-preview.component';

/**
 * Editor for one of the app's static pages (`data.kind` on the route):
 * text, the about-us gallery and a live in-app preview. Text and new images
 * publish together; leaving with unsaved edits asks first.
 */
@Component({
  selector: 'app-content-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ContentTextEditorComponent, ContentImagesComponent, AppPreviewComponent, ...FORMAT_PIPES],
  providers: [ContentPageEditor],
  templateUrl: './content-page.component.html',
  styleUrl: './content-page.component.scss',
})
export class ContentPageComponent implements HasUnsavedChanges {
  /** Route data. */
  readonly kind = input.required<ContentPageKind>();

  protected readonly editor = inject(ContentPageEditor);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly meta = computed(() => CONTENT_PAGE_META[this.kind()]);
  protected readonly saved = this.editor.saved;
  protected readonly status = this.editor.status;
  /** Shows the "required" error only after a save attempt — not while the page is fresh. */
  protected readonly triedSave = signal(false);

  protected readonly previewImages = computed(() => [
    ...(this.saved()?.images ?? []).map((i) => i.url),
    ...this.editor.pending().map((p) => p.previewUrl),
  ]);
  protected readonly imageCount = computed(() => (this.saved()?.images.length ?? 0) + this.editor.pending().length);

  /** What changed, in words, for the save bar. */
  protected readonly changeSummary = computed(() => {
    const parts: string[] = [];
    if (this.editor.textChanged()) parts.push('تعديل النص');
    const n = this.editor.pending().length;
    if (n) parts.push(n === 1 ? 'صورة جديدة' : n === 2 ? 'صورتان جديدتان' : `${n} صور جديدة`);
    return parts.join(' و');
  });

  constructor() {
    effect(
      () => {
        const kind = this.kind();
        untracked(() => {
          this.triedSave.set(false);
          this.editor.load(kind);
        });
      },
      { allowSignalWrites: true },
    );
  }

  hasUnsavedChanges(): boolean {
    return this.editor.dirty() || this.editor.saving();
  }

  /** Closing / reloading the tab with unsaved edits triggers the browser's own prompt. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) e.preventDefault();
  }

  /** Ctrl/⌘ + S publishes. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.save();
    }
  }

  protected save(): void {
    this.triedSave.set(true);
    if (!this.editor.canSave()) return;
    const title = this.meta().title;
    this.editor
      .save()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.triedSave.set(false);
          this.toast.success(`تم نشر «${title}» وأصبحت التحديثات ظاهرة في التطبيق`);
        },
        error: (err: ApiError) => this.toast.error(apiErrorToMessage(err, 'تعذّر حفظ التغييرات، حاول مرة أخرى.'), { title: `«${title}»` }),
      });
  }

  protected async discard(): Promise<void> {
    if (!this.editor.dirty()) return;
    const ok = await this.dialog.confirm({
      title: 'تجاهل التغييرات',
      message: 'سيعود المحتوى إلى آخر نسخة منشورة وتُلغى الصور التي لم تُرفع بعد.',
      confirmText: 'تجاهل التغييرات',
      type: 'warning',
    });
    if (!ok) return;
    this.triedSave.set(false);
    this.editor.discard();
  }

  protected async reload(): Promise<void> {
    if (this.editor.dirty()) {
      const ok = await this.dialog.confirm({
        title: 'إعادة التحميل',
        message: 'سيتم تحميل آخر نسخة منشورة وستفقد تعديلاتك غير المحفوظة.',
        confirmText: 'إعادة التحميل',
        type: 'warning',
      });
      if (!ok) return;
    }
    this.triedSave.set(false);
    this.editor.reload();
  }

  protected queueImages(files: File[]): void {
    this.editor.queueImages(files);
  }

  protected async deleteImage(img: ContentImage): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف الصورة',
      message: 'ستُحذف الصورة من الصفحة في التطبيق فورًا، ولا يمكن التراجع عن ذلك.',
      confirmText: 'حذف الصورة',
      type: 'danger',
    });
    if (!ok) return;
    this.editor
      .deleteImage(img)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.success('تم حذف الصورة'),
        error: (err: ApiError) => this.toast.error(apiErrorToMessage(err, 'تعذّر حذف الصورة، حاول مرة أخرى.')),
      });
  }
}
