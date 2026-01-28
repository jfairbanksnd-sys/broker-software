import type { BrokerAction, ActionStatus } from "@/../packages/shared/src/actions/types";

const STORAGE_KEY = "brokerSoftware.actionState.v1";

export type ActionStateEntry = {
  status: ActionStatus; // OPEN | DONE | SNOOZED
  snoozeUntilISO?: string; // only if SNOOZED
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

export function overlayActionState(
  derived: BrokerAction[],
  nowISO: string
): { actions: BrokerAction[]; state: ActionStateMap } {
  const state = loadActionState();

  // prune state to only derived actions (per requirement: drop if no longer applies)
  const derivedIds = new Set(derived.map((a) => a.id));
  const pruned: ActionStateMap = {};
  for (const id of Object.keys(state)) {
    if (derivedIds.has(id)) pruned[id] = state[id];
  }

  const actions = derived.map((a) => {
    const entry = pruned[a.id];
    if (!entry) return a;

    // Snooze expiry: auto-reopen when snoozeUntil passes
    if (entry.status === "SNOOZED" && entry.snoozeUntilISO) {
      if (nowISO >= entry.snoozeUntilISO) {
        const reopened: ActionStateEntry = {
          status: "OPEN",
          updatedAtISO: nowISO,
        };
        pruned[a.id] = reopened;
        return { ...a, status: "OPEN" };
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
  // Store ISO timestamp for "now + 30 minutes" in local time context via Date math.
  // ISO is timezone-neutral; comparisons use lexicographic ISO ordering.
  const d = new Date(nowISO);
  const snoozeUntil = new Date(d.getTime() + 30 * 60 * 1000).toISOString();

  const state = loadActionState();
  state[actionId] = { status: "SNOOZED", snoozeUntilISO: snoozeUntil, updatedAtISO: nowISO };
  saveActionState(state);
}

export function reopenAction(actionId: string, nowISO: string) {
  const state = loadActionState();
  state[actionId] = { status: "OPEN", updatedAtISO: nowISO };
  saveActionState(state);
}
