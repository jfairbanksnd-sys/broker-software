"use client";

import type { BrokerAction } from "@/../packages/shared/src/actions/types";

type Props = {
  actions: BrokerAction[]; // already filtered to OPEN only
  onDone: (action: BrokerAction) => void;
  onSnooze30m: (action: BrokerAction) => void;
};

function actionLabel(actionType: BrokerAction["actionType"]) {
  switch (actionType) {
    case "CALL":
      return "Call";
    case "TEXT":
      return "Text";
    case "MAP":
      return "Map";
    case "NOTE":
      return "Note";
    case "EMAIL":
      return "Email";
    default:
      return "Open";
  }
}

export default function ActionQueue({ actions, onDone, onSnooze30m }: Props) {
  if (!actions.length) return null;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Action Queue</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {actions.length} OPEN
        </span>
      </div>

      <div className="space-y-3">
        {actions.map((a) => (
          <div key={a.id} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{a.title}</div>
                <div className="mt-1 text-xs text-slate-600">
                  Load <span className="font-medium text-slate-700">{a.loadId}</span>
                  {a.detail ? <span className="block text-slate-500">{a.detail}</span> : null}
                </div>
              </div>

              {a.href ? (
                <a
                  href={a.href}
                  className="shrink-0 rounded-lg border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                >
                  {actionLabel(a.actionType)}
                </a>
              ) : (
                <span className="shrink-0 rounded-lg border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">
                  {actionLabel(a.actionType)}
                </span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onDone(a)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Done
              </button>
              <button
                onClick={() => onSnooze30m(a)}
                className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
              >
                Snooze 30m
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
