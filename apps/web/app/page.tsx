'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mockLoads,
  type Load,
  evaluateAllLoads,
  sortNeedsAttention,
  type EvaluatedLoad,
  isSameLocalDay,
  withinNextHours,
  diffNotifications,
  loadSnapshots,
  saveSnapshots,
  type SnapshotMap,
  type Notification,
} from '@broker/shared';

import { DashboardHeader } from '../components/DashboardHeader';
import { LoadSection } from '../components/LoadSection';

function matchesSearch(load: Load, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;

  const haystack = [load.id, load.originCityState, load.destCityState, load.carrierName]
    .join(' ')
    .toLowerCase();

  return haystack.includes(s);
}

const NOTIFS_STORAGE_KEY = 'broker.exceptionEngine.notifications.v1';
const READ_STORAGE_KEY = 'broker.exceptionEngine.notifications.readIds.v1';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore local-only persistence errors
  }
}

export default function DashboardPage() {
  const [search, setSearch] = useState('');

  // Gate notifications diff until snapshots are loaded (prevents first-run spam)
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);

  // Drawer UI
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persisted notifications + read tracking
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Record<string, true>>({});

  // refs for diff engine storage (fast + avoids effect loops)
  const snapshotsRef = useRef<SnapshotMap>({});

  /**
   * LIVE TIME ANCHOR:
   * Tick every 60s so evaluation can update while the dashboard is open.
   * This will NOT spam notifications, because diffNotifications() only fires on transitions.
   */
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(id);
  }, []);

  /**
   * Evaluate ALL loads based on current "now".
   * Notifications should not depend on search filtering.
   */
  const evaluatedAll = useMemo<EvaluatedLoad[]>(() => {
    return evaluateAllLoads(mockLoads, now);
  }, [now]);

  // Filter what we display (statuses remain consistent because filter is applied post-eval)
  const evaluated = useMemo<EvaluatedLoad[]>(() => {
    return evaluatedAll.filter((l) => matchesSearch(l, search));
  }, [evaluatedAll, search]);

  const needsAttention = useMemo(() => {
    const exceptions = evaluated.filter(
      (l) => l.computedStatus === 'red' || l.computedStatus === 'yellow'
    );
    return sortNeedsAttention(exceptions);
  }, [evaluated]);

  const counts = useMemo(() => {
    const red = evaluated.filter((l) => l.computedStatus === 'red').length;
    const yellow = evaluated.filter((l) => l.computedStatus === 'yellow').length;
    return { red, yellow };
  }, [evaluated]);

  const todaysLoads = useMemo(() => {
    return evaluated
      .filter(
        (l) =>
          isSameLocalDay(l.pickupWindowStartISO, now) ||
          isSameLocalDay(l.deliveryWindowStartISO, now)
      )
      .sort(
        (a, b) =>
          new Date(a.pickupWindowStartISO).getTime() -
          new Date(b.pickupWindowStartISO).getTime()
      );
  }, [evaluated, now]);

  const next48h = useMemo(() => {
    return evaluated
      .filter(
        (l) =>
          withinNextHours(l.pickupWindowStartISO, 48) ||
          withinNextHours(l.deliveryWindowStartISO, 48)
      )
      .sort(
        (a, b) =>
          new Date(a.pickupWindowStartISO).getTime() -
          new Date(b.pickupWindowStartISO).getTime()
      );
  }, [evaluated]);

  // unread count for header badge
  const unreadCount = useMemo(() => {
    let n = 0;
    for (const notif of notifications) {
      if (!readIds[notif.id]) n += 1;
    }
    return n;
  }, [notifications, readIds]);

  function toggleDrawer() {
    setDrawerOpen((v) => !v);
  }

  function markAllRead() {
    setReadIds((prev) => {
      const next: Record<string, true> = { ...prev };
      for (const n of notifications) next[n.id] = true;
      return next;
    });
  }

  function markOneRead(id: string) {
    setReadIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }

  // Load prior snapshots + persisted notifications/readIds once (client-only)
  useEffect(() => {
    try {
      snapshotsRef.current = loadSnapshots(window.localStorage);
    } catch {
      snapshotsRef.current = {};
    }

    const persistedNotifs = loadJson<Notification[]>(NOTIFS_STORAGE_KEY, []);
    const persistedRead = loadJson<Record<string, true>>(READ_STORAGE_KEY, {});
    setNotifications(Array.isArray(persistedNotifs) ? persistedNotifs : []);
    setReadIds(persistedRead && typeof persistedRead === 'object' ? persistedRead : {});

    setSnapshotsLoaded(true);
  }, []);

  // Persist notifications + readIds whenever they change
  useEffect(() => {
    saveJson(NOTIFS_STORAGE_KEY, notifications);
  }, [notifications]);

  useEffect(() => {
    saveJson(READ_STORAGE_KEY, readIds);
  }, [readIds]);

  // Diff notifications whenever evaluatedAll changes, after snapshots loaded
  useEffect(() => {
    if (!snapshotsLoaded) return;

    try {
      const createdAtISO = new Date().toISOString();
      const prev = snapshotsRef.current;

      const { notifications: newNotifs, next } = diffNotifications(prev, evaluatedAll, createdAtISO, {
        notifyOnCodeChange: false,
      });

      if (newNotifs.length) {
        setNotifications((prevNotifs) => [...newNotifs, ...prevNotifs].slice(0, 100));
      }

      snapshotsRef.current = next;
      saveSnapshots(window.localStorage, next);
    } catch {
      // ignore (local-only)
    }
  }, [snapshotsLoaded, evaluatedAll]);

  const visibleNotifs = notifications;

  return (
    <div className="min-h-screen">
      <DashboardHeader
        loads={evaluated}
        search={search}
        setSearch={setSearch}
        notificationCount={unreadCount}
        onNotificationsClick={toggleDrawer}
      />

      <main className="mx-auto max-w-5xl px-4 pb-12">
        {/* Local notifications drawer (local-only) */}
        {drawerOpen ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">Notifications</div>
                <div className="mt-1 text-sm text-slate-600">
                  {unreadCount ? `${unreadCount} unread` : 'All caught up.'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {visibleNotifs.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                  No notifications yet.
                </div>
              ) : (
                visibleNotifs.map((n) => {
                  const isUnread = !readIds[n.id];
                  const tone =
                    n.status === 'red'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900';

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markOneRead(n.id)}
                      className={`text-left rounded-2xl border p-3 transition hover:shadow-sm ${tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {n.status === 'red' ? '🔴 At Risk' : '🟡 Watch'}{' '}
                            <span className="text-slate-700">•</span>{' '}
                            <span className="font-mono">{n.loadId}</span>
                          </div>
                          <div className="mt-1 text-sm">{n.message}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            {new Date(n.createdAtISO).toLocaleString()}
                          </div>
                        </div>

                        {isUnread ? (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                            New
                          </span>
                        ) : (
                          <span className="mt-0.5 text-xs font-semibold text-slate-600">Read</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

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

        <LoadSection
          title="Today’s Loads"
          subtitle="Pickup or delivery occurring today."
          loads={todaysLoads}
          emptyState="No loads scheduled for today."
        />

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
