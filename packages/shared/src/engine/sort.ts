// packages/shared/src/engine/sort.ts
import type { EvaluatedLoad, Exception } from "./types";

function parseISOToMsOrInf(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function statusRank(status: EvaluatedLoad["computedStatus"]): number {
  // lower is higher priority
  if (status === "red") return 0;
  if (status === "yellow") return 1;
  return 2;
}

function severityRankFromException(e: Exception): number {
  // higher = more severe
  return e.severity === "risk" ? 2 : 1;
}

function pickPrimaryException(load: EvaluatedLoad): Exception | undefined {
  // Enforce primary selection: highest severity first, then score, then code (deterministic)
  return [...load.exceptions].sort((a, b) => {
    const sr = severityRankFromException(b) - severityRankFromException(a);
    if (sr !== 0) return sr;

    if (b.score !== a.score) return b.score - a.score;

    if (a.code < b.code) return -1;
    if (a.code > b.code) return 1;
    return 0;
  })[0];
}

function topScoreWithinStatus(load: EvaluatedLoad): number {
  // Within a status bucket, compare the highest score among exceptions that match that bucket.
  const targetStatus = load.computedStatus;
  if (targetStatus !== "red" && targetStatus !== "yellow") return -1;

  let best = -1;
  for (const e of load.exceptions) {
    if (e.status === targetStatus && e.score > best) best = e.score;
  }
  return best;
}

function relevantDeadlineMs(load: EvaluatedLoad): number {
  const primary = pickPrimaryException(load);
  if (!primary) return Number.POSITIVE_INFINITY;

  switch (primary.code) {
    case "PICKUP_LATE":
      return parseISOToMsOrInf(load.pickupWindowEndISO);
    case "PICKUP_WINDOW_SOON":
      return parseISOToMsOrInf(load.pickupWindowStartISO);
    case "DELIVERY_LATE":
      return parseISOToMsOrInf(load.deliveryWindowEndISO);
    case "DELIVERY_WINDOW_SOON":
      return parseISOToMsOrInf(load.deliveryWindowStartISO);
    case "NO_GPS":
    case "GPS_STALE": {
      // GPS issues: next operational time matters most.
      const candidates = [
        load.pickupWindowStartISO,
        load.pickupWindowEndISO,
        load.deliveryWindowStartISO,
        load.deliveryWindowEndISO,
      ].map(parseISOToMsOrInf);
      return Math.min(...candidates);
    }
    default:
      return Number.POSITIVE_INFINITY;
  }
}

export function sortNeedsAttention(loads: EvaluatedLoad[]): EvaluatedLoad[] {
  return [...loads].sort((a, b) => {
    // red first, then yellow
    const ar = statusRank(a.computedStatus);
    const br = statusRank(b.computedStatus);
    if (ar !== br) return ar - br;

    // within each: highest score first (within that bucket)
    const as = topScoreWithinStatus(a);
    const bs = topScoreWithinStatus(b);
    if (as !== bs) return bs - as;

    // then earliest relevant deadline
    const ad = relevantDeadlineMs(a);
    const bd = relevantDeadlineMs(b);
    if (ad !== bd) return ad - bd;

    // deterministic final tie-breaker
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}
