'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import {
  type EvaluatedLoad,
  type Load,
  type LoadStatus,
  timeZoneForCityState,
} from '@broker/shared';

type LoadLike = Load | EvaluatedLoad;

export type ContactMethod = 'CALL' | 'TEXT' | 'MAP' | 'EMAIL';

export type LoadCardProps = {
  load: LoadLike;

  // Optional decorations provided by the app layer
  lastContactedLabel?: string;
  emailHref?: string;

  // Optional callback so the app can log contacts (localStorage, etc.)
  onContact?: (method: ContactMethod) => void;
};

function isEvaluated(load: LoadLike): load is EvaluatedLoad {
  return 'computedStatus' in load;
}

function getStatus(load: LoadLike): LoadStatus {
  return isEvaluated(load) ? load.computedStatus : load.status;
}

function getRiskReason(load: LoadLike): string | undefined {
  return isEvaluated(load) ? load.computedRiskReason : (load as any).riskReason;
}

function getNextAction(load: LoadLike): string {
  return isEvaluated(load) ? load.computedNextAction : (load as any).nextAction;
}

function statusStripClass(status: LoadStatus) {
  switch (status) {
    case 'red':
      return 'bg-red-500';
    case 'yellow':
      return 'bg-amber-400';
    default:
      return 'bg-emerald-500';
  }
}

function statusBadge(status: LoadStatus) {
  switch (status) {
    case 'red':
      return '🔴 At Risk';
    case 'yellow':
      return '🟡 Watch';
    default:
      return '🟢 On Track';
  }
}

function gpsLabel(minutes: number | null | undefined) {
  const m =
    typeof minutes === 'number' && Number.isFinite(minutes)
      ? Math.max(0, Math.floor(minutes))
      : null;

  if (m === null) return 'Last GPS: —';
  if (m < 1) return 'Last GPS: just now';
  return `Last GPS: ${m} min ago`;
}

/**
 * Replace any ISO-8601 timestamps inside a message with the user's LOCAL time.
 * (Hydration-safe because we only apply after mount.)
 */
function localizeIsoInText(text: string): string {
  const isoRegex =
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z\b/g;

  return text.replace(isoRegex, (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  });
}

function safeHref(kind: 'tel' | 'sms', phone: string | null | undefined): string {
  const p = (phone ?? '').trim();
  if (!p) return '#';
  return `${kind}:${p}`;
}

function getOptionalString(load: LoadLike, key: string): string | null {
  const anyLoad = load as unknown as Record<string, unknown>;
  const v = anyLoad[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function abbrForTimeZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(d);

    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function formatInTz(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * Window format:
 * "Tue, Jan 27, 12:12 AM → Tue, Jan 27, 2:12 AM PST"
 * (TZ shown once at the end.)
 */
function formatWindowInTz(
  startIso: string | null,
  endIso: string | null,
  timeZone: string
): string {
  if (!startIso && !endIso) return '—';

  if (startIso && !endIso) {
    const tz = abbrForTimeZone(startIso, timeZone);
    return `${formatInTz(startIso, timeZone)} → —${tz ? ` ${tz}` : ''}`;
  }

  if (!startIso && endIso) {
    const tz = abbrForTimeZone(endIso, timeZone);
    return `— → ${formatInTz(endIso, timeZone)}${tz ? ` ${tz}` : ''}`;
  }

  const tz = abbrForTimeZone(startIso!, timeZone);
  return `${formatInTz(startIso!, timeZone)} → ${formatInTz(endIso!, timeZone)}${tz ? ` ${tz}` : ''}`;
}

export function LoadCard({ load, lastContactedLabel, emailHref, onContact }: LoadCardProps) {
  const router = useRouter();

  // Prevent hydration mismatch: no localized date/time until mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const status = getStatus(load);
  const riskReason = getRiskReason(load);
  const nextAction = getNextAction(load);

  const riskLine = useMemo(() => {
    if (status === 'green') return statusBadge(status);
    const base = `${statusBadge(status)} • ${riskReason ?? 'Needs attention.'}`;
    return mounted ? localizeIsoInText(base) : base;
  }, [status, riskReason, mounted]);

  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
    } catch {
      return 'America/Los_Angeles';
    }
  }, []);

  // Infer time zones from origin/destination (state -> IANA)
  const originTz = timeZoneForCityState(load.originCityState) ?? browserTz;
  const destTz = timeZoneForCityState(load.destCityState) ?? browserTz;

  const pickupWindow = useMemo(() => {
    if (!mounted) return '—';
    return formatWindowInTz(load.pickupWindowStartISO, load.pickupWindowEndISO, originTz);
  }, [mounted, load.pickupWindowStartISO, load.pickupWindowEndISO, originTz]);

  const deliveryWindow = useMemo(() => {
    if (!mounted) return '—';
    return formatWindowInTz(load.deliveryWindowStartISO, load.deliveryWindowEndISO, destTz);
  }, [mounted, load.deliveryWindowStartISO, load.deliveryWindowEndISO, destTz]);

  const carrierPhone = getOptionalString(load, 'carrierPhone');
  const callHref = safeHref('tel', carrierPhone);
  const textHref = getOptionalString(load, 'textLink') ?? safeHref('sms', carrierPhone);
  const mapHref = getOptionalString(load, 'mapLink') ?? '#';

  function goToLoad() {
    router.push(`/loads/${encodeURIComponent(load.id)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToLoad();
    }
  }

  const btnBase =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300';
  const btnDisabled = 'opacity-50 pointer-events-none';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goToLoad}
      onKeyDown={onKeyDown}
      className="group block cursor-pointer rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <div className="flex">
        <div className={`w-2 rounded-l-2xl ${statusStripClass(status)}`} />

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{load.id}</span>
                <span className="text-sm text-slate-600">{riskLine}</span>
              </div>

              <div className="mt-1 text-sm text-slate-700">
                <span className="font-medium">{load.originCityState}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium">{load.destCityState}</span>
              </div>

              <div className="mt-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Pickup:</span> {pickupWindow}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Delivery:</span> {deliveryWindow}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Carrier:</span> {load.carrierName}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {gpsLabel((load as any).lastGpsMinutesAgo)}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-semibold tracking-wide text-slate-500">NEXT ACTION</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{nextAction}</div>

            {lastContactedLabel ? (
              <div className="mt-1 text-xs text-slate-500">Last contacted: {lastContactedLabel}</div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={callHref}
                onClick={(e) => {
                  e.stopPropagation();
                  onContact?.('CALL');
                }}
                className={btnBase}
              >
                Call
              </a>

              <a
                href={textHref}
                onClick={(e) => {
                  e.stopPropagation();
                  onContact?.('TEXT');
                }}
                className={btnBase}
              >
                Text
              </a>

              <a
                href={mapHref}
                target={mapHref === '#' ? undefined : '_blank'}
                rel={mapHref === '#' ? undefined : 'noreferrer'}
                onClick={(e) => {
                  e.stopPropagation();
                  onContact?.('MAP');
                }}
                className={btnBase}
              >
                Map
              </a>

              {emailHref ? (
                <a
                  href={emailHref}
                  onClick={(e) => {
                    e.stopPropagation();
                    onContact?.('EMAIL');
                  }}
                  className={btnBase}
                >
                  Email
                </a>
              ) : (
                <span className={[btnBase, btnDisabled].join(' ')}>Email</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
