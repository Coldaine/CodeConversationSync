'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Mic, Terminal } from 'lucide-react';
import { formatShortDateTime } from '@/lib/threadle-engine';
import type {
  InspectionTarget,
  SessionEpisode,
  ThreadleCorpus,
  WisprDictation,
} from '@/lib/types';

interface SessionsViewProps {
  corpus: ThreadleCorpus;
  filteredSessions: SessionEpisode[];
  filteredWispr: WisprDictation[];
  initialSubTab?: 'all' | 'sessions' | 'wispr' | 'unmatched';
  onInspect: (target: InspectionTarget) => void;
  onReassignSession: (sessionId: string, projectId: string | null) => void;
  onReassignWispr: (wisprId: string, projectId: string | null) => void;
}

export function SessionsView({
  corpus,
  filteredSessions,
  filteredWispr,
  initialSubTab = 'all',
  onInspect,
  onReassignSession,
  onReassignWispr,
}: SessionsViewProps) {
  const [subTab, setSubTab] = useState<'all' | 'sessions' | 'wispr' | 'unmatched'>(
    initialSubTab
  );

  const unmatchedWispr = filteredWispr.filter(
    (w) => w.attributionStatus === 'unmatched' || w.attributionStatus === 'ambiguous'
  );

  const showSessions = subTab === 'all' || subTab === 'sessions';
  const showWispr = subTab === 'all' || subTab === 'wispr' || subTab === 'unmatched';
  const displayedWispr = subTab === 'unmatched' ? unmatchedWispr : filteredWispr;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-950">
            Discovered Sessions &amp; Wispr Dictations
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Recovered across SER10, N5, Blood Arrow, Primary Desktop, Gemini Laptop, and Icarus. Reassign any item below—your corrections persist.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Catalog subset"
          className="flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200 shrink-0"
        >
          {(
            [
              { id: 'all', label: `All (${filteredSessions.length + filteredWispr.length})` },
              { id: 'sessions', label: `Sessions (${filteredSessions.length})` },
              { id: 'wispr', label: `Wispr (${filteredWispr.length})` },
              { id: 'unmatched', label: `Unmatched (${unmatchedWispr.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={subTab === t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                subTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions Table */}
      {showSessions && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Agent Sessions ({filteredSessions.length})
            </h2>
            <span className="text-xs text-slate-500">
              Audit hashes checked incrementally
            </span>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No coding sessions match your active filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredSessions.map((ses) => {
                const claimGap = ses.agentClaimedDone && !ses.verifiedDone;
                return (
                  <div
                    key={ses.id}
                    className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <Terminal className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span className="font-mono text-slate-700">{ses.host}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700">{ses.agent}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px]">{ses.branch}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatShortDateTime(ses.endedAt)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onInspect({ type: 'session', id: ses.id })}
                        className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 block truncate max-w-full"
                      >
                        {ses.title}
                      </button>

                      <p className="text-xs text-slate-600 line-clamp-1">
                        {ses.userIntent} — <span className="text-slate-500">{ses.whatRemains}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      {claimGap ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Claim unverified</span>
                        </span>
                      ) : ses.verifiedDone ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-600 capitalize">
                          {ses.status}
                        </span>
                      )}

                      <div>
                        <label htmlFor={`ses-proj-${ses.id}`} className="sr-only">
                          Assign project for {ses.title}
                        </label>
                        <select
                          id={`ses-proj-${ses.id}`}
                          value={ses.projectId ?? ''}
                          onChange={(e) =>
                            onReassignSession(
                              ses.id,
                              e.target.value === '' ? null : e.target.value
                            )
                          }
                          className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 max-w-[220px]"
                        >
                          <option value="">Unassigned</option>
                          {corpus.projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Wispr Dictations & Unmatched Notes */}
      {showWispr && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Wispr Flow Dictations ({displayedWispr.length})
            </h2>
            <span className="text-xs text-slate-500">
              Primary Desktop · Gemini Laptop · Icarus
            </span>
          </div>

          {displayedWispr.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No Wispr dictations match your active filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {displayedWispr.map((w) => (
                <div
                  key={w.id}
                  className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <Mic className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                      <span className="font-mono text-slate-700">
                        {w.capturedOnHost}
                        {w.targetHost && w.targetHost !== w.capturedOnHost
                          ? ` -> ${w.targetHost}`
                          : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{w.durationSeconds}s</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {formatShortDateTime(w.timestamp)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          w.attributionStatus === 'unmatched' ||
                          w.attributionStatus === 'ambiguous'
                            ? 'text-amber-800 font-medium'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        {w.attributionStatus.replaceAll('_', ' ')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onInspect({ type: 'wispr', id: w.id })}
                      className="text-left text-sm text-slate-900 hover:text-blue-700 block"
                    >
                      &ldquo;{w.transcript}&rdquo;
                    </button>

                    <p className="text-xs text-slate-500">
                      Intent: {w.extractedIntent} · {w.attributionReason}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <label htmlFor={`wispr-proj-${w.id}`} className="sr-only">
                      Assign project for Wispr dictation {w.id}
                    </label>
                    <select
                      id={`wispr-proj-${w.id}`}
                      value={w.matchedProjectId ?? ''}
                      onChange={(e) =>
                        onReassignWispr(
                          w.id,
                          e.target.value === '' ? null : e.target.value
                        )
                      }
                      className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 max-w-[230px]"
                    >
                      <option value="">Unmatched / Ambiguous Inbox</option>
                      {corpus.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
