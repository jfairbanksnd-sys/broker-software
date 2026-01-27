'use client';

import { useMemo, useState } from 'react';
import type { Load } from '@broker/shared/src/types';

function formatHeaderDate(d: Date) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
  const day = new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(d);
  return `${weekday}, ${month} ${day}`;
}

function dayState(loads: Load[]) {
  const hasRed = loads.some((l) => l.status === 'red');
  const hasYellow = loads.some((l) => l.status === 'yellow');
  if (hasRed) return { label: '🔴 Action Required', tone: 'text-red-700 bg-red-50 border-red-200' };
  if (hasYellow) return { label: '🟡 Attention Needed', tone: 'text-amber-800 bg-amber-50 border-amber-200' };
  return { label: '🟢 Calm Day', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
}

export function DashboardHeader({
  loads,
  search,
  setSearch,
}: {
  loads: Load[];
  search: string;
  setSearch: (v: string) => void;
}) {
  const dateLabel = useMemo(() => formatHeaderDate(new Date()), []);
  const state = useMemo(() => dayState(loads), [loads]);

  // Profile icon is visual only per spec (no settings page)
  const [focused, setFocused] = useState(false);

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{dateLabel}</div>
            <div className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-sm ${state.tone}`}>
              {state.label}
            </div>
          </div>

          <button
            type="button"
            aria-label="Profile"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`h-10 w-10 rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 ${
              focused ? 'ring-2 ring-slate-300' : ''
            }`}
          >
            <span className="text-lg">👤</span>
          </button>
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
      </div>
    </div>
  );
}
