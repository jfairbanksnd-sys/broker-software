// packages/shared/src/engine/types.ts
import type { Load, LoadStatus } from "../types";

export type Severity = "watch" | "risk";

export type ExceptionCode =
  | "NO_GPS"
  | "GPS_STALE"
  | "PICKUP_LATE"
  | "DELIVERY_LATE"
  | "PICKUP_WINDOW_SOON"
  | "DELIVERY_WINDOW_SOON";

export type Exception = {
  code: ExceptionCode;
  severity: Severity;
  status: LoadStatus; // yellow or red
  title: string; // short human label
  detail: string; // shown as riskReason
  nextAction: string; // single clear action
  score: number; // for sorting within severity
};

export type EvaluatedLoad = Load & {
  computedStatus: LoadStatus;
  computedRiskReason?: string;
  computedNextAction: string;
  exceptions: Exception[]; // empty => green
};

export type Notification = {
  id: string;
  loadId: string;
  createdAtISO: string;
  severity: Severity;
  status: LoadStatus; // yellow/red
  message: string; // one-line alert
  exceptionCode: ExceptionCode;
  acked: boolean; // local-only for now
};
