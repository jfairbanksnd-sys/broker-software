'use client';

import { useEffect, useMemo, useState } from 'react';

type Clock = { label: string; tz: string };

const CLOCKS: Clock[] = [
  { label: 'Pacific', tz: 'America/Los_Angeles' },
  { label: 'Mountain', tz: 'America/Denver' },
  { label: 'Central', tz: 'America/Chicago' },
  { label: 'Eastern', tz: 'America/New_York' },
];

function formatClock(d: Date, timeZone: string) {
  // Example: 9:41 PM
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function TimeZoneClocks() {
  // Avoid hydration mismatch: don’t render live times until mounted
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setMounted(true);
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const items = useMemo(() => {
    return CLOCKS.map((c) => ({
      ...c,
      time: mounted ? formatClock(now, c.tz) : '—',
    }));
  }, [mounted, now]);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
      {items.map((c) => (
        <div
          key={c.tz}
          className="flex items-baseline justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="text-xs font-semibold text-slate-600">{c.label}</div>
          <div className="font-mono text-sm font-semibold text-slate-900">{c.time}</div>
        </div>
      ))}
    </div>
  );
}
