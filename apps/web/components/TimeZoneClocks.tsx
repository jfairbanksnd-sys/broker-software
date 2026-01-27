'use client';

import { useEffect, useMemo, useState } from 'react';

type ClockDef = { label: string; tz: string };

const CLOCKS: ClockDef[] = [
  { label: 'Pacific', tz: 'America/Los_Angeles' },
  { label: 'Mountain', tz: 'America/Denver' },
  { label: 'Central', tz: 'America/Chicago' },
  { label: 'Eastern', tz: 'America/New_York' },
];

function formatClock(d: Date, timeZone: string) {
  // Example: "8:15 AM PST"
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export function TimeZoneClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    return CLOCKS.map((c) => ({
      ...c,
      value: formatClock(now, c.tz),
    }));
  }, [now]);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map((c) => (
        <div
          key={c.tz}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="text-xs font-semibold text-slate-600">{c.label}</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
