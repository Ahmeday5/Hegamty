export interface MenuItem {
  id: string;
  label: string;
  route: string;
  /** Icon name understood by the app's icon component — see `shared/components/icon`. */
  icon?: string;
  children?: MenuItem[];
  /** Item is hidden unless the current user holds at least one of these permissions. */
  permissions?: string[];
  /** Item is hidden unless the current user's role is one of these. */
  roles?: string[];
}

export interface MenuSection {
  label: string;
  items: MenuItem[];
}
