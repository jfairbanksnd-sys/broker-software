"use client";

import { useRouter } from "next/navigation";
import type { BrokerAction } from "../../../packages/shared/src/actions/types";

type QueueAction = BrokerAction & {
  emailHref?: string;        // optional mailto link injected by DashboardClient
  lastContactedLabel?: string; // optional display label injected by DashboardClient
};

type Props = {
  actions: QueueAction[]; // pass OPEN-only actions
  onDone: (action: BrokerAction) => void;
  onSnooze30m: (action: BrokerAction) => void;
  onContact: (action: BrokerAction, method: "CALL" | "TEXT" | "MAP" | "EMAIL") => void;
};

function ctaLabel(t: BrokerAction["actionType"]) {
  switch (t) {
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

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export default function ActionQueue({ actions, onDone, onSnooze30m, onContact }: Props) {
  const router = useRouter();
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
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/loads/${encodeURIComponent(a.loadId)}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/loads/${encodeURIComponent(a.loadId)}`);
              }
            }}
            className="cursor-pointer rounded-xl border p-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{a.title}</div>
                <div className="mt-1 text-xs text-slate-600">
                  Load <span className="font-medium text-slate-700">{a.loadId}</span>
                  {a.detail ? <span className="mt-1 block text-slate-500">{a.detail}</span> : null}
                  {a.lastContactedLabel ? (
                    <span className="mt-1 block text-slate-400">Last contacted: {a.lastContactedLabel}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {a.href ? (
                  <a
                    href={a.href}
                    onClick={(e) => {
                      stop(e);
                      onContact(a, a.actionType === "CALL" ? "CALL" : a.actionType === "TEXT" ? "TEXT" : a.actionType === "MAP" ? "MAP" : "CALL");
                      // then allow the href to execute normally (we do NOT preventDefault)
                    }}
                    className="rounded-lg border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    {ctaLabel(a.actionType)}
                  </a>
                ) : (
                  <span className="rounded-lg border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">
                    {ctaLabel(a.actionType)}
                  </span>
                )}

                {a.emailHref ? (
                  <a
                    href={a.emailHref}
                    onClick={(e) => {
                      stop(e);
                      onContact(a, "EMAIL");
                    }}
                    className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Email
                  </a>
                ) : (
                  <span className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-300">
                    Email
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={(e) => {
                  stop(e);
                  onDone(a);
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Done
              </button>
              <button
                onClick={(e) => {
                  stop(e);
                  onSnooze30m(a);
                }}
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
