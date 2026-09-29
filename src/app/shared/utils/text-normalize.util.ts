/**
 * Folds text into a comparison key that ignores case, Arabic diacritics and
 * tatweel, and the spelling variants people type interchangeably
 * (أ/إ/آ → ا, ى → ي, ة → ه). Use for search matching and duplicate detection
 * — never for display.
 */
export function foldText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}
