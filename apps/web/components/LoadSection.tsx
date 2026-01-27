import type { Load, EvaluatedLoad } from '@broker/shared';
import { LoadCard } from '@broker/ui';

type LoadLike = Load | EvaluatedLoad;

export function LoadSection({
  title,
  subtitle,
  loads,
  emptyState,
}: {
  title: string;
  subtitle?: React.ReactNode;
  loads: LoadLike[];
  emptyState?: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
        <div className="text-sm text-slate-500">{loads.length ? `${loads.length}` : ''}</div>
      </div>

      {loads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-700">
          {emptyState ?? 'No loads to show.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {loads.map((l) => (
            <LoadCard key={l.id} load={l} />
          ))}
        </div>
      )}
    </section>
  );
}
