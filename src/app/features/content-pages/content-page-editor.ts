import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap, tap } from 'rxjs';
import { ApiError } from '../../core/models/api-response.model';
import { LoadStatus } from '../../core/models/load-status.model';
import { BusySet } from '../../core/utils/busy-set';
import { ContentPagesApi } from './content-pages.api';
import { ContentImage, ContentPage, ContentPageKind } from './content-pages.models';

/** A picked image waiting to be uploaded with the next save. */
export interface PendingImage {
  id: string;
  file: File;
  /** Object URL for the preview — revoked when the image leaves the queue. */
  previewUrl: string;
}

type LoadResult = { ok: true; page: ContentPage } | { ok: false; message: string };

let pendingSeq = 0;

/**
 * Editing state of one app page: the published version, the local draft and
 * the images queued for upload. Provide it on the page component, so each
 * visit starts clean and object URLs die with the page.
 *
 * Text and new images are published together by `save()`; deleting an
 * existing image is immediate (its own endpoint) and never touches the draft.
 */
@Injectable()
export class ContentPageEditor {
  private readonly api = inject(ContentPagesApi);
  private readonly loads = new Subject<ContentPageKind>();

  private readonly kindState = signal<ContentPageKind>('about');
  private readonly loadStatus = signal<LoadStatus>('idle');
  private readonly loadError = signal<string | null>(null);
  private readonly published = signal<ContentPage | null>(null);
  private readonly pendingImages = signal<PendingImage[]>([]);
  private readonly savingState = signal(false);
  private readonly deleting = new BusySet();

  readonly kind = this.kindState.asReadonly();
  readonly status = this.loadStatus.asReadonly();
  readonly error = this.loadError.asReadonly();
  /** As stored on the server; `null` until the first load. */
  readonly saved = this.published.asReadonly();
  readonly draft = signal('');
  readonly pending = this.pendingImages.asReadonly();
  readonly saving = this.savingState.asReadonly();
  readonly deletingIds = this.deleting.ids;

  readonly textChanged = computed(() => {
    const saved = this.published();
    return !!saved && this.draft() !== saved.content;
  });
  readonly dirty = computed(() => this.textChanged() || this.pendingImages().length > 0);
  readonly blank = computed(() => !this.draft().trim());
  readonly canSave = computed(() => this.dirty() && !this.blank() && !this.savingState() && this.loadStatus() === 'ready');

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.loads
      .pipe(
        switchMap((kind) =>
          this.api.get(kind).pipe(
            map((page): LoadResult => ({ ok: true, page })),
            catchError((err: ApiError) => of<LoadResult>({ ok: false, message: err?.message || 'تعذّر تحميل المحتوى' })),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((res) => {
        if (!res.ok) {
          this.loadError.set(res.message);
          this.loadStatus.set('error');
          return;
        }
        this.published.set(res.page);
        this.draft.set(res.page.content);
        this.loadStatus.set('ready');
      });
    destroyRef.onDestroy(() => this.clearPending());
  }

  /** Loads (or reloads) the page, dropping local edits. */
  load(kind: ContentPageKind): void {
    this.kindState.set(kind);
    this.clearPending();
    this.loadStatus.set('loading');
    this.loadError.set(null);
    this.loads.next(kind);
  }

  reload(): void {
    this.load(this.kindState());
  }

  /** Back to the published version. */
  discard(): void {
    this.draft.set(this.published()?.content ?? '');
    this.clearPending();
  }

  queueImages(files: readonly File[]): void {
    const added = files.map((file): PendingImage => ({ id: `new-${++pendingSeq}`, file, previewUrl: URL.createObjectURL(file) }));
    this.pendingImages.update((list) => [...list, ...added]);
  }

  unqueueImage(id: string): void {
    const img = this.pendingImages().find((p) => p.id === id);
    if (!img) return;
    URL.revokeObjectURL(img.previewUrl);
    this.pendingImages.update((list) => list.filter((p) => p.id !== id));
  }

  /** Publishes the draft and queued images; the response becomes the new baseline. */
  save(): Observable<ContentPage> {
    const kind = this.kindState();
    const content = this.draft();
    const files = this.pendingImages().map((p) => p.file);
    this.savingState.set(true);
    return this.api.update(kind, content, files).pipe(
      tap({
        next: (page) => {
          this.published.set(page);
          // Keep anything typed while the request was in flight.
          if (this.draft() === content) this.draft.set(page.content);
          this.clearPending();
          this.savingState.set(false);
        },
        error: () => this.savingState.set(false),
      }),
    );
  }

  /** Deletes a published image right away; the draft is left alone. */
  deleteImage(img: ContentImage): Observable<ContentPage> {
    return this.deleting.track(
      img.id,
      this.api.deleteAboutImage(img.id).pipe(
        tap((page) => this.published.update((cur) => (cur ? { ...cur, images: page.images, updatedAt: page.updatedAt } : page))),
      ),
    );
  }

  private clearPending(): void {
    for (const p of this.pendingImages()) URL.revokeObjectURL(p.previewUrl);
    this.pendingImages.set([]);
  }
}
