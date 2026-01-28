import Link from 'next/link';
import { mockLoads, evaluateLoad, type EvaluatedLoad, type Load } from '@broker/shared';
import { StatusBadge, type StatusLevel } from '@broker/ui';
import { LocalizeTextWithIso } from '../../../components/LocalizeTextWithIso';
import { LoadDetailHeader } from '../../../components/LoadDetailHeader';

// NEW (client components)
import ActionButtonsWithLog from '../../../components/ActionButtonsWithLog';
import LoadContactLog from '../../../components/LoadContactLog';

function statusLevelFromComputed(status: EvaluatedLoad['computedStatus']): StatusLevel {
  if (status === 'red') return 'red';
  if (status === 'yellow') return 'yellow';
  return 'green';
}

function getCarrier(load: Load): { name: string | null; phone: string | null } {
  const anyLoad = load as unknown as Record<string, unknown>;
  const carrier = anyLoad.carrier as Record<string, unknown> | undefined;

  const name =
    (carrier?.name as string | undefined) ?? (anyLoad.carrierName as string | undefined) ?? null;
  const phone =
    (carrier?.phone as string | undefined) ?? (anyLoad.carrierPhone as string | undefined) ?? null;

  return { name: name?.trim() || null, phone: phone?.trim() || null };
}

function getLaneLabels(load: Load): { originLabel: string; destinationLabel: string } {
  const anyLoad = load as unknown as Record<string, unknown>;

  const originLabel =
    (anyLoad.originCityState as string | undefined)?.trim() ||
    (anyLoad.origin as string | undefined)?.trim() ||
    'Origin';

  const destinationLabel =
    (anyLoad.destCityState as string | undefined)?.trim() ||
    (anyLoad.destination as string | undefined)?.trim() ||
    'Destination';

  return { originLabel, destinationLabel };
}

/**
 * Minimal state→timezone mapping for a demo.
 * Later we can refine multi-timezone states using city/county.
 */
const STATE_TO_TZ: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Denver', // (north ID is Pacific; refine later)
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis', // (some counties differ; refine later)
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York', // (west KY is Central; refine later)
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago', // (east TN is Eastern; refine later)
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
};

function extractState(cityState: string): string | null {
  // expects "City, ST"
  const m = cityState.match(/,\s*([A-Z]{2})\b/);
  return m?.[1] ?? null;
}

function tzForCityState(cityState: string): string {
  const st = extractState(cityState);
  if (!st) return 'America/Los_Angeles';
  return STATE_TO_TZ[st] ?? 'America/Los_Angeles';
}

function formatDateTimeInTz(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  // includes local TZ abbreviation for that zone
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(d);
}

function formatWindowInTz(startIso: string | null, endIso: string | null, timeZone: string): string {
  if (!startIso && !endIso) return '—';
  if (startIso && !endIso) return `${formatDateTimeInTz(startIso, timeZone)} → —`;
  if (!startIso && endIso) return `— → ${formatDateTimeInTz(endIso, timeZone)}`;
  return `${formatDateTimeInTz(startIso, timeZone)} → ${formatDateTimeInTz(endIso, timeZone)}`;
}

type GpsFreshness = {
  label: 'Fresh' | 'Stale' | 'Very stale' | 'No GPS';
  level: StatusLevel;
  detail: string;
};

function gpsFreshnessFromMinutes(minutes: number | null): GpsFreshness {
  if (minutes == null) return { label: 'No GPS', level: 'red', detail: 'No GPS ping available' };
  if (minutes < 60) return { label: 'Fresh', level: 'green', detail: `${minutes} min ago` };
  if (minutes <= 120) return { label: 'Stale', level: 'yellow', detail: `${minutes} min ago` };
  return { label: 'Very stale', level: 'red', detail: `${minutes} min ago` };
}

function getLastGpsMinutes(load: Load): number | null {
  const anyLoad = load as unknown as Record<string, unknown>;
  const v =
    (anyLoad.lastGpsMinutesAgo as number | undefined) ??
    (anyLoad.last_gps_minutes_ago as number | undefined) ??
    null;

  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
}

function getSchedule(load: Load): {
  pickupStart: string | null;
  pickupEnd: string | null;
  deliveryStart: string | null;
  deliveryEnd: string | null;
} {
  const anyLoad = load as unknown as Record<string, unknown>;

  const pickupStart = (anyLoad.pickupWindowStartISO as string | undefined) ?? null;
  const pickupEnd = (anyLoad.pickupWindowEndISO as string | undefined) ?? null;

  const deliveryStart = (anyLoad.deliveryWindowStartISO as string | undefined) ?? null;
  const deliveryEnd = (anyLoad.deliveryWindowEndISO as string | undefined) ?? null;

  return { pickupStart, pickupEnd, deliveryStart, deliveryEnd };
}

