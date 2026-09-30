/**
 * Downloads rows as an Excel-friendly CSV: UTF-8 BOM (so Arabic renders
 * correctly), every cell quoted, CRLF line endings.
 */
export function downloadCsv(baseName: string, header: readonly string[], rows: readonly (readonly unknown[])[]): void {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
