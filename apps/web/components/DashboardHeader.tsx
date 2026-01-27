'use client';

import { useMemo, useState } from 'react';
import type { Load, EvaluatedLoad } from '@broker/shared';
import { TimeZoneClocks } from './TimeZoneClocks';

type LoadLike = Load | EvaluatedLoad;

function isEvaluated(load: LoadLike): load is EvaluatedLoad {
  return 'computedStatus' in load;
}

function getStatus(load: LoadLike): Load['status'] {
  return isEvaluated(load) ? load.computedStatus : load.status;
}

function formatHeaderDate(d: Date) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
  const day = new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(d);
  return `${weekday}, ${month} ${day}`;
}

function dayState(loads: LoadLike[]) {
  const hasRed = loads.some((l) => getStatus(l) === 'red');
  const hasYellow = loads.some((l) => getStatus(l) === 'yellow');

  if (hasRed) return { label: '🔴 Action Required', tone: 'text-red-700 bg-red-50 border-red-200' };
  if (hasYellow)
    return { label: '🟡 Attention Needed', tone: 'text-amber-800 bg-amber-50 border-amber-200' };
  return { label: '🟢 Calm Day', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
}

export function DashboardHeader({
  loads,
  search,
  setSearch,
  notificationCount = 0,
  onNotificationsClick,
}: {
  loads: LoadLike[];
  search: string;
  setSearch: (v: string) => void;
  notificationCount?: number;
  onNotificationsClick?: () => void;
}) {
  const dateLabel = useMemo(() => formatHeaderDate(new Date()), []);
  const state = useMemo(() => dayState(loads), [loads]);

  const [focusedProfile, setFocusedProfile] = useState(false);
  const [focusedBell, setFocusedBell] = useState(false);

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{dateLabel}</div>
            <div
              className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-sm ${state.tone}`}
            >
              {state.label}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 4 clocks (to the left of bell) */}
            <div className="hidden md:block">
              <TimeZoneClocks />
            </div>

            {/* Notifications bell */}
            <button
              type="button"
              aria-label="Notifications"
              onClick={onNotificationsClick}
              onFocus={() => setFocusedBell(true)}
              onBlur={() => setFocusedBell(false)}
              className={`relative h-10 w-10 rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 ${
                focusedBell ? 'ring-2 ring-slate-300' : ''
              }`}
            >
              <span className="text-lg">🔔</span>

              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-900 px-1 text-xs font-semibold text-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              ) : null}
            </button>

            {/* Profile icon (visual only per spec) */}
            <button
              type="button"
              aria-label="Profile"
              onFocus={() => setFocusedProfile(true)}
              onBlur={() => setFocusedProfile(false)}
              className={`h-10 w-10 rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 ${
                focusedProfile ? 'ring-2 ring-slate-300' : ''
              }`}
            >
              <span className="text-lg">👤</span>
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="sr-only" htmlFor="search">
            Search loads
          </label>
          <input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Load ID, origin, destination, carrier…"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
          />
        </div>

        {/* If you want clocks visible on mobile too, remove the md:hidden wrapper above */}
      </div>
    </div>
  );
}
