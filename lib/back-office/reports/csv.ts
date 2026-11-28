/**
 * CSV that opens correctly in Excel and Google Sheets, and cannot run there.
 */

/** Sinhala and Tamil come out as mojibake in Excel without the BOM. */
const BOM = '﻿';

/**
 * Quote one cell, neutralising spreadsheet formulas.
 *
 * Titles and names here come from strangers' adverts. A cell starting with one
 * of these characters is EXECUTED by a spreadsheet, so it gets a leading
 * apostrophe. That is also why phone numbers are exported as 077 123 4567 and
 * never as +94… — see `localPhone`.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return BOM + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Sri Lanka has had one offset and no daylight saving since 2006. */
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-11-29 14:05" in Sri Lankan time, whatever zone the server runs in. */
export function colomboTimestamp(date: Date): string {
  return new Date(date.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

/** `import-follow-up_2026-11-29_14-05-33.csv` — sorts by time, legal everywhere. */
export function reportFileName(id: string, at: Date): string {
  const stamp = new Date(at.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 19);
  return `${id}_${stamp.replace('T', '_').replace(/:/g, '-')}.csv`;
}

/** Midnight in Colombo on a yyyy-mm-dd day, or null for anything else. */
export function colomboDayStart(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utc = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(utc)) return null;
  // Date.parse rolls 2026-02-31 over; a filter must not silently mean another day.
  if (new Date(utc).toISOString().slice(0, 10) !== day) return null;
  return new Date(utc - COLOMBO_OFFSET_MS);
}

/** "+94771234567" → "077 123 4567": dialable, and text to a spreadsheet. */
export function localPhone(e164: string): string {
  const lk = e164.match(/^\+94(\d{2})(\d{3})(\d{4})$/);
  if (lk) return `0${lk[1]} ${lk[2]} ${lk[3]}`;
  return e164.startsWith('+') ? `00${e164.slice(1)}` : e164;
}
