'use client';

import { useMemo, useState } from 'react';
import type { Load } from '@broker/shared/src/types';
import { mockLoads } from '@broker/shared/src/mockLoads';
import { isSameLocalDay, withinNextHours } from '@broker/shared/src/time';
import { DashboardHeader } from '../components/DashboardHeader';
import { LoadSection } from '../components/LoadSection';

function matchesSearch(load: Load, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;

  const haystack = [
    load.id,
    load.originCityState,
    load.destCityState,
    load.carrierName,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(s);
}

function urgencyScore(load: Load) {
  // Lower is more urgent
  // status weight + stale GPS + time-to-window
  const statusWeight = load.status === 'red' ? 0 : load.status === 'yellow' ? 1 : 2;
  const gpsPenalty =
    load.lastGpsMinutesAgo === null ? 999 : Math.min(load.lastGpsMinutesAgo, 999);

  // earlier pickup window start is more urgent
  const pickupStart = new Date(load.pickupWindowStartISO).getTime();

  return statusWeight * 1_000_000 + pickupStart / 1000 + gpsPenalty;
}

export default function DashboardPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return mockLoads.filter((l) => matchesSearch(l, search));
  }, [search]);

  const needsAttention = useMemo(() => {
    const exceptions = filtered.filter((l) => l.status === 'red' || l.status === 'yellow');

    // Sort: red first, then yellow; within each, nearest deadline / biggest issue first (approx via score)
    return exceptions.sort((a, b) => urgencyScore(a) - urgencyScore(b));
  }, [filtered]);

  const counts = useMemo(() => {
    const red = filtered.filter((l) => l.status === 'red').length;
    const yellow = filtered.filter((l) => l.status === 'yellow').length;
    return { red, yellow };
  }, [filtered]);

  const todaysLoads = useMemo(() => {
    const now = new Date();
    // pickup OR delivery occurring today
    return filtered
      .filter((l) => isSameLocalDay(l.pickupWindowStartISO, now) || isSameLocalDay(l.deliveryWindowStartISO, now))
      .sort((a, b) => new Date(a.pickupWindowStartISO).getTime() - new Date(b.pickupWindowStartISO).getTime());
  }, [filtered]);

  const next48h = useMemo(() => {
    // starting/ending in next 48 hours (mock logic: pickup start OR delivery start)
    return filtered
      .filter((l) => withinNextHours(l.pickupWindowStartISO, 48) || withinNextHours(l.deliveryWindowStartISO, 48))
      // ordered by soonest event (pickup start)
      .sort((a, b) => new Date(a.pickupWindowStartISO).getTime() - new Date(b.pickupWindowStartISO).getTime());
  }, [filtered]);

  return (
    <div className="min-h-screen">
      <DashboardHeader loads={filtered} search={search} setSearch={setSearch} />

      <main className="mx-auto max-w-5xl px-4 pb-12">
        {/* Needs Attention (pinned if not empty) */}
        <LoadSection
          title="Needs Attention"
          subtitle={
            <span>
              <span className="mr-2">🔴 {counts.red} At Risk</span>
              <span>🟡 {counts.yellow} Watch</span>
            </span>
          }
          loads={needsAttention}
          emptyState={
            <div className="text-base font-medium text-slate-900">
              🎉 All loads are on track. We’ll notify you if anything changes.
            </div>
          }
        />

        {/* Today's Loads */}
        <LoadSection
          title="Today’s Loads"
          subtitle="Pickup or delivery occurring today."
          loads={todaysLoads}
          emptyState="No loads scheduled for today."
        />

        {/* Upcoming (Next 48 Hours) */}
        <LoadSection
          title="Upcoming (Next 48 Hours)"
          subtitle="Loads starting/ending in the next 48 hours, ordered by soonest event."
          loads={next48h}
          emptyState="No loads in the next 48 hours."
        />
      </main>
    </div>
  );
}
