export function ReportsPage() {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">Reports</h1>
      <div className="rounded-xl border border-gray-200 bg-white p-8 mt-4 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-base font-semibold text-gray-800">
          QC reporting arrives in Phase 8
        </p>
        <p className="text-sm text-gray-500 mt-1">
          See the change plan §6 for what's planned — checklist metrics,
          per-inspector and per-district stats, and Excel export.
        </p>
      </div>
    </div>
  );
}
