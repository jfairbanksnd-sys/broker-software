import type { ActionStatus, BrokerAction } from "../../../packages/shared/src/actions/types";

const STORAGE_KEY = "brokerSoftware.actionState.v1";

const CONTACT_LOG_KEY = "brokerSoftware.contactLog.v1";

export type ContactMethod = "CALL" | "TEXT" | "MAP" | "EMAIL";

export type ContactLogEntry = {
  id: string;          // stable unique ID
  actionId: string;
  loadId: string;
  method: ContactMethod;
  atISO: string;
};

export type ActionStateEntry = {
  status: ActionStatus;          // OPEN | DONE | SNOOZED
  snoozeUntilISO?: string;       // only when SNOOZED
  updatedAtISO: string;
};

export type ActionStateMap = Record<string, ActionStateEntry>;

function safeParse(json: string | null): ActionStateMap {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as ActionStateMap;
  } catch {
    return {};
  }
}

export function loadActionState(): ActionStateMap {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveActionState(map: ActionStateMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * Overlay persisted statuses onto derived actions.
 *
 * - Actions are derived each tick, but status overlays persist by action id.
 * - If an action exists again with same id, keep its status.
 * - If action no longer applies, drop it from the persisted map.
 * - Snoozed actions auto-reopen when snoozeUntil passes.
 */
export function overlayActionState(
  derived: BrokerAction[],
  nowISO: string
): { actions: BrokerAction[]; state: ActionStateMap } {
  const state = loadActionState();

  // Drop anything that no longer applies (derived actions are source of truth each tick)
  const derivedIds = new Set(derived.map((a) => a.id));
  const pruned: ActionStateMap = {};
  for (const id of Object.keys(state)) {
    if (derivedIds.has(id)) pruned[id] = state[id];
  }

  const actions: BrokerAction[] = derived.map((a) => {
    const entry = pruned[a.id];
    if (!entry) return a;

    // Snooze expiry: reopen automatically
    if (entry.status === "SNOOZED") {
      const until = entry.snoozeUntilISO;
      if (until && nowISO >= until) {
        const reopened: ActionStateEntry = { status: "OPEN", updatedAtISO: nowISO };
        pruned[a.id] = reopened;
        return { ...a, status: reopened.status };
      }
    }

    return { ...a, status: entry.status };
  });

  saveActionState(pruned);
  return { actions, state: pruned };
}

export function setActionDone(actionId: string, nowISO: string) {
  const state = loadActionState();
  state[actionId] = { status: "DONE", updatedAtISO: nowISO };
  saveActionState(state);
}

export function snoozeAction30m(actionId: string, nowISO: string) {
  // “30 minutes (local time)” behavior via Date arithmetic; stored as ISO for consistent compare
  const d = new Date(nowISO);
  const snoozeUntilISO = new Date(d.getTime() + 30 * 60 * 1000).toISOString();

  const state = loadActionState();
  state[actionId] = { status: "SNOOZED", snoozeUntilISO, updatedAtISO: nowISO };
  saveActionState(state);
}

export function reopenAction(actionId: string, nowISO: string) {
  const state = loadActionState();
  state[actionId] = { status: "OPEN", updatedAtISO: nowISO };
  saveActionState(state);
}

// ===== Contact Log (local-only) =====
function safeParseArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function loadContactLog(): ContactLogEntry[] {
  if (typeof window === "undefined") return [];
  return safeParseArray<ContactLogEntry>(window.localStorage.getItem(CONTACT_LOG_KEY));
}

export function saveContactLog(entries: ContactLogEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONTACT_LOG_KEY, JSON.stringify(entries));
}

function makeContactId(actionId: string, atISO: string) {
  return `${actionId}__${atISO}`;
}

export function addContactLogEntry(args: {
  actionId: string;
  loadId: string;
  method: ContactMethod;
  atISO: string;
}) {
  const prev = loadContactLog();
  const entry: ContactLogEntry = {
    id: makeContactId(args.actionId, args.atISO),
    actionId: args.actionId,
    loadId: args.loadId,
    method: args.method,
    atISO: args.atISO,
  };

  const next = [entry, ...prev].slice(0, 200);
  saveContactLog(next);
}

export function getLastContactForAction(actionId: string): ContactLogEntry | undefined {
  const log = loadContactLog();
  return log.find((e) => e.actionId === actionId);
}

export function getLastContactForLoad(loadId: string): ContactLogEntry | undefined {
  const log = loadContactLog();
  return log.find((e) => e.loadId === loadId);
}

export function getContactLogForLoad(loadId: string): ContactLogEntry[] {
  const log = loadContactLog();
  return log.filter((e) => e.loadId === loadId);
}
// ===== end contact log =====
