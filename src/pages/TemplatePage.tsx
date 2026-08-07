import { useState, useEffect } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { toTitleCase }        from '@/utils/districtUtils';
import { useAppConfig }       from '@/hooks/useAppConfig';
import { useAuthStore }       from '@/store/authStore';
import { useTemplateActions } from '@/hooks/useTemplateActions';
import { can }                from '@/config/roles';
import { TemplateEditor }     from '@/components/template/TemplateEditor';
import { Button } from '@/components/ui/button';

export function TemplatePage() {
  const { currentUser }      = useAuthStore();
  const isViewOnly           = !can(currentUser?.role, 'manageTemplate');
  const { config, loading }  = useAppConfig();
  const { saveQcTemplate, saveDistrictsByState } = useTemplateActions();

  const [districtsByState,       setDistrictsByState]       = useState<Record<string, string[]>>({});
  const [newState,               setNewState]               = useState('');
  const [newDistrictInput,       setNewDistrictInput]       = useState<Record<string, string>>({});
  const [districtsByStateDirty,  setDistrictsByStateDirty]  = useState(false);
  const [savingDistrictsByState, setSavingDistrictsByState] = useState(false);

  useEffect(() => {
    if (!loading && !districtsByStateDirty) {
      setDistrictsByState(config.districtsByState ?? {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.districtsByState, loading]);

  function handleAddState() {
    const val = toTitleCase(newState.trim());
    if (!val || Object.keys(districtsByState).some((s) => s.toLowerCase() === val.toLowerCase())) return;
    setDistrictsByState((prev) => ({ ...prev, [val]: [] }));
    setNewState('');
    setDistrictsByStateDirty(true);
  }

  function handleRemoveState(state: string) {
    const districtCount = districtsByState[state]?.length ?? 0;
    if (districtCount > 0) {
      const confirmed = window.confirm(
        `"${state}" has ${districtCount} district(s) under it. Removing this ` +
        `state will also remove all its districts from the list. Continue?`
      );
      if (!confirmed) return;
    }
    setDistrictsByState((prev) => {
      const next = { ...prev };
      delete next[state];
      return next;
    });
    setDistrictsByStateDirty(true);
  }

  function handleAddDistrictToState(state: string) {
    const val = toTitleCase((newDistrictInput[state] ?? '').trim());
    const existing = districtsByState[state] ?? [];
    if (!val || existing.some((d) => d.toLowerCase() === val.toLowerCase())) return;
    setDistrictsByState((prev) => ({ ...prev, [state]: [...existing, val] }));
    setNewDistrictInput((prev) => ({ ...prev, [state]: '' }));
    setDistrictsByStateDirty(true);
  }

  function handleRemoveDistrictFromState(state: string, district: string) {
    setDistrictsByState((prev) => ({
      ...prev,
      [state]: (prev[state] ?? []).filter((d) => d !== district),
    }));
    setDistrictsByStateDirty(true);
  }

  async function handleSaveDistrictsByState() {
    setSavingDistrictsByState(true);
    try {
      await saveDistrictsByState(districtsByState);
      setDistrictsByStateDirty(false);
    } catch {
      // toast shown by saveDistrictsByState
    } finally {
      setSavingDistrictsByState(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Template</h1>
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Page header */}
      <h1 className="text-xl font-bold text-gray-900 mb-1">QC Checklist</h1>
      <p className="text-sm text-gray-500 mb-5">
        Editing here applies to <strong>new jobs only</strong> — a job already in progress
        keeps the checklist exactly as it was when it was created.
      </p>

      <TemplateEditor
        template={config.qcTemplate ?? []}
        onSave={(fields) => saveQcTemplate(fields, config.qcTemplate ?? [])}
      />

      {/* States & Districts */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">States &amp; Districts</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage states and their districts for customers and inspectors</p>
          </div>
          <div className="flex items-center gap-2">
            {districtsByStateDirty && !isViewOnly && (
              <Button
                size="sm"
                onClick={handleSaveDistrictsByState}
                disabled={savingDistrictsByState}
                className="flex items-center gap-1.5"
              >
                {savingDistrictsByState ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            )}
          </div>
        </div>

        {Object.keys(districtsByState).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center mb-4">
            <p className="text-sm text-gray-500 font-medium">No states added yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add a state below to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mb-4">
            {Object.entries(districtsByState).map(([stateName, statedistricts]) => (
              <div key={stateName} className="rounded-xl border border-gray-200 bg-white p-4">
                {/* State header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">{stateName}</span>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveState(stateName)}
                      className="rounded p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                      aria-label={`Remove state ${stateName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* District chips */}
                <div className="flex flex-wrap gap-2 mb-3 min-h-[1.5rem]">
                  {statedistricts.length === 0 ? (
                    <p className="text-xs text-gray-400">No districts yet — add one below.</p>
                  ) : (
                    statedistricts.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                      >
                        {d}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDistrictFromState(stateName, d)}
                            className="ml-0.5 rounded-full hover:bg-blue-100 p-0.5"
                            aria-label={`Remove ${d}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>

                {/* Add district input */}
                {!isViewOnly && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDistrictInput[stateName] ?? ''}
                      onChange={(e) => setNewDistrictInput((prev) => ({ ...prev, [stateName]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDistrictToState(stateName); } }}
                      placeholder="New district name…"
                      className="flex-1 h-8 rounded-md border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddDistrictToState(stateName)}
                      disabled={!(newDistrictInput[stateName] ?? '').trim()}
                      className="h-8 px-2 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new state */}
        {!isViewOnly && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newState}
              onChange={(e) => setNewState(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddState(); } }}
              placeholder="New state name…"
              className="flex-1 h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddState}
              disabled={!newState.trim()}
              className="h-9 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add State
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
