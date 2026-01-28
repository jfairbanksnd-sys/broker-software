export type ActionType = "CALL" | "TEXT" | "MAP" | "EMAIL" | "NOTE";
export type ActionStatus = "OPEN" | "DONE" | "SNOOZED";

export type BrokerAction = {
  id: string; // stable ID (loadId + ruleId)
  loadId: string;

  title: string; // e.g. "Call carrier: confirm pickup ETA"
  detail?: string; // optional extra instruction

  actionType: ActionType; // CALL/TEXT/MAP/NOTE (EMAIL reserved, not used yet)
  href?: string; // tel:/sms:/maps link when relevant

  priority: 1 | 2 | 3; // 1 highest
  dueAtISO?: string; // for ordering/time pressure (optional)

  createdAtISO: string;
  status: ActionStatus;

  ruleId: string; // e.g. "NO_GPS_CALL"
};
