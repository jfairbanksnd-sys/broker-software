'use client';

import Link from 'next/link';
import { TimeZoneClocks } from './TimeZoneClocks';

export function LoadDetailHeader({
  backHref = '/',
  title,
  rightSlot,
}: {
  backHref?: string;
  title: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-4xl px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={backHref} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
              ← Dashboard
            </Link>
            <div className="mt-2">{title}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <TimeZoneClocks />
            </div>

            {rightSlot ?? (
              <>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="h-10 w-10 rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
                >
                  <span className="text-lg">🔔</span>
                </button>
                <button
                  type="button"
                  aria-label="Profile"
                  className="h-10 w-10 rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
                >
                  <span className="text-lg">👤</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
