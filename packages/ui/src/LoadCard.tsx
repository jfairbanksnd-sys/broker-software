'use client';

import { useRouter } from 'next/navigation';
import type { Load } from '@broker/shared/src/types';
import { formatTimeWindow } from '@broker/shared/src/time';

function statusStripClass(status: Load['status']) {
  switch (status) {
    case 'red':
      return 'bg-red-500';
    case 'yellow':
      return 'bg-amber-400';
    default:
      return 'bg-emerald-500';
  }
}

function statusBadge(status: Load['status']) {
  switch (status) {
    case 'red':
      return '🔴 At Risk';
    case 'yellow':
      return '🟡 Watch';
    default:
      return '🟢 On Track';
  }
}

function gpsLabel(minutes: number | null) {
  if (minutes === null) return 'Last GPS: —';
  if (minutes < 1) return 'Last GPS: just now';
  return `Last GPS: ${minutes} min ago`;
}

export function LoadCard({ load }: { load: Load }) {
  const router = useRouter();

  const riskLine =
    load.status === 'green'
      ? statusBadge(load.status)
      : `${statusBadge(load.status)} • ${load.riskReason}`;

  const pickupWindow = formatTimeWindow(load.pickupWindowStartISO, load.pickupWindowEndISO);

  const callHref = `tel:${load.carrierPhone}`;
  const textHref = load.textLink ?? `sms:${load.carrierPhone}`;
  const mapHref = load.mapLink ?? '#';

  function goToLoad() {
    router.push(`/loads/${encodeURIComponent(load.id)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToLoad();
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goToLoad}
      onKeyDown={onKeyDown}
      className="group block cursor-pointer rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <div className="flex">
        <div className={`w-2 rounded-l-2xl ${statusStripClass(load.status)}`} />

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
                <span className="font-medium text-slate-700">Carrier:</span> {load.carrierName}
              </div>

              <div className="mt-1 text-sm text-slate-600">{gpsLabel(load.lastGpsMinutesAgo)}</div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-semibold tracking-wide text-slate-500">NEXT ACTION</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{load.nextAction}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={callHref}
                onClick={(e) => e.stopPropagation()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300"
              >
                Call
              </a>
              <a
                href={textHref}
                onClick={(e) => e.stopPropagation()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300"
              >
                Text
              </a>
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300"
              >
                Map
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
