import { MenuSection } from '../models/menu-item.model';

/**
 * Sidebar navigation, grouped into sections. This is the file to edit when
 * adding/removing pages — the sidebar component only renders what's declared
 * here, filtered reactively by the current user's roles/permissions.
 *
 * `roles`/`permissions` are OR-gates: an item with both shows when the user
 * satisfies *either*. Omit both to make an item visible to everyone.
 */
export const NAV_SECTIONS: MenuSection[] = [
  {
    label: 'الرئيسية',
    items: [
      { id: 'dashboard', label: 'لوحة التحكم', route: '/dashboard', icon: 'grid' },
    ],
  },
  {
    label: 'العمليات',
    items: [
      { id: 'bookings', label: 'الحجوزات', route: '/bookings', icon: 'calendar' },
      { id: 'services', label: 'الخدمات', route: '/services', icon: 'droplet' },
    ],
  },
  {
    label: 'إدارة الحسابات',
    items: [
      { id: 'customers', label: 'العملاء', route: '/customers', icon: 'users' },
      { id: 'technicians', label: 'الفنيون', route: '/technicians', icon: 'stethoscope' },
      { id: 'drivers', label: 'السائقون', route: '/drivers', icon: 'car' },
    ],
  },
  {
    label: 'الإعدادات',
    items: [
      { id: 'countries', label: 'الدول والأسواق', route: '/countries', icon: 'globe' },
    ],
  },
];
