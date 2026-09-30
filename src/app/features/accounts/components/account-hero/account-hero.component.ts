import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { DevBadgeComponent } from '../../../../shared/components/dev-status/dev-badge.component';

export interface HeroStat {
  label: string;
  /** `null` / empty renders "—". */
  value?: string | number | null;
  unit?: string;
  /** Not served by the backend yet — renders a "قيد التطوير" badge instead of a value. */
  dev?: boolean;
}

/**
 * Profile header of an account detail page: cover, photo, name, projected
 * meta line and chips, and a compact stats strip.
 *
 *   <app-account-hero [name]="c.fullName" [photoUrl]="c.photoUrl" [stats]="stats()">
 *     <ng-container heroMeta>…</ng-container>
 *     <ng-container heroChips>…</ng-container>
 *   </app-account-hero>
 */
@Component({
  selector: 'app-account-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, DevBadgeComponent],
  templateUrl: './account-hero.component.html',
  styleUrl: './account-hero.component.scss',
})
export class AccountHeroComponent {
  readonly name = input.required<string>();
  readonly photoUrl = input<string | null>(null);
  readonly stats = input<HeroStat[]>([]);
}
