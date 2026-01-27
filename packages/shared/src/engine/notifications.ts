// packages/shared/src/engine/notifications.ts
import type { EvaluatedLoad, Notification, ExceptionCode, Severity } from "./types";
import type { LoadStatus } from "../types";

export type LoadSnapshot = {
  status: LoadStatus;
  exceptionCodes: ExceptionCode[]; // sorted
};

export type SnapshotMap = Record<string, LoadSnapshot>;

function stableCodes(evaluated: EvaluatedLoad): ExceptionCode[] {
  return [...evaluated.exceptions.map((e) => e.code)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function snapshotFromEvaluatedLoad(e: EvaluatedLoad): LoadSnapshot {
  return {
    status: e.computedStatus,
    exceptionCodes: stableCodes(e),
  };
}

function isNonGreen(status: LoadStatus): boolean {
  return status === "yellow" || status === "red";
}

function shouldNotifyTransition(prev: LoadStatus | undefined, next: LoadStatus): boolean {
  // Contract (no first-run spam):
  // - Only notify when we have a previous status to compare.
  // - green -> yellow/red
  // - yellow -> red
  if (!prev) return false;
  if (prev === "green") return isNonGreen(next);
  if (prev === "yellow" && next === "red") return true;
  return false;
}

function primaryExceptionCode(e: EvaluatedLoad): ExceptionCode | null {
  // exceptions are already sorted by score desc in evaluation
  return e.exceptions[0]?.code ?? null;
}

function primarySeverity(e: EvaluatedLoad): Severity {
  // Notifications only generated for non-green states
  return e.computedStatus === "red" ? "risk" : "watch";
}

function makeNotificationId(loadId: string, createdAtISO: string, code: ExceptionCode): string {
  // deterministic-ish, unique enough locally. No crypto dependency.
  return `${loadId}::${code}::${createdAtISO}`;
}

function oneLineMessage(e: EvaluatedLoad): string {
  const code = primaryExceptionCode(e);
  const reason = e.computedRiskReason ?? "Needs attention.";
  return code ? `${code}: ${reason}` : reason;
}

function codesEqual(a: ExceptionCode[], b: ExceptionCode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type NotificationDiffOptions = {
  /**
   * Optional: notify when exception code set changes while still yellow/red.
   * Default: false (spec says optional).
   */
  notifyOnCodeChange?: boolean;
};

export function diffNotifications(
  prev: SnapshotMap,
  current: EvaluatedLoad[],
  createdAtISO: string,
  options: NotificationDiffOptions = {}
): { notifications: Notification[]; next: SnapshotMap } {
  const notifyOnCodeChange = options.notifyOnCodeChange ?? false;

  const notifications: Notification[] = [];
  const next: SnapshotMap = {};

  for (const e of current) {
    const snap = snapshotFromEvaluatedLoad(e);
    next[e.id] = snap;

    const prevSnap = prev[e.id];
    const prevStatus = prevSnap?.status;

    // Transition notifications (contract)
    if (shouldNotifyTransition(prevStatus, snap.status) && isNonGreen(snap.status)) {
      const code = primaryExceptionCode(e);
      if (!code) continue;

      notifications.push({
        id: makeNotificationId(e.id, createdAtISO, code),
        loadId: e.id,
        createdAtISO,
        severity: primarySeverity(e),
        status: snap.status,
        message: oneLineMessage(e),
        exceptionCode: code,
        acked: false,
      });
      continue;
    }

    // Optional: code change notifications while still yellow/red
    if (notifyOnCodeChange && prevSnap && isNonGreen(prevSnap.status) && isNonGreen(snap.status)) {
      if (!codesEqual(prevSnap.exceptionCodes, snap.exceptionCodes)) {
        const code = primaryExceptionCode(e);
        if (!code) continue;

        notifications.push({
          id: makeNotificationId(e.id, createdAtISO, code),
          loadId: e.id,
          createdAtISO,
          severity: primarySeverity(e),
          status: snap.status,
          message: oneLineMessage(e),
          exceptionCode: code,
          acked: false,
        });
      }
    }
  }

  return { notifications, next };
}

/**
 * Optional localStorage helpers (safe to call only in browser).
 * Defined here for convenience, but uses a StorageLike type so shared
 * doesn't require DOM lib types.
 */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const STORAGE_KEY = "broker.exceptionEngine.snapshots.v1";

export function loadSnapshots(storage: StorageLike): SnapshotMap {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnapshotMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveSnapshots(storage: StorageLike, snapshots: SnapshotMap): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // ignore: local-only convenience
  }
}
