import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

export interface AccountDocument {
  key: string;
  label: string;
  /** Absolute URL, or `null` when the user didn't upload it. */
  url: string | null;
  icon: IconName;
}

/**
 * Images uploaded from the app at registration, as thumbnails that open a
 * full-size viewer. Missing or broken images degrade to a labelled
 * placeholder instead of a broken `<img>`.
 */
@Component({
  selector: 'app-account-documents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ModalComponent],
  templateUrl: './account-documents.component.html',
  styleUrl: './account-documents.component.scss',
})
export class AccountDocumentsComponent {
  readonly docs = input.required<AccountDocument[]>();
  /** Account name, for the viewer title and image alt text. */
  readonly owner = input.required<string>();

  private readonly broken = signal<ReadonlySet<string>>(new Set());
  protected readonly viewingKey = signal<string | null>(null);

  protected readonly items = computed(() => {
    const broken = this.broken();
    return this.docs().map((d) => ({ ...d, url: d.url && !broken.has(d.url) ? d.url : null }));
  });
  protected readonly uploaded = computed(() => this.items().filter((d) => d.url).length);
  protected readonly viewing = computed(() => this.items().find((d) => d.key === this.viewingKey() && d.url) ?? null);

  protected markBroken(url: string): void {
    this.broken.update((set) => new Set(set).add(url));
  }
}
