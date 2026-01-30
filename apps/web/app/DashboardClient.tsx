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

import { deriveActions, type ActionDeriveLoad } from '../../../packages/shared/src/actions/deriveActions';
import type { BrokerAction } from '../../../packages/shared/src/actions/types';

import ActionQueue from '../components/ActionQueue';
import { DashboardHeader } from '../components/DashboardHeader';
import { LoadSection } from '../components/LoadSection';
import {
  overlayActionState,
  setActionDone,
  snoozeAction30m,
  addContactLogEntry,
  getLastContactForLoad,
} from '../lib/actionStateStore';

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

// --- Phase 4.x: Future section helpers ---
function getAnchorISO(l: any): string | null {
  return (
    l?.pickupWindowStartISO ??
    l?.pickupWindowEndISO ??
    l?.deliveryWindowStartISO ??
    l?.deliveryWindowEndISO ??
    null
  );
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}
// --- end helpers ---

// ===== timezone-aware ISO replacement for notifications =====
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
// ===== END =====

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

// --- Phase 4 helpers (exception -> ActionDeriveLoad) ---
function laneForLoad(l: any): string | undefined {
  return (
    l?.lane ??
    (l?.originCityState && l?.destCityState ? `${l.originCityState} → ${l.destCityState}` : undefined)
  );
}

function extractExceptionsForActions(l: any): Array<{ code: string; dueAtISO?: string }> {
  // Try a few likely shapes without binding to a single internal schema.
  const candidates =
    l?.exceptions ??
    l?.exceptionList ??
    l?.exceptionEvents ??
    l?.exceptionCodes ??
    l?.codes ??
    [];

  if (!Array.isArray(candidates)) return [];

  // string[] -> [{code}]
  if (candidates.every((x) => typeof x === 'string')) {
    return (candidates as string[]).map((code) => ({ code }));
  }

  // object[] -> try to find code/type + dueAt/dueAtISO
  return (candidates as any[])
    .map((e) => {
      const code = e?.code ?? e?.type ?? e?.exceptionCode ?? e?.id;
      const dueAtISO = e?.dueAtISO ?? e?.dueAt ?? e?.dueISO ?? e?.atISO ?? e?.timeISO;
      if (!code || typeof code !== 'string') return null;
      return { code, dueAtISO: typeof dueAtISO === 'string' ? dueAtISO : undefined };
    })
    .filter(Boolean) as Array<{ code: string; dueAtISO?: string }>;
}

function extractPhones(l: any): { carrierPhone?: string; driverPhone?: string } {
  const carrierPhone =
    l?.carrierPhone ??
    l?.carrier?.phone ??
    l?.carrierContactPhone ??
    l?.contacts?.carrierPhone ??
    undefined;

  const driverPhone =
    l?.driverPhone ??
    l?.driver?.phone ??
    l?.contacts?.driverPhone ??
    undefined;

  return {
    carrierPhone: typeof carrierPhone === 'string' ? carrierPhone : undefined,
    driverPhone: typeof driverPhone === 'string' ? driverPhone : undefined,
  };
}

// ===== Phase 4.4.2: Email helpers (Dispatch + Driver) =====
function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.includes('@');
}

function getDispatchDriverEmails(load: any): { dispatchEmail?: string; driverEmail?: string } {
  const dispatchEmail =
    load?.dispatchEmail ??
    load?.dispatcherEmail ??
    load?.carrierDispatchEmail ??
    load?.carrier?.dispatchEmail ??
    load?.contacts?.dispatchEmail;

  const driverEmail =
    load?.driverEmail ??
    load?.driver?.email ??
    load?.contacts?.driverEmail;

  return {
    dispatchEmail: isEmail(dispatchEmail) ? dispatchEmail : undefined,
    driverEmail: isEmail(driverEmail) ? driverEmail : undefined,
  };
}

function buildMailtoHref(args: { to: string; cc?: string; subject: string; body: string }) {
  const params = new URLSearchParams();
  if (args.cc) params.set('cc', args.cc);
  params.set('subject', args.subject);
  params.set('body', args.body);
  return `mailto:${encodeURIComponent(args.to)}?${params.toString()}`;
}

