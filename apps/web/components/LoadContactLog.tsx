"use client";

import { useEffect, useMemo, useState } from "react";
import { getContactLogForLoad, getLastContactForLoad, type ContactLogEntry } from "../lib/actionStateStore";

type Props = {
  loadId: string;
  limit?: number; // default 8
};

function formatLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function methodLabel(m: ContactLogEntry["method"]) {
  switch (m) {
    case "CALL":
      return "Call";
    case "TEXT":
      return "Text";
    case "MAP":
      return "Map";
    case "EMAIL":
      return "Email";
    default:
      return m;
  }
}

export default function LoadContactLog({ loadId, limit = 8 }: Props) {
  const [mounted, setMounted] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => setMounted(true), []);

  // Refresh if localStorage changes (other tabs) or after a short delay
  useEffect(() => {
    if (!mounted) return;

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === "brokerSoftware.contactLog.v1") setBump((v) => v + 1);
    };

    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, [mounted]);

  const { last, items } = useMemo(() => {
    if (!mounted) return { last: undefined as ContactLogEntry | undefined, items: [] as ContactLogEntry[] };

    const last = getLastContactForLoad(loadId);
    const items = getContactLogForLoad(loadId).slice(0, limit);

    return { last, items };
  }, [mounted, loadId, limit, bump]);

  if (!mounted) return null;

  return (
    <div className="mt-3 rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-500">Contact</div>
          <div className="mt-1 text-sm text-gray-800">
            <span className="font-semibold">Last contacted:</span>{" "}
            {last ? (
              <>
                {formatLocal(last.atISO)} <span className="text-gray-500">({methodLabel(last.method)})</span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* optional manual refresh without adding a “settings panel” */}
        <button
          type="button"
          onClick={() => setBump((v) => v + 1)}
          className="shrink-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-gray-500">Contact log</div>

        {items.length === 0 ? (
          <div className="mt-2 text-sm text-gray-600">No contact history yet.</div>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-black/5">
                <div className="text-sm font-semibold text-gray-900">{methodLabel(e.method)}</div>
                <div className="text-sm text-gray-700">{formatLocal(e.atISO)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
