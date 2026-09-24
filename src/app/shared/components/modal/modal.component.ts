import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  Renderer2,
  viewChild,
} from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

let openCount = 0;
@Component({
  selector: 'app-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="app-modal-backdrop"
        role="presentation"
        (click)="onBackdropClick($event)"
      >
        <div
          #dialog
          class="app-modal"
          [class.app-modal--sm]="size() === 'sm'"
          [class.app-modal--md]="size() === 'md'"
          [class.app-modal--lg]="size() === 'lg'"
          [class.app-modal--xl]="size() === 'xl'"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title() || null"
          tabindex="-1"
          (click)="$event.stopPropagation()"
        >
          @if (showHeader()) {
            <div class="app-modal-title">
              <span [class]="titleColorClass()">{{ title() }}</span>
              @if (showClose()) {
                <button
                  type="button"
                  class="app-modal-close"
                  aria-label="إغلاق"
                  (click)="close()"
                >&times;</button>
              }
            </div>
          }

          <div class="app-modal-body">
            <ng-content></ng-content>
          </div>

          <div class="app-modal-footer">
            <ng-content select="[modal-footer]"></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: contents; }
      .app-modal-body { font-size: 12px; color: var(--txt); }
      .app-modal-footer:empty { display: none; }
      /* Actions stay reachable at the bottom however long the form is */
      .app-modal-footer {
        position: sticky;
        bottom: calc(var(--modal-pad) * -1);
        z-index: 2;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
        margin: 16px calc(var(--modal-pad) * -1) calc(var(--modal-pad) * -1);
        padding: 12px var(--modal-pad) calc(12px + env(safe-area-inset-bottom, 0px));
        background: var(--white);
        border-top: 1px solid var(--brd);
      }
    `,
  ],
})
export class ModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly title = input<string>('');
  readonly size = input<ModalSize>('md');
  readonly closeOnEsc = input<boolean>(true);
  readonly closeOnBackdrop = input<boolean>(true);
  readonly showClose = input<boolean>(true);
  readonly showHeader = input<boolean>(true);
  readonly titleColorClass = input<string>('');

  // ── outputs ──
  readonly closed = output<void>();

  // ── refs ──
  private readonly dialogEl = viewChild<ElementRef<HTMLElement>>('dialog');

  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * True only while body has been locked by THIS modal instance.
   * Plain field — purely internal mechanical state, never read by the
   * template, so no need to be a signal (and writing signals from inside
   * an `effect` would trigger NG0600).
   */
  private hasLockedBody = false;

  constructor() {
    // Portal: move the host to <body> so the dialog is never trapped under an
    // ancestor's stacking context (animated/transformed page sections, the
    // sticky topbar) or clipped by an `overflow` container. Angular keeps the
    // bindings working because only the DOM node moves, not the view.
    const el = this.host.nativeElement;
    document.body.appendChild(el);
    this.destroyRef.onDestroy(() => el.remove());

    // Keep body scroll-lock state in sync with `open`. Reads `open()` (signal)
    // but only writes the plain `hasLockedBody` field — no NG0600 hazard.
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !this.hasLockedBody) {
        this.lockBody();
      } else if (!isOpen && this.hasLockedBody) {
        this.unlockBody();
      }
    });

    // Autofocus the dialog when it appears (next animation frame).
    effect(() => {
      if (!this.open()) return;
      queueMicrotask(() => this.dialogEl()?.nativeElement?.focus());
    });

    // Always release the lock if the component is destroyed while open.
    this.destroyRef.onDestroy(() => {
      if (this.hasLockedBody) this.unlockBody();
    });
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    if (!this.open() || !this.closeOnEsc()) return;
    this.close();
  }

  protected onBackdropClick(_event: MouseEvent): void {
    if (!this.closeOnBackdrop()) return;
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private lockBody(): void {
    openCount += 1;
    if (openCount === 1) {
      this.renderer.addClass(document.body, 'app-modal-open');
    }
    this.hasLockedBody = true;
  }

  private unlockBody(): void {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) {
      this.renderer.removeClass(document.body, 'app-modal-open');
    }
    this.hasLockedBody = false;
  }
}
