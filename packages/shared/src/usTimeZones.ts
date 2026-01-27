// packages/shared/src/usTimeZones.ts

export type UsZoneKey = 'PT' | 'MT' | 'CT' | 'ET';

const STATE_TO_ZONE: Record<string, UsZoneKey> = {
  // Pacific
  WA: 'PT', OR: 'PT', CA: 'PT', NV: 'PT',

  // Mountain
  ID: 'MT', MT: 'MT', WY: 'MT', UT: 'MT', CO: 'MT', NM: 'MT', AZ: 'MT',

  // Central
  ND: 'CT', SD: 'CT', NE: 'CT', KS: 'CT', OK: 'CT', TX: 'CT',
  MN: 'CT', IA: 'CT', MO: 'CT', AR: 'CT', LA: 'CT', WI: 'CT',
  IL: 'CT', MS: 'CT', AL: 'CT',

  // Eastern
  MI: 'ET', IN: 'ET', OH: 'ET', KY: 'ET', TN: 'ET',
  GA: 'ET', FL: 'ET', SC: 'ET', NC: 'ET', VA: 'ET', WV: 'ET',
  PA: 'ET', NY: 'ET', NJ: 'ET', CT: 'ET', RI: 'ET', MA: 'ET',
  VT: 'ET', NH: 'ET', ME: 'ET', MD: 'ET', DE: 'ET', DC: 'ET',
};

const ZONE_TO_IANA: Record<UsZoneKey, string> = {
  PT: 'America/Los_Angeles',
  MT: 'America/Denver',
  CT: 'America/Chicago',
  ET: 'America/New_York',
};

export function parseStateFromCityState(cityState?: string | null): string | null {
  if (!cityState) return null;
  const m = cityState.match(/,\s*([A-Za-z]{2})\b/);
  return m ? m[1].toUpperCase() : null;
}

export function timeZoneForCityState(cityState?: string | null): string | null {
  const st = parseStateFromCityState(cityState);
  if (!st) return null;
  const key = STATE_TO_ZONE[st];
  return key ? ZONE_TO_IANA[key] : null;
}

export function tzAbbrevForCityState(cityState?: string | null): string | null {
  const tz = timeZoneForCityState(cityState);
  if (!tz) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
  } catch {
    return null;
  }
}

export function formatInTimeZone(
  iso: string | null | undefined,
  tz: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...opts,
      ...(tz ? { timeZone: tz } : {}),
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
