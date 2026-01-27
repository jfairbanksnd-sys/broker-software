// packages/shared/src/engine/rules.ts
import type { Load } from "../types";
import type { Exception } from "./types";

type RuleCtx = {
  now: Date;
};

const MINUTE = 60_000;

function parseISOToMs(iso: string): number {
  const ms = Date.parse(iso);
  // If mock data ever has bad ISO, fail “safe” by treating as far-future
  // so we don't accidentally mark late.
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function hours(n: number): number {
  return n * 60 * MINUTE;
}

function formatTimeShort(iso: string): string {
  // Keep it deterministic & dependency-free. UI can format later if needed.
  return iso;
}

function isLate(nowMs: number, windowEndISO: string): boolean {
  return nowMs > parseISOToMs(windowEndISO);
}

function startsWithin(nowMs: number, windowStartISO: string, withinMs: number): boolean {
  const startMs = parseISOToMs(windowStartISO);
  if (nowMs >= startMs) return false; // only applies before start
  return startMs - nowMs <= withinMs;
}

/**
 * Scores: high => more urgent.
 * These are intentionally coarse and deterministic.
 */
const SCORES = {
  NO_GPS: 1000,
  PICKUP_LATE: 950,
  DELIVERY_LATE: 900,
  GPS_STALE_RISK: 850,
  GPS_STALE_WATCH: 450,
  PICKUP_WINDOW_SOON: 350,
  DELIVERY_WINDOW_SOON: 300,
} as const;

export function ruleNoGps(load: Load, _ctx: RuleCtx): Exception | null {
  // Contract: lastGpsMinutesAgo === null => risk
  if (load.lastGpsMinutesAgo !== null) return null;

  return {
    code: "NO_GPS",
    severity: "risk",
    status: "red",
    title: "No GPS",
    detail: "No GPS data received for this load.",
    nextAction: "Contact driver/carrier to restore tracking immediately.",
    score: SCORES.NO_GPS,
  };
}

export function ruleGpsStale(load: Load, _ctx: RuleCtx): Exception | null {
  // Only apply if GPS exists
  if (load.lastGpsMinutesAgo === null) return null;

  const m = load.lastGpsMinutesAgo;

  // Contract:
  // - 60–120 min => watch (inclusive 120)
  // - >120 min  => risk
  if (m >= 60 && m <= 120) {
    return {
      code: "GPS_STALE",
      severity: "watch",
      status: "yellow",
      title: "GPS stale",
      detail: `GPS last updated ${m} minutes ago.`,
      nextAction: "Ping driver/carrier for a fresh location update.",
      score: SCORES.GPS_STALE_WATCH,
    };
  }

  if (m > 120) {
    return {
      code: "GPS_STALE",
      severity: "risk",
      status: "red",
      title: "GPS very stale",
      detail: `GPS last updated ${m} minutes ago.`,
      nextAction: "Call driver/carrier—confirm location and ETA now.",
      score: SCORES.GPS_STALE_RISK,
    };
  }

  return null;
}

export function rulePickupLate(load: Load, ctx: RuleCtx): Exception | null {
  const nowMs = ctx.now.getTime();

  if (!load.pickupWindowEndISO) return null;
  if (!isLate(nowMs, load.pickupWindowEndISO)) return null;

  return {
    code: "PICKUP_LATE",
    severity: "risk",
    status: "red",
    title: "Pickup late",
    detail: `Pickup window ended at ${formatTimeShort(load.pickupWindowEndISO)}.`,
    nextAction: "Call shipper + carrier to confirm pickup status and recovery plan.",
    score: SCORES.PICKUP_LATE,
  };
}

export function ruleDeliveryLate(load: Load, ctx: RuleCtx): Exception | null {
  const nowMs = ctx.now.getTime();

  if (!load.deliveryWindowEndISO) return null;
  if (!isLate(nowMs, load.deliveryWindowEndISO)) return null;

  return {
    code: "DELIVERY_LATE",
    severity: "risk",
    status: "red",
    title: "Delivery late",
    detail: `Delivery window ended at ${formatTimeShort(load.deliveryWindowEndISO)}.`,
    nextAction: "Call consignee + carrier to confirm delivery status and update customer.",
    score: SCORES.DELIVERY_LATE,
  };
}

export function rulePickupWindowSoon(load: Load, ctx: RuleCtx): Exception | null {
  const nowMs = ctx.now.getTime();

  // Must not be late
  if (load.pickupWindowEndISO && isLate(nowMs, load.pickupWindowEndISO)) return null;

  if (!load.pickupWindowStartISO) return null;

  // Contract: starts within 2 hours
  if (!startsWithin(nowMs, load.pickupWindowStartISO, hours(2))) return null;

  return {
    code: "PICKUP_WINDOW_SOON",
    severity: "watch",
    status: "yellow",
    title: "Pickup window soon",
    detail: `Pickup window starts at ${formatTimeShort(load.pickupWindowStartISO)}.`,
    nextAction: "Confirm driver check-in and pickup readiness.",
    score: SCORES.PICKUP_WINDOW_SOON,
  };
}

export function ruleDeliveryWindowSoon(load: Load, ctx: RuleCtx): Exception | null {
  const nowMs = ctx.now.getTime();

  // Must not be late
  if (load.deliveryWindowEndISO && isLate(nowMs, load.deliveryWindowEndISO)) return null;

  if (!load.deliveryWindowStartISO) return null;

  // Contract: starts within 4 hours
  if (!startsWithin(nowMs, load.deliveryWindowStartISO, hours(4))) return null;

  return {
    code: "DELIVERY_WINDOW_SOON",
    severity: "watch",
    status: "yellow",
    title: "Delivery window soon",
    detail: `Delivery window starts at ${formatTimeShort(load.deliveryWindowStartISO)}.`,
    nextAction: "Confirm ETA and communicate delivery plan if needed.",
    score: SCORES.DELIVERY_WINDOW_SOON,
  };
}

/**
 * Rule set (minimum deterministic set).
 * Late rules should be evaluated before "soon" rules so "soon" doesn't mask late.
 * GPS rules are independent but NO_GPS should come before GPS_STALE.
 */
export function evaluateRules(load: Load, ctx: RuleCtx): Exception[] {
  const rules = [
    ruleNoGps,
    ruleGpsStale,
    rulePickupLate,
    ruleDeliveryLate,
    rulePickupWindowSoon,
    ruleDeliveryWindowSoon,
  ] as const;

  const out: Exception[] = [];
  for (const r of rules) {
    const ex = r(load, ctx);
    if (ex) out.push(ex);
  }
  return out;
}
