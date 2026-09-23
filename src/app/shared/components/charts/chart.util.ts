/** Shared geometry helpers for the SVG chart components. */

export interface Pt {
  x: number;
  y: number;
}

/**
 * Smooth path through points (Catmull-Rom → cubic Bézier). `tension` 0 gives
 * straight segments; ~0.18 reads as a soft, non-overshooting curve.
 */
export function smoothPath(pts: readonly Pt[], tension = 0.18): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above `value`. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

let uid = 0;
/** Unique id prefix for `<defs>` gradients — several charts share a page. */
export function chartId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}
