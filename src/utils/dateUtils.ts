/** Local calendar day helpers — never use toISOString() for "today" (UTC skew). */

export function localISODay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftLocalDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localISODay(d);
}

/** Parse YYYY-MM-DD as local noon to avoid DST/UTC edge cases. */
export function parseLocalDay(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseLocalDay(b).getTime() - parseLocalDay(a).getTime();
  return Math.round(ms / 86_400_000);
}