function buildTimeline(load: Load, level: StatusLevel): Array<{ label: string; at: string }> {
  const now = Date.now();
  const schedule = getSchedule(load);

  const offsetsMins =
    level === 'green'
      ? [360, 300, 240, 120, 45, 10]
      : level === 'yellow'
        ? [420, 360, 300, 180, 90, 35]
        : [480, 420, 360, 240, 150, 90];

  const labels = [
    'Tender accepted',
    'Driver assigned',
    'En route to pickup',
    'Arrived at pickup',
    'Loaded',
    'In transit',
  ];

  const anchor =
    schedule.pickupStart && !Number.isNaN(new Date(schedule.pickupStart).getTime())
      ? new Date(schedule.pickupStart).getTime()
      : now;

  return labels
    .map((label, i) => {
      const mins = offsetsMins[i] ?? 60;
      const ts = Math.min(anchor, now) - mins * 60_000;
      return { label, at: new Date(ts).toISOString() };
    })
    .slice(0, 6);
}

export default async function LoadDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const rawLoad = mockLoads.find((l: Load) => {
    const anyLoad = l as unknown as Record<string, unknown>;
    const loadId = (anyLoad.id as string | undefined) ?? (anyLoad.loadId as string | undefined);
    return String(loadId) === decodedId;
  });

  if (!rawLoad) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-gray-500">Load Details</div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">Load not found</h1>
          <p className="mt-2 text-sm text-gray-600">
            We couldn’t find a load with ID <span className="font-mono">{decodedId}</span>.
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

  const evaluated = evaluateLoad(rawLoad, new Date());
  const level = statusLevelFromComputed(evaluated.computedStatus);

  const riskReason = evaluated.computedRiskReason ?? null;
  const nextAction = evaluated.computedNextAction;

  const { name: carrierName, phone: carrierPhone } = getCarrier(evaluated);
  const { originLabel, destinationLabel } = getLaneLabels(evaluated);
  const schedule = getSchedule(evaluated);

  const originTz = tzForCityState(originLabel);
  const destTz = tzForCityState(destinationLabel);

  const lastGpsMinutes = getLastGpsMinutes(evaluated);
  const freshness = gpsFreshnessFromMinutes(lastGpsMinutes);

  const timeline = buildTimeline(evaluated, level);
  const showNeedsAttention = evaluated.computedStatus !== 'green';

  return (
    <div className="min-h-screen">
      <LoadDetailHeader
        backHref="/"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">
              <span className="font-mono">{decodedId}</span>
            </h1>
            <StatusBadge level={level} />
          </div>
        }
      />

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        {showNeedsAttention && riskReason ? (
          <p className="mb-4 text-sm text-gray-700">
            <span className="font-semibold">Reason:</span>{' '}
            <LocalizeTextWithIso text={riskReason} />
          </p>
        ) : null}

        <div className="space-y-4">
          {showNeedsAttention ? (
            <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Needs Attention</h2>
                <span className="text-xs font-semibold text-gray-500">Exception-first</span>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-gray-800">
                  <span className="font-semibold">Risk:</span>{' '}
                  {riskReason ? <LocalizeTextWithIso text={riskReason} /> : '—'}
                </div>

                <div className="text-sm text-gray-800">
                  <span className="font-semibold">Next Action:</span> {nextAction}
                </div>

                {/* Logged call/text/map actions */}
                <ActionButtonsWithLog
                  loadId={decodedId}
                  phone={carrierPhone}
                  originLabel={originLabel}
                  destinationLabel={destinationLabel}
                />

                {/* Contact log + last contacted (local-only) */}
                <LoadContactLog loadId={decodedId} />
              </div>
            </section>
          ) : null}

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
                <div className="mt-1 text-sm font-semibold text-gray-900">{carrierName ?? '—'}</div>
                <div className="mt-1 text-sm text-gray-700">{carrierPhone ?? '—'}</div>

                <div className="mt-3">
                  <ActionButtonsWithLog
                    loadId={decodedId}
                    phone={carrierPhone}
                    originLabel={originLabel}
                    destinationLabel={destinationLabel}
                  />
                  {/* Always visible log reference near carrier contact */}
                  <LoadContactLog loadId={decodedId} limit={5} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
            <h2 className="text-sm font-semibold text-gray-900">Schedule</h2>

            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
                <div className="text-xs font-semibold text-gray-500">Pickup window</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {formatWindowInTz(schedule.pickupStart, schedule.pickupEnd, originTz)}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
                <div className="text-xs font-semibold text-gray-500">Delivery window</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {formatWindowInTz(schedule.deliveryStart, schedule.deliveryEnd, destTz)}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
            <h2 className="text-sm font-semibold text-gray-900">Tracking</h2>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-sm text-gray-800">
                <span className="font-semibold">Last GPS:</span>{' '}
                {lastGpsMinutes == null ? 'No GPS' : `${lastGpsMinutes} min ago`}
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge level={freshness.level} />
                <div className="text-sm text-gray-700">{freshness.label}</div>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">{freshness.detail}</p>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
            <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>

            <ol className="mt-4 space-y-4">
              {timeline.map((e, idx) => (
                <li key={`${e.label}-${idx}`} className="relative pl-6">
                  <span
                    className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-gray-400"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                    <div className="text-sm font-semibold text-gray-900">{e.label}</div>
                    {/* timeline uses origin tz (good enough for demo) */}
                    <div className="text-xs text-gray-500">{formatDateTimeInTz(e.at, originTz)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
