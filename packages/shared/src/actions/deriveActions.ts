import type { BrokerAction } from "./types";

export type ExceptionCode =
  | "NO_GPS"
  | "GPS_STALE_RED"
  | "PICKUP_LATE"
  | "PICKUP_WINDOW_SOON"
  | "DELIVERY_LATE"
  | "DELIVERY_WINDOW_SOON"
  | (string & {});

export type ExceptionLike = {
  code: ExceptionCode;
  dueAtISO?: string; // optional time pressure hint from Phase 3
};

export type ActionDeriveLoad = {
  loadId: string;
  lane?: string;

  // contacts (prefer carrier; fallback driver)
  carrierPhone?: string;
  driverPhone?: string;

  // optional for map actions (not required by Phase 4 mappings)
  pickupAddress?: string;
  deliveryAddress?: string;

  // evaluated exceptions for the load
  exceptions: ExceptionLike[];
};

const mkId = (loadId: string, ruleId: string) => `${loadId}__${ruleId}`;

const normalizePhone = (raw?: string) => {
  if (!raw) return undefined;
  // keep + and digits only
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  return cleaned.length ? cleaned : undefined;
};

const telHref = (phone?: string) => {
  const p = normalizePhone(phone);
  return p ? `tel:${p}` : undefined;
};

const smsHref = (phone?: string, body?: string) => {
  const p = normalizePhone(phone);
  if (!p) return undefined;
  const b = body ? encodeURIComponent(body) : "";
  return b ? `sms:${p}?&body=${b}` : `sms:${p}`;
};

