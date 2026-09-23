import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Reusable, accessible pagination control.
 *
 *   <app-pagination
 *     [pageIndex]="pageIndex()"
 *     [pageSize]="pageSize()"
 *     [count]="count()"
 *     [totalPages]="totalPages()"
 *     [showPageSize]="false"
 *     [disabled]="loading()"
 *     (pageChange)="onPageChange($event)"
 *     (pageSizeChange)="onPageSizeChange($event)" />
 *
 * Conventions:
 *   - `pageIndex` is **1-based** — adjust to match your backend's convention.
 *   - `count` is the total number of records across all pages.
 *   - The component renders nothing when `count === 0`.
 */
export interface PageWindowItem {
  page: number | null;
  active: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const WINDOW_SIZE = 5;

@Component({
  selector: 'app-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  // ── inputs ──
  readonly pageIndex = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly count = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageSizeOptions = input<readonly number[]>(DEFAULT_PAGE_SIZE_OPTIONS);
  readonly showPageSize = input<boolean>(true);
  readonly disabled = input<boolean>(false);

  // ── outputs ──
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  // ── internal state ──
  protected readonly jumpInput = signal('');

  // ── derived ──
  protected readonly fromIndex = computed(() => {
    if (this.count() === 0) return 0;
    return (this.pageIndex() - 1) * this.pageSize() + 1;
  });

  protected readonly toIndex = computed(() =>
    Math.min(this.pageIndex() * this.pageSize(), this.count()),
  );

  protected readonly canPrev = computed(() => this.pageIndex() > 1);
  protected readonly canNext = computed(() => this.pageIndex() < this.totalPages());
  protected readonly canFirst = computed(() => this.pageIndex() > 1);
  protected readonly canLast = computed(() => this.pageIndex() < this.totalPages());

  protected readonly windowItems = computed<PageWindowItem[]>(() => {
    const total = this.totalPages();
    const current = this.pageIndex();
    if (total <= 0) return [];

    if (total <= WINDOW_SIZE + 2) {
      return Array.from({ length: total }, (_, i) => ({
        page: i + 1,
        active: i + 1 === current,
      }));
    }

    const half = Math.floor(WINDOW_SIZE / 2);
    let start = Math.max(2, current - half);
    let end = Math.min(total - 1, current + half);

    if (current - half < 2) end = Math.min(total - 1, start + WINDOW_SIZE - 1);
    if (current + half > total - 1) start = Math.max(2, end - WINDOW_SIZE + 1);

    const items: PageWindowItem[] = [{ page: 1, active: current === 1 }];
    if (start > 2) items.push({ page: null, active: false });

    for (let p = start; p <= end; p++) {
      items.push({ page: p, active: p === current });
    }

    if (end < total - 1) items.push({ page: null, active: false });
    items.push({ page: total, active: current === total });
    return items;
  });

  // ── handlers ──

  protected goTo(page: number | null): void {
    if (page === null || this.disabled()) return;
    if (page < 1 || page > this.totalPages()) return;
    if (page === this.pageIndex()) return;
    this.pageChange.emit(page);
  }

  protected goToFirst(): void { this.goTo(1); }
  protected goToLast(): void { this.goTo(this.totalPages()); }
  protected prev(): void { if (this.canPrev()) this.goTo(this.pageIndex() - 1); }
  protected next(): void { if (this.canNext()) this.goTo(this.pageIndex() + 1); }

  protected onPageSizeChange(value: string): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return;
    this.pageSizeChange.emit(size);
  }

  protected onJumpKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.commitJump();
  }

  protected commitJump(): void {
    const page = parseInt(this.jumpInput(), 10);
    this.jumpInput.set('');
    if (!Number.isFinite(page)) return;
    this.goTo(Math.max(1, Math.min(page, this.totalPages())));
  }
}
