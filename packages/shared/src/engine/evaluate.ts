// packages/shared/src/engine/evaluate.ts
import type { Load, LoadStatus } from "../types";
import type { EvaluatedLoad, Exception, Severity } from "./types";
import { evaluateRules } from "./rules";

function computedStatusFromExceptions(exceptions: Exception[]): LoadStatus {
  if (exceptions.some((e) => e.status === "red")) return "red";
  if (exceptions.some((e) => e.status === "yellow")) return "yellow";
  return "green";
}

function severityRank(sev: Severity): number {
  // Higher rank = more severe
  return sev === "risk" ? 2 : 1;
}

function sortExceptionsDeterministic(exceptions: Exception[]): Exception[] {
  // Contract:
  // - Highest severity first (risk/red, then watch/yellow)
  // - Within severity: highest score first
  // - Deterministic tie-break: code asc
  return [...exceptions].sort((a, b) => {
    const sr = severityRank(b.severity) - severityRank(a.severity);
    if (sr !== 0) return sr;

    if (b.score !== a.score) return b.score - a.score;

    if (a.code < b.code) return -1;
    if (a.code > b.code) return 1;
    return 0;
  });
}

function pickPrimaryException(exceptionsSorted: Exception[]): Exception | undefined {
  // After sortExceptionsDeterministic, index 0 is highest severity primary.
  return exceptionsSorted[0];
}

export function evaluateLoad(load: Load, now: Date = new Date()): EvaluatedLoad {
  const exceptions = sortExceptionsDeterministic(evaluateRules(load, { now }));

  const computedStatus = computedStatusFromExceptions(exceptions);
  const primary = pickPrimaryException(exceptions);

  const computedRiskReason =
    computedStatus === "green" ? undefined : primary?.detail ?? "Needs attention.";
  const computedNextAction =
    computedStatus === "green" ? "No action required." : primary?.nextAction ?? "Review load.";

  return {
    ...load,
    computedStatus,
    computedRiskReason,
    computedNextAction,
    exceptions,
  };
}

export function evaluateAllLoads(loads: Load[], now: Date = new Date()): EvaluatedLoad[] {
  // deterministic output ordering: keep input order, evaluation doesn't reorder.
  return loads.map((l) => evaluateLoad(l, now));
}
