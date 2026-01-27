export default async function LoadStubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Load</h1>
        <p className="mt-2 text-slate-700">
          Load ID: <span className="font-mono font-semibold">{decodeURIComponent(id)}</span>
        </p>
        <p className="mt-4 text-sm text-slate-600">
          Stub page only (full load view comes later).
        </p>
      </div>
    </main>
  );
}
