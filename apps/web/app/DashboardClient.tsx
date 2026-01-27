'use client';

import { useRouter } from 'next/navigation';
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
  timeZoneForCityState
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

// ===== ADD HERE: timezone-aware ISO replacement for notifications =====
function tzAbbrevForTimeZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(d);

  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

function formatInTimeZoneWithAbbrev(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const base = new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

  const tz = tzAbbrevForTimeZone(iso, timeZone);
  return tz ? `${base} ${tz}` : base;
}

function replaceIsoInTextUsingTimeZone(text: string, timeZone: string): string {
  const isoRegex =
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z\b/g;

  return text.replace(isoRegex, (iso) => formatInTimeZoneWithAbbrev(iso, timeZone));
}

function pickTimeZoneForNotification(
  n: { message: string },
  load?: { originCityState: string; destCityState: string }
): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!load) return fallback;

  // If the notif is delivery-ish, use DEST TZ, otherwise ORIGIN TZ
  const msg = n.message.toLowerCase();
  const isDelivery = msg.includes('delivery');

  const tz = isDelivery
    ? timeZoneForCityState(load.destCityState)
    : timeZoneForCityState(load.originCityState);

  return tz ?? fallback;
}
// ===== END ADD HERE =====

function prettifyNotifCode(code: string): string {
  const words = code
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ');
}

function splitNotifMessage(
  raw: string,
  timeZone?: string
): { codeLabel?: string; message: string } {
  // matches: "PICKUP_WINDOW_SOON: Pickup window starts at 2026-...Z."
  const m = raw.match(/^([A-Z0-9_]+):\s*(.*)$/);

  const localize = (s: string) => {
    if (timeZone) return replaceIsoInTextUsingTimeZone(s, timeZone);
    return localizeIsoInText(s); // fallback = user's local tz
  };

  if (!m) return { message: localize(raw) };

  return {
    codeLabel: prettifyNotifCode(m[1]),
    message: localize(m[2]),
  };
}

export default function DashboardClient() {
  // IMPORTANT: mounted is the FIRST hook and we never conditionally add hooks later.
  const [mounted, setMounted] = useState(false);

  const router = useRouter();

  const [search, setSearch] = useState('');
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);

  // Drawer UI
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persisted notifications + read tracking
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Record<string, true>>({});

  // refs for diff engine storage
  const snapshotsRef = useRef<SnapshotMap>({});

  // Local clock (only meaningful after mount)
  const [now, setNow] = useState<Date>(() => new Date());

  // Mount gate: prevents SSR/client “now” drift + avoids locale/timezone render mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Start ticking ONLY after mount
  useEffect(() => {
    if (!mounted) return;

    const id = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(id);
  }, [mounted]);

  // Load snapshots + persisted notifications/readIds once (client-only)
  useEffect(() => {
    if (!mounted) return;

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
  }, [mounted]);

  // Persist notifications + readIds whenever they change (client-only)
  useEffect(() => {
    if (!mounted) return;
    saveJson(NOTIFS_STORAGE_KEY, notifications);
  }, [mounted, notifications]);

  useEffect(() => {
    if (!mounted) return;
    saveJson(READ_STORAGE_KEY, readIds);
  }, [mounted, readIds]);

  /**
   * Evaluate ALL loads ONLY after mount.
   * Before mount, return empty lists so SSR and first client render match.
   */
  const evaluatedAll = useMemo<EvaluatedLoad[]>(() => {
    if (!mounted) return [];
    return evaluateAllLoads(mockLoads, now);
  }, [mounted, now]);

  const evaluated = useMemo<EvaluatedLoad[]>(() => {
    if (!mounted) return [];
    return evaluatedAll.filter((l) => matchesSearch(l as unknown as Load, search));
  }, [mounted, evaluatedAll, search]);

  const needsAttention = useMemo(() => {
    if (!mounted) return [];
    const exceptions = evaluated.filter(
      (l) => l.computedStatus === 'red' || l.computedStatus === 'yellow'
    );
    return sortNeedsAttention(exceptions);
  }, [mounted, evaluated]);

  const counts = useMemo(() => {
    if (!mounted) return { red: 0, yellow: 0 };
    const red = evaluated.filter((l) => l.computedStatus === 'red').length;
    const yellow = evaluated.filter((l) => l.computedStatus === 'yellow').length;
    return { red, yellow };
  }, [mounted, evaluated]);

  const todaysLoads = useMemo(() => {
    if (!mounted) return [];
    return evaluated
      .filter(
        (l) => isSameLocalDay(l.pickupWindowStartISO, now) || isSameLocalDay(l.deliveryWindowStartISO, now)
      )
      .sort(
        (a, b) => new Date(a.pickupWindowStartISO).getTime() - new Date(b.pickupWindowStartISO).getTime()
      );
  }, [mounted, evaluated, now]);

  const next48h = useMemo(() => {
    if (!mounted) return [];
    return evaluated
      .filter(
        (l) => withinNextHours(l.pickupWindowStartISO, 48) || withinNextHours(l.deliveryWindowStartISO, 48)
      )
      .sort(
        (a, b) => new Date(a.pickupWindowStartISO).getTime() - new Date(b.pickupWindowStartISO).getTime()
      );
  }, [mounted, evaluated]);

  const unreadCount = useMemo(() => {
    if (!mounted) return 0;
    let n = 0;
    for (const notif of notifications) {
      if (!readIds[notif.id]) n += 1;
    }
    return n;
  }, [mounted, notifications, readIds]);

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

  // Diff notifications after snapshots loaded (client-only)
  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted, snapshotsLoaded, evaluatedAll]);

  // Server + first client render are identical (no dynamic content yet)
  if (!mounted) {
    return (
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <div className="h-6 w-40 rounded bg-slate-100" />
            <div className="mt-4 h-12 w-full rounded-2xl bg-slate-100" />
          </div>
        </div>
        <main className="mx-auto max-w-5xl px-4 pb-12" />
      </div>
    );
  }

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
              {notifications.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => {
                  const isUnread = !readIds[n.id];
                  const tone =
                    n.status === 'red'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900';

                  // Find the load for this notification so we can infer pickup/delivery timezone
                  const notifLoad = evaluatedAll.find((l) => l.id === n.loadId);

                  // Choose TZ: pickup-ish => origin TZ, delivery-ish => dest TZ (fallback = user's TZ)
                  const notifTz = pickTimeZoneForNotification(n, notifLoad);

                  // Split "CODE: message" and localize any ISO timestamps using notifTz (adds PST/MST/CST/EST)
                  const { codeLabel, message } = splitNotifMessage(n.message, notifTz);

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markOneRead(n.id);
                        if (n.loadId) router.push(`/loads/${encodeURIComponent(n.loadId)}`);
                      }}
                      className={`text-left rounded-2xl border p-3 transition hover:shadow-sm ${tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {n.status === 'red' ? '🔴 At Risk' : '🟡 Watch'}{' '}
                            <span className="text-slate-700">•</span>{' '}
                            <span className="font-mono">{n.loadId}</span>
                          </div>

                          {codeLabel ? (
                            <div className="mt-1 text-xs font-semibold tracking-wide text-slate-700">
                              {codeLabel}
                            </div>
                          ) : null}

                          <div className="mt-1 text-sm">{message}</div>

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
