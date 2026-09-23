/**
 * Dashboard presentation constants. All figures themselves are derived live
 * from the stores (see DashboardComponent), so they follow the country scope.
 */

export type Period = 'week' | 'month' | 'year';

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'أسبوع' },
  { id: 'month', label: 'شهر' },
  { id: 'year', label: 'سنة' },
];

export const SERIES_COLORS = { current: '#20843d', previous: '#93c5fd' } as const;

export const SHARE_COLORS = ['#20843d', '#2563eb', '#7c3aed', '#0d9488', '#db2777', '#d97706'] as const;