function buildDispatchDriverMailto(load: any, loadId: string, context: { title?: string; detail?: string }) {
  const { dispatchEmail, driverEmail } = getDispatchDriverEmails(load);
  if (!dispatchEmail && !driverEmail) return undefined;

  // If both exist: To=dispatch, CC=driver. If only one exists: To=that one.
  const to = dispatchEmail ?? driverEmail!;
  const cc = dispatchEmail && driverEmail ? driverEmail : undefined;

  const subject = `Load ${loadId} — Update Needed`;
  const body = [
    `Load: ${loadId}`,
    context.title ? `Action: ${context.title}` : null,
    context.detail ? `Detail: ${context.detail}` : null,
    '',
    'Please confirm current status and ETA.',
  ]
    .filter(Boolean)
    .join('\n');

  return buildMailtoHref({ to, cc, subject, body });
}
// ===== end email helpers =====

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

  // Action state bump: forces re-overlay after Done/Snooze clicks (without waiting for the 60s tick)
  const [actionStateBump, setActionStateBump] = useState(0);

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
        (l) =>
          isSameLocalDay(l.pickupWindowStartISO, now) ||
          isSameLocalDay(l.deliveryWindowStartISO, now)
      )
      .sort(
        (a, b) =>
          new Date(a.pickupWindowStartISO).getTime() -
          new Date(b.pickupWindowStartISO).getTime()
      );
  }, [mounted, evaluated, now]);

  const next48h = useMemo(() => {
    if (!mounted) return [];
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
  }, [mounted, evaluated]);

  const futureLoads = useMemo(() => {
  if (!mounted) return [];

  const horizonMs = now.getTime() + 48 * 60 * 60 * 1000;

  const idsNeeds = new Set(needsAttention.map((l) => l.id));
  const idsToday = new Set(todaysLoads.map((l) => l.id));
  const idsUpcoming = new Set(next48h.map((l) => l.id));

  return evaluated
    .filter((l) => !idsNeeds.has(l.id) && !idsToday.has(l.id) && !idsUpcoming.has(l.id))
    .filter((l) => {
      const t = toMs(getAnchorISO(l));
      return Number.isFinite(t) && t > horizonMs;
    })
    .sort((a, b) => {
      const ta = toMs(getAnchorISO(a));
      const tb = toMs(getAnchorISO(b));
      return ta - tb;
    });
}, [mounted, evaluated, needsAttention, todaysLoads, next48h, now]);

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

  // ---- Phase 4: derive + overlay Broker Actions (exception-first, noise-controlled) ----
  const nowISO = useMemo(() => (mounted ? now.toISOString() : ''), [mounted, now]);

  const openActionsForQueue = useMemo<BrokerAction[]>(() => {
    if (!mounted) return [];
    if (!nowISO) return [];

    // Only derive actions from exception loads (Needs Attention), per Phase 4 definition.
    const inputs: ActionDeriveLoad[] = needsAttention.map((l: any) => {
      const { carrierPhone, driverPhone } = extractPhones(l);
      return {
        loadId: l.id,
        lane: laneForLoad(l),
        carrierPhone,
        driverPhone,
        pickupAddress: l?.pickupAddress ?? l?.pickup?.address,
        deliveryAddress: l?.deliveryAddress ?? l?.delivery?.address,
        exceptions: extractExceptionsForActions(l),
      };
    });

    const derived = deriveActions(inputs, nowISO);

    // Overlay persisted status/snooze; prunes actions that no longer apply.
    const { actions: withState } = overlayActionState(derived, nowISO);

    // Only OPEN actions appear in Action Queue; snoozed disappear until expiry.
    const open = withState.filter((a) => a.status === 'OPEN');

    // Ensure "LoadId + lane" is visible in the queue without changing BrokerAction schema:
    // We fold lane into detail so the queue shows it under the Load line.
    const byId = new Map<string, any>();
    for (const l of evaluatedAll as any[]) byId.set(l.id, l);

    return open.map((a) => {
      const l = byId.get(a.loadId);
      const lane = laneForLoad(l);
      const detail = lane ? (a.detail ? `${lane} — ${a.detail}` : lane) : a.detail;
      const emailHref = buildDispatchDriverMailto(l, a.loadId, { title: a.title, detail });
      const last = getLastContactForLoad(a.loadId);
      const lastContactedLabel = last
        ? new Date(last.atISO).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : undefined;
      return { ...a, detail, emailHref, lastContactedLabel };
    });
    // actionStateBump triggers re-overlay immediately after Done/Snooze clicks
  }, [mounted, nowISO, needsAttention, evaluatedAll, actionStateBump]);

  function handleActionDone(a: BrokerAction) {
    const clickISO = new Date().toISOString();
    setActionDone(a.id, clickISO);
    setActionStateBump((v) => v + 1);
  }

  function handleActionContact(a: BrokerAction, method: "CALL" | "TEXT" | "MAP" | "EMAIL") {
  const atISO = new Date().toISOString();
  addContactLogEntry({ actionId: a.id, loadId: a.loadId, method, atISO });
  setActionStateBump((v) => v + 1); // forces immediate label refresh
}

  function handleActionSnooze30m(a: BrokerAction) {
    const clickISO = new Date().toISOString();
    snoozeAction30m(a.id, clickISO);
    setActionStateBump((v) => v + 1);
  }

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

        {/* Phase 4: Action Queue (appears above Needs Attention only when OPEN actions exist) */}
        {openActionsForQueue.length > 0 ? (
          <div className="mt-4">
            <ActionQueue
              actions={openActionsForQueue}
              onDone={handleActionDone}
              onSnooze30m={handleActionSnooze30m}
              onContact={handleActionContact}
            />
            
          </div>
        ) : null}


       {/* Needs Attention */}
        <details className="mt-6 group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer list-none select-none rounded-xl bg-red-50/60 px-3 py-2 ring-1 ring-red-200/60 hover:bg-red-50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Left warning triangle */}
                <span className="inline-flex h-6 w-6 items-center justify-center text-red-600" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M12 3.2c.4 0 .8.2 1 .6l9 15.6c.4.8-.1 1.8-1.1 1.8H3.1c-1 0-1.5-1-1.1-1.8l9-15.6c.2-.4.6-.6 1-.6zm0 5.3c-.6 0-1 .4-1 1v5.8c0 .6.4 1 1 1s1-.4 1-1V9.5c0-.6-.4-1-1-1zm0 10.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" />
                  </svg>
                </span>

                <div>
                  <div className="text-lg font-semibold text-slate-900">Needs Attention</div>
                  <div className="mt-1 text-sm text-slate-600">Only red/yellow loads that require action.</div>
                </div>

                {/* Right warning triangle */}
                <span className="inline-flex h-6 w-6 items-center justify-center text-red-600" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M12 3.2c.4 0 .8.2 1 .6l9 15.6c.4.8-.1 1.8-1.1 1.8H3.1c-1 0-1.5-1-1.1-1.8l9-15.6c.2-.4.6-.6 1-.6zm0 5.3c-.6 0-1 .4-1 1v5.8c0 .6.4 1 1 1s1-.4 1-1V9.5c0-.6-.4-1-1-1zm0 10.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" />
                  </svg>
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="group-open:hidden">Show ({needsAttention.length})</span>
                <span className="hidden group-open:inline">Hide ({needsAttention.length})</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </summary>

          <div className="mt-4">
            <LoadSection
              title="Needs Attention"
              subtitle="Only red/yellow loads that require action."
              loads={needsAttention}
              emptyState="No loads need attention."
              hideHeader
            />
          </div>
        </details>

         {/* Todays */}
        <details className="mt-6 group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer list-none select-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Today’s Loads</div>
                <div className="mt-1 text-sm text-slate-600">Loads with pickup/delivery activity today.</div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="group-open:hidden">Show ({todaysLoads.length})</span>
                <span className="hidden group-open:inline">Hide ({todaysLoads.length})</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </summary>

          <div className="mt-4">
            <LoadSection
              title="Today’s Loads"
              subtitle="Loads with pickup/delivery activity today."
              loads={todaysLoads}
              emptyState="No loads for today."
              hideHeader
            />
          </div>
        </details>

        {/* Upcoming */}
        <details className="mt-6 group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer list-none select-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Upcoming (Next 48 Hours)</div>
                <div className="mt-1 text-sm text-slate-600">Loads starting/ending within 48 hours.</div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="group-open:hidden">Show ({next48h.length})</span>
                <span className="hidden group-open:inline">Hide ({next48h.length})</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </summary>

          <div className="mt-4">
            <LoadSection
              title="Upcoming (Next 48 Hours)"
              subtitle="Loads starting/ending within 48 hours."
              loads={next48h}
              emptyState="No upcoming loads."
              hideHeader
            />
          </div>
        </details>

        {/* Future */}

        {futureLoads.length ? (
          <>
            <details className="mt-6 group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer list-none select-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Future</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Loads beyond the next 48 hours.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="group-open:hidden">Show ({futureLoads.length})</span>
                    <span className="hidden group-open:inline">Hide ({futureLoads.length})</span>
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </summary>

              <div className="mt-4">
                <LoadSection
                  title="Future Loads"
                  subtitle="Scheduled after the next 48 hours."
                  loads={futureLoads}
                  emptyState="No future loads."
                />
              </div>
            </details>
          </>
        ) : null}

      </main>
    </div>
  );
}
