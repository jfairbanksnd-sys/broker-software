'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Load, EvaluatedLoad } from '@broker/shared';
import { LoadCard } from '@broker/ui';
import { addContactLogEntry, getLastContactForLoad } from '../lib/actionStateStore';

type LoadLike = Load | EvaluatedLoad;

function formatLastContactedLabel(atISO: string) {
  const d = new Date(atISO);
  if (Number.isNaN(d.getTime())) return atISO;

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.includes('@');
}

function getDispatchDriverEmails(load: LoadLike): { dispatchEmail: string | null; driverEmail: string | null } {
  const anyLoad = load as unknown as Record<string, unknown>;
  const carrier = anyLoad.carrier as any;

  const dispatchEmail =
    (anyLoad.dispatchEmail as string | undefined) ??
    (anyLoad.dispatcherEmail as string | undefined) ??
    (anyLoad.carrierDispatchEmail as string | undefined) ??
    (carrier?.dispatchEmail as string | undefined) ??
    (anyLoad.contacts as any)?.dispatchEmail ??
    null;

  const driverEmail =
    (anyLoad.driverEmail as string | undefined) ??
    (carrier?.driverEmail as string | undefined) ??
    (anyLoad.driver as any)?.email ??
    (anyLoad.contacts as any)?.driverEmail ??
    null;

  return {
    dispatchEmail: isEmail(dispatchEmail) ? dispatchEmail : null,
    driverEmail: isEmail(driverEmail) ? driverEmail : null,
  };
}

function buildMailtoHref(args: { to: string; cc?: string; subject: string; body: string }) {
  const params = new URLSearchParams();
  if (args.cc) params.set('cc', args.cc);
  params.set('subject', args.subject);
  params.set('body', args.body);
  return `mailto:${encodeURIComponent(args.to)}?${params.toString()}`;
}

function buildEmailHref(loadId: string, load: LoadLike) {
  const { dispatchEmail, driverEmail } = getDispatchDriverEmails(load);
  if (!dispatchEmail && !driverEmail) return undefined;

  const to = dispatchEmail ?? driverEmail ?? '';
  const cc = dispatchEmail && driverEmail ? driverEmail : undefined;

  const anyLoad = load as any;
  const riskReason: string | undefined = anyLoad.computedRiskReason ?? anyLoad.riskReason;
  const nextAction: string | undefined = anyLoad.computedNextAction ?? anyLoad.nextAction;

  const subject = `Load ${loadId} — Update Needed`;
  const bodyLines = [
    `Load: ${loadId}`,
    riskReason ? `Risk: ${riskReason}` : '',
    nextAction ? `Next Action: ${nextAction}` : '',
    '',
    'Please confirm current status and ETA.',
  ].filter(Boolean);

  return buildMailtoHref({
    to,
    cc,
    subject,
    body: bodyLines.join('\n'),
  });
}

export function LoadSection({
  title,
  subtitle,
  loads,
  emptyState,
  hideHeader,
}: {
  title: string;
  subtitle?: ReactNode;
  loads: LoadLike[];
  emptyState?: ReactNode;
  hideHeader?: boolean;
}) {
  
  const [mounted, setMounted] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => setMounted(true), []);

  // Re-render if contact log changes in another tab (or after CTA clicks)
  useEffect(() => {
    if (!mounted) return;

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'brokerSoftware.contactLog.v1') setBump((v) => v + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mounted]);

  const decorated = useMemo(() => {
    return loads.map((l) => {
      const emailHref = mounted ? buildEmailHref(l.id, l) : undefined;

      const last = mounted ? getLastContactForLoad(l.id) : undefined;
      const lastContactedLabel = last ? formatLastContactedLabel(last.atISO) : undefined;

      return { load: l, emailHref, lastContactedLabel };
    });
  }, [loads, mounted, bump]);

  function logContact(loadId: string, method: 'CALL' | 'TEXT' | 'MAP' | 'EMAIL') {
    const atISO = new Date().toISOString();
    addContactLogEntry({
      actionId: `${loadId}__CARD_${method}`,
      loadId,
      method,
      atISO,
    });
    setBump((v) => v + 1);
  }

  return (
    <section className="mt-6">
      {!hideHeader ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
          </div>
          <div className="text-sm text-slate-500">{loads.length ? `${loads.length}` : ''}</div>
        </div>
      ) : null}

      {loads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-700">
          {emptyState ?? 'No loads to show.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {decorated.map(({ load, emailHref, lastContactedLabel }) => (
            <LoadCard
              key={load.id}
              load={load}
              emailHref={emailHref}
              lastContactedLabel={lastContactedLabel}
              onContact={(method) => logContact(load.id, method)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
