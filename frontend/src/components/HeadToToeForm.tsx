import { useEffect, useMemo, useState } from 'react';
import type { ScheduleItem } from '../types';
import { API_BASE } from '../config';

// Backend's headToToeSystems definition shape — duplicated here as a
// minimal client type. The form pulls the canonical list at open time
// rather than hardcoding it so the server stays the source of truth.
interface SystemDef {
  id: string;
  label: string;
  exceptions: string[];
  subforms?: string[];
}

interface SystemFinding {
  wdl: boolean;
  exceptions: string[];
  notes: string;
}

interface SavedAssessment {
  id: string;
  visit_id: string;
  mode: 'wdl' | 'checklist';
  systems: Record<string, SystemFinding>;
  summary_notes: string | null;
  completed_at: string;
}

interface HeadToToeFormProps {
  item: ScheduleItem;
  visitId: string;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

function emptyFinding(): SystemFinding {
  return { wdl: true, exceptions: [], notes: '' };
}

export default function HeadToToeForm({ item, visitId, onSubmit, onCancel }: HeadToToeFormProps) {
  const [systemsDef, setSystemsDef] = useState<SystemDef[] | null>(null);
  const [mode, setMode] = useState<'wdl' | 'checklist'>('wdl');
  const [findings, setFindings] = useState<Record<string, SystemFinding>>({});
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the system definitions + any prior saved assessment when the
  // form opens. Re-opening an already-saved assessment lets the nurse
  // amend it before sign-off rather than start over.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/visits/${visitId}/head-to-toe`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { systems_def: SystemDef[]; assessment: SavedAssessment | null } | null) => {
        if (cancelled || !d) return;
        setSystemsDef(d.systems_def);
        const initial: Record<string, SystemFinding> = {};
        for (const s of d.systems_def) {
          initial[s.id] = d.assessment?.systems?.[s.id] ?? emptyFinding();
        }
        setFindings(initial);
        if (d.assessment) {
          setMode(d.assessment.mode);
          setSummary(d.assessment.summary_notes ?? '');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visitId]);

  const exceptionCount = useMemo(
    () => Object.values(findings).filter((f) => !f.wdl || f.exceptions.length > 0).length,
    [findings],
  );

  function update(id: string, patch: Partial<SystemFinding>) {
    setFindings((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function toggleException(id: string, flag: string) {
    setFindings((prev) => {
      const cur = prev[id];
      const has = cur.exceptions.includes(flag);
      const next = {
        ...cur,
        exceptions: has ? cur.exceptions.filter((f) => f !== flag) : [...cur.exceptions, flag],
        // Adding an exception implicitly disables WDL.
        wdl: has ? cur.wdl : false,
      };
      return { ...prev, [id]: next };
    });
  }

  function markAllWdl() {
    setFindings((prev) => {
      const next: Record<string, SystemFinding> = {};
      for (const id of Object.keys(prev)) next[id] = emptyFinding();
      return next;
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    // Validation: every system must be either WDL or have ≥1 exception/notes.
    if (systemsDef) {
      const missing = systemsDef.find((s) => {
        const f = findings[s.id];
        if (!f) return true;
        if (f.wdl) return false;
        return f.exceptions.length === 0 && !f.notes.trim();
      });
      if (missing) {
        setError(`${missing.label}: mark WDL or add an exception/note.`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/visits/${visitId}/head-to-toe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          systems: findings,
          summary_notes: summary.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error('Save failed');
      // Build a human-readable summary so the chat message to Aria
      // reads like a normal handoff instead of "head_to_toe_logged".
      const flagged = (systemsDef ?? [])
        .map((s) => ({ s, f: findings[s.id] }))
        .filter(({ f }) => f && (!f.wdl || f.exceptions.length > 0 || f.notes.trim()))
        .map(({ s, f }) => {
          const parts: string[] = [];
          if (f.exceptions.length > 0) parts.push(f.exceptions.join(', '));
          if (f.notes.trim()) parts.push(f.notes.trim());
          return parts.length > 0
            ? `${s.label} — ${parts.join('; ')}`
            : s.label;
        });
      onSubmit(item, {
        action: 'head_to_toe_logged',
        exceptions: String(exceptionCount),
        flagged: flagged.join(' | '),
        summary_notes: summary.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!systemsDef) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-400">
        Loading head-to-toe form…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Head-to-toe assessment</h4>
          <p className="mt-0.5 text-[11px] text-gray-500">
            12 systems · {exceptionCount === 0 ? 'all WDL' : `${exceptionCount} exception${exceptionCount === 1 ? '' : 's'} flagged`}
          </p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-medium text-gray-500 uppercase tracking-wide">Variant</span>
          {(['wdl', 'checklist'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                mode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'wdl' ? 'WDL (IA/SD)' : 'Checklist (FL)'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={markAllWdl}
          className="text-[11px] font-medium text-gray-600 underline-offset-2 hover:underline"
        >
          Mark all WDL
        </button>
      </div>

      {/* Per-system rows */}
      <div className="space-y-2">
        {systemsDef.map((s) => {
          const f = findings[s.id] ?? emptyFinding();
          return (
            <div
              key={s.id}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                f.wdl
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : 'border-amber-200 bg-amber-50/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{s.label}</span>
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={f.wdl}
                    onChange={(e) => {
                      const wdl = e.target.checked;
                      update(s.id, wdl ? { wdl: true, exceptions: [], notes: '' } : { wdl: false });
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  WDL
                </label>
              </div>

              {/* Exception chips — only when not WDL */}
              {!f.wdl && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.exceptions.map((flag) => {
                      const checked = f.exceptions.includes(flag);
                      return (
                        <button
                          key={flag}
                          type="button"
                          onClick={() => toggleException(s.id, flag)}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            checked
                              ? 'bg-amber-600 text-white'
                              : 'bg-white text-gray-600 ring-1 ring-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {flag}
                        </button>
                      );
                    })}
                  </div>
                  {mode === 'checklist' && s.subforms && s.subforms.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      Subform links available: {s.subforms.join(', ')}
                    </p>
                  )}
                  <input
                    type="text"
                    value={f.notes}
                    onChange={(e) => update(s.id, { notes: e.target.value })}
                    placeholder="Add a brief note (optional)"
                    className="mt-2 w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-3">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Summary notes <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="One-line overall impression — folded into the visit narrative."
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className={`mt-3 w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
          submitting
            ? 'cursor-not-allowed bg-gray-200 text-gray-400'
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
      >
        {submitting ? 'Saving…' : 'Save head-to-toe'}
      </button>
    </div>
  );
}