const mapsHref = (address?: string) => {
  if (!address) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

type RulePick = {
  ruleId: string;
  priority: 1 | 2 | 3;
  title: (ctx: { lane?: string }) => string;
  detail?: (ctx: { lane?: string }) => string;
  actionType: "CALL" | "TEXT" | "MAP" | "NOTE";
  href: (ctx: {
    carrierPhone?: string;
    driverPhone?: string;
    pickupAddress?: string;
    deliveryAddress?: string;
  }) => string | undefined;
  dueAtISO?: (ex: ExceptionLike) => string | undefined;
};

const RULES: Record<string, RulePick> = {
  // NO_GPS / GPS_STALE_RED → CALL or TEXT carrier for location update (priority 1)
  NO_GPS_CALL: {
    ruleId: "NO_GPS_CALL",
    priority: 1,
    title: ({ lane }) => `Call carrier: location update${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Confirm truck location and next check-in time.`,
    actionType: "CALL",
    href: ({ carrierPhone, driverPhone }) => telHref(carrierPhone ?? driverPhone),
    dueAtISO: (ex) => ex.dueAtISO,
  },

  GPS_STALE_TEXT: {
    ruleId: "GPS_STALE_TEXT",
    priority: 1,
    title: ({ lane }) => `Text carrier: send location${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Request updated location + ETA.`,
    actionType: "TEXT",
    href: ({ carrierPhone, driverPhone }) =>
      smsHref(carrierPhone ?? driverPhone, "Please send current location and ETA. Thanks."),
    dueAtISO: (ex) => ex.dueAtISO,
  },

  // PICKUP_LATE / PICKUP_WINDOW_SOON → CALL carrier + confirm status (priority 1–2)
  PICKUP_STATUS_CALL: {
    ruleId: "PICKUP_STATUS_CALL",
    priority: 1,
    title: ({ lane }) => `Call carrier: confirm pickup status${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Confirm arrival, check-in, and pickup ETA.`,
    actionType: "CALL",
    href: ({ carrierPhone, driverPhone }) => telHref(carrierPhone ?? driverPhone),
    dueAtISO: (ex) => ex.dueAtISO,
  },

  PICKUP_WINDOW_CALL: {
    ruleId: "PICKUP_WINDOW_CALL",
    priority: 2,
    title: ({ lane }) => `Call carrier: pickup window soon${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Confirm they will make the pickup window.`,
    actionType: "CALL",
    href: ({ carrierPhone, driverPhone }) => telHref(carrierPhone ?? driverPhone),
    dueAtISO: (ex) => ex.dueAtISO,
  },

  // DELIVERY_LATE / DELIVERY_WINDOW_SOON → TEXT carrier for ETA + update consignee (priority 1–2)
  DELIVERY_ETA_TEXT: {
    ruleId: "DELIVERY_ETA_TEXT",
    priority: 1,
    title: ({ lane }) => `Text carrier: delivery ETA update${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Get ETA and update consignee if needed.`,
    actionType: "TEXT",
    href: ({ carrierPhone, driverPhone }) =>
      smsHref(carrierPhone ?? driverPhone, "Please confirm updated delivery ETA. Thanks."),
    dueAtISO: (ex) => ex.dueAtISO,
  },

  DELIVERY_WINDOW_TEXT: {
    ruleId: "DELIVERY_WINDOW_TEXT",
    priority: 2,
    title: ({ lane }) => `Text carrier: delivery window soon${lane ? ` (${lane})` : ""}`,
    detail: ({}) => `Confirm ETA to meet delivery window.`,
    actionType: "TEXT",
    href: ({ carrierPhone, driverPhone }) =>
      smsHref(carrierPhone ?? driverPhone, "Delivery window is coming up—please confirm ETA. Thanks."),
    dueAtISO: (ex) => ex.dueAtISO,
  },
};

const EXCEPTION_PRECEDENCE: Array<{
  codes: ExceptionCode[];
  rule: RulePick;
}> = [
  { codes: ["NO_GPS"], rule: RULES.NO_GPS_CALL },
  { codes: ["GPS_STALE_RED"], rule: RULES.GPS_STALE_TEXT },
  { codes: ["PICKUP_LATE"], rule: RULES.PICKUP_STATUS_CALL },
  { codes: ["DELIVERY_LATE"], rule: RULES.DELIVERY_ETA_TEXT },
  { codes: ["PICKUP_WINDOW_SOON"], rule: RULES.PICKUP_WINDOW_CALL },
  { codes: ["DELIVERY_WINDOW_SOON"], rule: RULES.DELIVERY_WINDOW_TEXT },
];

export function deriveActions(
  loads: ActionDeriveLoad[],
  nowISO: string
): BrokerAction[] {
  const createdAtISO = nowISO;

  const actions: BrokerAction[] = [];

  for (const l of loads) {
    if (!l.exceptions?.length) continue;

    // Rule: one primary action per exception load (avoid flooding)
    let picked: { rule: RulePick; ex: ExceptionLike } | undefined;

    for (const p of EXCEPTION_PRECEDENCE) {
      const match = l.exceptions.find((e) => p.codes.includes(e.code));
      if (match) {
        picked = { rule: p.rule, ex: match };
        break;
      }
    }

    // If exceptions exist but none match our mapping, do nothing (noise-controlled).
    if (!picked) continue;

    const { rule, ex } = picked;

    const dueAtISO = rule.dueAtISO ? rule.dueAtISO(ex) : ex.dueAtISO;

    const action: BrokerAction = {
      id: mkId(l.loadId, rule.ruleId),
      loadId: l.loadId,

      title: rule.title({ lane: l.lane }),
      detail: rule.detail?.({ lane: l.lane }),

      actionType: rule.actionType,
      href: rule.href({
        carrierPhone: l.carrierPhone,
        driverPhone: l.driverPhone,
        pickupAddress: l.pickupAddress,
        deliveryAddress: l.deliveryAddress,
      }),

      priority: rule.priority,
      dueAtISO,

      createdAtISO,
      status: "OPEN",
      ruleId: rule.ruleId,
    };

    actions.push(action);
  }

  // Ordering: priority asc (1 first), then dueAtISO ascending, then createdAtISO
  actions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;

    const ad = a.dueAtISO ?? "";
    const bd = b.dueAtISO ?? "";
    if (ad !== bd) return ad.localeCompare(bd);

    return a.createdAtISO.localeCompare(b.createdAtISO);
  });

  return actions;
}
