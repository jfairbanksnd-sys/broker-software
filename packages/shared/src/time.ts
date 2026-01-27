export function toIso(d: Date): string {
  return d.toISOString();
}

export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

export function minutesUntil(iso: string, now = new Date()): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
}

export function isSameLocalDay(aISO: string, b: Date): boolean {
  const a = new Date(aISO);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function withinNextHours(iso: string, hours: number, now = new Date()): boolean {
  const t = new Date(iso).getTime();
  const n = now.getTime();
  return t >= n && t <= n + hours * 60 * 60 * 1000;
}

export function formatTimeWindow(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(start)}–${fmt.format(end)}`;
}
