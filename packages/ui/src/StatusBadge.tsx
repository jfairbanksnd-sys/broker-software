import * as React from "react";

export type StatusLevel = "green" | "yellow" | "red";

const LEVEL_STYLES: Record<StatusLevel, { emoji: string; label: string; className: string }> = {
  green: {
    emoji: "🟢",
    label: "On Track",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  yellow: {
    emoji: "🟡",
    label: "At Risk",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  red: {
    emoji: "🔴",
    label: "Critical",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
  },
};

export function StatusBadge({ level }: { level: StatusLevel }) {
  const meta = LEVEL_STYLES[level];

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
        meta.className,
      ].join(" ")}
      aria-label={`Status: ${meta.label}`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}
