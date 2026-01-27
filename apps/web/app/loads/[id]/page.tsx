import Link from "next/link";
import { notFound } from "next/navigation";

// ✅ Use your existing workspace aliases (these are the most likely based on your Phase 1 setup).
// If your repo uses different aliases, keep the imports but swap the alias prefix to match.
import { mockLoads } from "@shared/mockLoads";
import type { Load } from "@shared/types";
import { ActionButtons } from "@ui/ActionButtons";
import { StatusBadge, type StatusLevel } from "@ui/StatusBadge";

type PageProps = {
  params: { id: string };
};

function asStatusLevel(load: Load): StatusLevel {
  // Assumes Phase 1 already uses 🟢/🟡/🔴 logic in mock data.
  // Common field names: riskLevel | statusLevel | status (string).
  // We’ll safely derive with fallbacks:
  const anyLoad = load as unknown as Record<string, unknown>;

  const raw =
    (anyLoad.riskLevel as string | undefined) ??
    (anyLoad.statusLevel as string | undefined) ??
    (anyLoad.status as string | undefined);

  if (raw === "red" || raw === "critical") return "red";
  if (raw === "yellow" || raw === "at_risk" || raw === "risk") return "yellow";
  return "green";
}

function getRiskReason(load: Load): string | null {
  const anyLoad = load as unknown as Record<string, unknown>;
  const rr =
    (anyLoad.riskReason as string | undefined) ??
    (anyLoad.risk_reason as string | undefined) ??
    null;
  return rr && rr.trim().length ? rr : null;
}

function getNextAction(load: Load): string | null {
  const anyLoad = load as unknown as Record<string, unknown>;
  const na =
    (anyLoad.nextAction as string | undefined) ??
    (anyLoad.next_action as string | undefined) ??
    null;
  return na && na.trim().length ? na : null;
}

function getCarrier(load: Load): { name: string | null; phone: string | null } {
  const anyLoad = load as unknown as Record<string, unknown>;
  const carrier = anyLoad.carrier as Record<string, unknown> | undefined;

  const name =
    (carrier?.name as string | undefined) ??
    (anyLoad.carrierName as string | undefined) ??
    null;

  const phone =
    (carrier?.phone as string | undefined) ??
    (anyLoad.carrierPhone as string | undefined) ??
    null;

  return { name: name?.trim() || null, phone: phone?.trim() || null };
}

