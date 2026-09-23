import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../../../core/services/layout.service';
import { NAV_SECTIONS } from '../../../core/constants/nav.constants';
import { IconComponent, IconName } from '../../../shared/components/icon/icon.component';
import { AuthService } from '../../../core/auth/services/auth.service';
import { MenuItem } from '../../../core/models/menu-item.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);
  protected readonly version = environment.appVersion;

  /**
   * Sidebar reflows whenever the user's permission set changes (login,
   * cross-tab session refresh). Sections whose items all evaluate to
   * hidden are dropped wholesale so we don't render orphan headers.
   */
  protected readonly visibleSections = computed(() => {
    const set = this.auth.permissionSet();
    const role = this.auth.currentUser()?.role;
    return NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => this.isVisible(item, set, role)),
      }))
      .filter((section) => section.items.length > 0);
  });

  private isVisible(item: MenuItem, permissions: ReadonlySet<string>, role: string | undefined): boolean {
    const hasPermGate = !!item.permissions?.length;
    const hasRoleGate = !!item.roles?.length;
    // No gate at all → visible to everyone.
    if (!hasPermGate && !hasRoleGate) return true;
    // Gates are OR-ed: an item declaring both shows when the user satisfies
    // *either*. Items with a single gate are unaffected.
    const permMatch = hasPermGate && item.permissions!.some((p) => permissions.has(p));
    const roleMatch = hasRoleGate && !!role && item.roles!.includes(role);
    return permMatch || roleMatch;
  }

  protected iconName(item: MenuItem): IconName {
    return (item.icon as IconName) ?? 'grid';
  }
}
