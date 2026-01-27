'use client';

import { useMemo } from 'react';

export function LocalizeTextWithIso({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const rendered = useMemo(() => {
    if (!text) return '—';

    // Replace ISO timestamps ending in Z with local time.
    // Example match: 2026-01-27T13:45:48.207Z
    return text.replace(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z/g,
      (iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;

        return new Intl.DateTimeFormat(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(d);
      }
    );
  }, [text]);

  return <span className={className}>{rendered}</span>;
}