function getLaneLabels(load: Load): { originLabel: string; destinationLabel: string } {
  const anyLoad = load as unknown as Record<string, unknown>;

  const origin = anyLoad.origin as Record<string, unknown> | undefined;
  const destination = anyLoad.destination as Record<string, unknown> | undefined;

  const o =
    (origin?.display as string | undefined) ??
    (origin?.city as string | undefined) ??
    (anyLoad.origin as string | undefined) ??
    "Origin";

  const d =
    (destination?.display as string | undefined) ??
    (destination?.city as string | undefined) ??
    (anyLoad.destination as string | undefined) ??
    "Destination";

  // Optionally include state if present
  const oState = (origin?.state as string | undefined) ?? "";
  const dState = (destination?.state as string | undefined) ?? "";

  const originLabel = [o, oState].filter(Boolean).join(", ");
  const destinationLabel = [d, dState].filter(Boolean).join(", ");

  return { originLabel, destinationLabel };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatWindow(startIso: string | null, endIso: string | null): string {
  if (!startIso && !endIso) return "—";
  if (startIso && !endIso) return `${formatDateTime(startIso)} → —`;
  if (!startIso && endIso) return `— → ${formatDateTime(endIso)}`;
  return `${formatDateTime(startIso!)} → ${formatDateTime(endIso!)}`;
}

type GpsFreshness = { label: "Fresh" | "Stale" | "Very stale" | "No GPS"; level: StatusLevel; detail: string };

function gpsFreshnessFromMinutes(minutes: number | null): GpsFreshness {
  if (minutes == null) {
    return { label: "No GPS", level: "red", detail: "No GPS ping available" };
  }
  if (minutes < 60) {
    return { label: "Fresh", level: "green", detail: `${minutes} min ago` };
  }
  if (minutes <= 120) {
    return { label: "Stale", level: "yellow", detail: `${minutes} min ago` };
  }
  return { label: "Very stale", level: "red", detail: `${minutes} min ago` };
}

function getLastGpsMinutes(load: Load): number | null {
  const anyLoad = load as unknown as Record<string, unknown>;
  const v =
    (anyLoad.lastGpsMinutesAgo as number | undefined) ??
    (anyLoad.last_gps_minutes_ago as number | undefined) ??
    null;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
}

function getSchedule(load: Load): {
  pickupStart: string | null;
  pickupEnd: string | null;
  deliveryStart: string | null;
  deliveryEnd: string | null;
} {
  const anyLoad = load as unknown as Record<string, unknown>;
  const schedule = anyLoad.schedule as Record<string, unknown> | undefined;

  const pickup = (schedule?.pickup as Record<string, unknown> | undefined) ?? undefined;
  const delivery = (schedule?.delivery as Record<string, unknown> | undefined) ?? undefined;

  const pickupStart = (pickup?.start as string | undefined) ?? (anyLoad.pickupStart as string | undefined) ?? null;
  const pickupEnd = (pickup?.end as string | undefined) ?? (anyLoad.pickupEnd as string | undefined) ?? null;

  const deliveryStart =
    (delivery?.start as string | undefined) ?? (anyLoad.deliveryStart as string | undefined) ?? null;
  const deliveryEnd = (delivery?.end as string | undefined) ?? (anyLoad.deliveryEnd as string | undefined) ?? null;

  return {
    pickupStart: pickupStart?.trim() || null,
    pickupEnd: pickupEnd?.trim() || null,
    deliveryStart: deliveryStart?.trim() || null,
    deliveryEnd: deliveryEnd?.trim() || null,
  };
}

function buildTimeline(load: Load): Array<{ label: string; at: string }> {
  // UI-only mock: derived from "now" + minutes offsets, stable order, 4–6 events
  const now = Date.now();

  const level = asStatusLevel(load);
  const schedule = getSchedule(load);

  // Slight variation based on status to feel “alive”
  const offsetsMins =
    level === "green"
      ? [360, 300, 240, 120, 45, 10]
      : level === "yellow"
        ? [420, 360, 300, 180, 90, 35]
        : [480, 420, 360, 240, 150, 90];

  const labels = ["Tender accepted", "Driver assigned", "En route to pickup", "Arrived at pickup", "Loaded", "In transit"];

  // If pickup window exists, anchor later events closer to pickupStart for plausibility
  const anchor =
    schedule.pickupStart && !Number.isNaN(new Date(schedule.pickupStart).getTime())
      ? new Date(schedule.pickupStart).getTime()
      : now;

  const events = labels
    .map((label, i) => {
      const mins = offsetsMins[i] ?? 60;
      const ts = Math.min(anchor, now) - mins * 60_000;
      return { label, at: new Date(ts).toISOString() };
    })
    .slice(0, 6);

  // Ensure 4–6 events
  return events.slice(0, Math.max(4, Math.min(6, events.length))).map((e) => ({ label: e.label, at: e.at }));
}

export default function LoadDetailsPage({ params }: PageProps) {
  const id = params.id;

  const load = mockLoads.find((l: Load) => {
    const anyLoad = l as unknown as Record<string, unknown>;
    const loadId = (anyLoad.id as string | undefined) ?? (anyLoad.loadId as string | undefined);
    return String(loadId) === id;
  });

  if (!load) {
    // Clean "Load not found" state with back link (no backend, no re-route needed)
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-gray-500">Load Details</div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">Load not found</h1>
          <p className="mt-2 text-sm text-gray-600">
            We couldn’t find a load with ID <span className="font-mono">{id}</span>.
          </p>

          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const level = asStatusLevel(load);
  const riskReason = getRiskReason(load);
  const nextAction = getNextAction(load);

  const { name: carrierName, phone: carrierPhone } = getCarrier(load);
  const { originLabel, destinationLabel } = getLaneLabels(load);
  const schedule = getSchedule(load);

  const lastGpsMinutes = getLastGpsMinutes(load);
  const freshness = gpsFreshnessFromMinutes(lastGpsMinutes);

  const timeline = buildTimeline(load);

  const showNeedsAttention = level !== "green" && !!riskReason;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      {/* Top bar */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/" className="text-sm font-semibold text-gray-700 hover:text-gray-900">
            ← Dashboard
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">
              <span className="font-mono">{id}</span>
            </h1>
            <StatusBadge level={level} />
          </div>

          {level !== "green" && riskReason ? (
            <p className="mt-1 text-sm text-gray-700">
              <span className="font-semibold">Reason:</span> {riskReason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {/* Needs Attention (only yellow/red) */}
        {showNeedsAttention ? (
          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Needs Attention</h2>
              <span className="text-xs font-semibold text-gray-500">Exception-first</span>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-gray-800">
                <span className="font-semibold">Risk:</span> {riskReason}
              </div>

              <div className="text-sm text-gray-800">
                <span className="font-semibold">Next Action:</span> {nextAction ?? "—"}
              </div>

              <ActionButtons phone={carrierPhone} originLabel={originLabel} destinationLabel={destinationLabel} />
            </div>
          </section>
        ) : null}

        {/* Lane + Parties */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
          <h2 className="text-sm font-semibold text-gray-900">Lane + Parties</h2>

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-500">Lane</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {originLabel} <span className="text-gray-400">→</span> {destinationLabel}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500">Carrier</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{carrierName ?? "—"}</div>
              <div className="mt-1 text-sm text-gray-700">{carrierPhone ?? "—"}</div>

              <div className="mt-3">
                <ActionButtons phone={carrierPhone} originLabel={originLabel} destinationLabel={destinationLabel} />
              </div>
            </div>
          </div>
        </section>

        {/* Schedule */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
          <h2 className="text-sm font-semibold text-gray-900">Schedule</h2>

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
              <div className="text-xs font-semibold text-gray-500">Pickup window</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatWindow(schedule.pickupStart, schedule.pickupEnd)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
              <div className="text-xs font-semibold text-gray-500">Delivery window</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {formatWindow(schedule.deliveryStart, schedule.deliveryEnd)}
              </div>
            </div>
          </div>
        </section>

        {/* Tracking */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
          <h2 className="text-sm font-semibold text-gray-900">Tracking</h2>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="text-sm text-gray-800">
              <span className="font-semibold">Last GPS:</span>{" "}
              {lastGpsMinutes == null ? "No GPS" : `${lastGpsMinutes} min ago`}
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge level={freshness.level} />
              <div className="text-sm text-gray-700">{freshness.label}</div>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">{freshness.detail}</p>
        </section>

        {/* Timeline (static mock) */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
          <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>

          <ol className="mt-4 space-y-4">
            {timeline.map((e, idx) => (
              <li key={`${e.label}-${idx}`} className="relative pl-6">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                  <div className="text-sm font-semibold text-gray-900">{e.label}</div>
                  <div className="text-xs text-gray-500">{formatDateTime(e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
