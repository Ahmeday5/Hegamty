import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CONTENT_IMAGE_MAX_MB, CONTENT_IMAGE_TYPES, ContentImage, checkImageFiles } from '../../content-pages.models';
import { PendingImage } from '../../content-page-editor';

interface Tile {
  key: string;
  url: string;
  /** Published image, or `null` for one waiting to upload. */
  image: ContentImage | null;
  pending: PendingImage | null;
}

/**
 * Gallery of an app page: published images (deleted right away) and picked
 * ones waiting for the next save. Picking validates type and size and
 * reports every rejected file. The parent owns the actual state.
 */
@Component({
  selector: 'app-content-images',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ModalComponent],
  templateUrl: './content-images.component.html',
  styleUrl: './content-images.component.scss',
})
export class ContentImagesComponent {
  readonly images = input.required<ContentImage[]>();
  readonly pending = input.required<PendingImage[]>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly disabled = input(false);

  readonly add = output<File[]>();
  readonly unqueue = output<string>();
  readonly remove = output<ContentImage>();

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  protected readonly accept = CONTENT_IMAGE_TYPES.join(',');
  protected readonly maxMb = CONTENT_IMAGE_MAX_MB;
  protected readonly dragging = signal(false);
  protected readonly rejected = signal<string[]>([]);
  protected readonly viewing = signal<Tile | null>(null);
  private readonly broken = signal<ReadonlySet<string>>(new Set());

  protected readonly tiles = computed<Tile[]>(() => [
    ...this.images().map((image) => ({ key: image.id, url: image.url, image, pending: null })),
    ...this.pending().map((p) => ({ key: p.id, url: p.previewUrl, image: null, pending: p })),
  ]);
  protected readonly isBroken = (url: string) => this.broken().has(url);

  protected browse(): void {
    if (!this.disabled()) this.picker().nativeElement.click();
  }

  protected onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.take(Array.from(input.files ?? []));
    input.value = ''; // allow re-picking the same files
  }

  protected onDragOver(e: DragEvent): void {
    if (this.disabled()) return;
    e.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    if (!this.disabled()) this.take(Array.from(e.dataTransfer?.files ?? []));
  }

  protected markBroken(url: string): void {
    this.broken.update((s) => new Set(s).add(url));
  }

  protected dismissRejected(): void {
    this.rejected.set([]);
  }

  private take(files: File[]): void {
    if (!files.length) return;
    const { accepted, rejected } = checkImageFiles(files);
    this.rejected.set(rejected);
    if (accepted.length) this.add.emit(accepted);
  }
}
