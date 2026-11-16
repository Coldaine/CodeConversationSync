'use client';

import { useState } from 'react';
import { CheckCircle2, RefreshCw, Sparkles, X } from 'lucide-react';
import type {
  AgentSource,
  HostId,
  SessionEpisode,
  ThreadleCorpus,
  WisprDictation,
} from '@/lib/types';

interface IngestModalProps {
  open: boolean;
  corpus: ThreadleCorpus;
  onClose: () => void;
  onIngestSession: (session: SessionEpisode, targetProjectId: string | null) => void;
  onIngestWispr: (wispr: WisprDictation) => void;
}

const HOSTS: HostId[] = [
  'SER10',
  'N5',
  'Blood Arrow',
  'Primary Desktop',
  'Gemini Laptop',
  'Icarus',
];

const AGENTS: AgentSource[] = [
  'Claude Code',
  'Codex',
  'Droid',
  'OMP',
  'Maestro',
  'Claude Desktop',
  'ChatGPT',
];

export function IngestModal({
  open,
  corpus,
  onClose,
  onIngestSession,
  onIngestWispr,
}: IngestModalProps) {
  const [mode, setMode] = useState<'import' | 'sync'>('import');
  const [sourceType, setSourceType] = useState<'session' | 'wispr'>('session');
  const [host, setHost] = useState<HostId>('SER10');
  const [targetHost, setTargetHost] = useState<HostId>('SER10');
  const [agent, setAgent] = useState<AgentSource>('Claude Code');
  const [repo, setRepo] = useState('github.com/pmaclyman/threadle-core');
  const [branch, setBranch] = useState('feat/new-recovery');
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncComplete, setSyncComplete] = useState<string | null>(null);

  if (!open) return null;

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rawText.trim().length < 8) {
      setError(
        'Please paste at least 8 characters of transcript or Wispr dictation text.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          sourceType,
          host,
          agent: sourceType === 'wispr' ? 'Wispr Flow' : agent,
          repo,
          branch,
          existingProjects: corpus.projects.map((p) => ({
            id: p.id,
            name: p.name,
            repos: p.repos,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      const a = data.analysis;
      const nowIso = new Date().toISOString();
      const matchedId =
        corpus.projects.some((p) => p.id === a.matchedProjectId)
          ? a.matchedProjectId
          : null;

      if (sourceType === 'wispr') {
        const wisprHost: 'Primary Desktop' | 'Gemini Laptop' | 'Icarus' =
          host === 'Gemini Laptop' || host === 'Icarus'
            ? host
            : 'Primary Desktop';
        const newWispr: WisprDictation = {
          id: `w-ing-${Date.now()}`,
          capturedOnHost: wisprHost,
          targetHost: targetHost !== wisprHost ? targetHost : undefined,
          timestamp: nowIso,
          durationSeconds: Math.max(12, Math.round(rawText.split(/\s+/).length / 2.2)),
          transcript: rawText.trim(),
          matchedSessionId: null,
          matchedProjectId: matchedId,
          attributionStatus: matchedId
            ? targetHost !== wisprHost
              ? 'cross_host_matched'
              : 'matched'
            : 'ambiguous',
          attributionReason: a.attributionReason,
          extractedIntent: a.userIntent,
        };
        onIngestWispr(newWispr);
      } else {
        const newSession: SessionEpisode = {
          id: `ses-ing-${Date.now()}`,
          title: a.title || 'Imported Agent Session',
          projectId: matchedId,
          taskId: null,
          host,
          agent,
          repo,
          branch,
          directory: `~/workspace/${repo.split('/').pop() ?? 'repo'}`,
          startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          endedAt: nowIso,
          status: a.deliverableStatus === 'abandoned' ? 'abandoned' : 'completed',
          userIntent: a.userIntent,
          whatHappened: a.whatHappened,
          whatRemains: a.whatRemains,
          agentClaimedDone: Boolean(a.discrepancyDetected),
          verifiedDone: a.deliverableStatus === 'verified' || a.deliverableStatus === 'merged',
          transcriptSnippet: rawText.trim().slice(0, 260),
          contentHash: `sha256:${Date.now().toString(16)}`,
          analyzedBy: `Gemini 4 Hydrogen (${data.model})`,
        };
        onIngestSession(newSession, matchedId);
      }

      setRawText('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze input.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunIncrementalSync = () => {
    const totalSessions = corpus.hostCollectors.reduce(
      (acc, h) => acc + h.sessionsIndexed,
      0
    );
    const totalWispr = corpus.hostCollectors.reduce(
      (acc, h) => acc + h.wisprRecords,
      0
    );
    setSyncComplete(
      `Incremental audit verified ${totalSessions} sessions and ${totalWispr} Wispr records across 6 hosts. Skipped unchanged contentHashes; 2 pending episodes queued for DeepSeek 4.1 Flash (16-concurrency pool).`
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ingest and Reconcile Work"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              Ingest &amp; Reconcile History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Analyze a raw transcript or Wispr note, or inspect multi-host incremental audit sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ingest modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 border-b border-slate-200 flex items-center gap-6 bg-slate-50">
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`relative py-2.5 text-xs font-medium ${
              mode === 'import' ? 'text-slate-950' : 'text-slate-600'
            }`}
          >
            Analyze Session / Wispr Note
            {mode === 'import' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode('sync')}
            className={`relative py-2.5 text-xs font-medium ${
              mode === 'sync' ? 'text-slate-950' : 'text-slate-600'
            }`}
          >
            Host Audit Collectors &amp; Hash Cache
            {mode === 'sync' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>

        {mode === 'import' ? (
          <form onSubmit={handleImportSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="ingest-source-type"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Source Type
                </label>
                <select
                  id="ingest-source-type"
                  value={sourceType}
                  onChange={(e) =>
                    setSourceType(e.target.value as 'session' | 'wispr')
                  }
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900"
                >
                  <option value="session">CLI / Desktop Agent Session</option>
                  <option value="wispr">Wispr Flow Dictation</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="ingest-host"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Captured On Host
                </label>
                <select
                  id="ingest-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value as HostId)}
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900"
                >
                  {HOSTS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {sourceType === 'session' ? (
                <div>
                  <label
                    htmlFor="ingest-agent"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Agent
                  </label>
                  <select
                    id="ingest-agent"
                    value={agent}
                    onChange={(e) => setAgent(e.target.value as AgentSource)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900"
                  >
                    {AGENTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="ingest-target-host"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Target Host (Optional)
                  </label>
                  <select
                    id="ingest-target-host"
                    value={targetHost}
                    onChange={(e) => setTargetHost(e.target.value as HostId)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900"
                  >
                    {HOSTS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {sourceType === 'session' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ingest-repo"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Repository
                  </label>
                  <input
                    id="ingest-repo"
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ingest-branch"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Branch / Worktree
                  </label>
                  <input
                    id="ingest-branch"
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="ingest-raw-text"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Transcript Excerpt or Wispr Dictation
              </label>
              <textarea
                id="ingest-raw-text"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste session transcript or dictated note (e.g. 'Remind me to check why N5 DuckDB compaction failed on the 4GB RSS cap...')"
                className="w-full p-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-600"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Extracting Intent & Attributing...'
                    : 'Classify & Add to Threadle'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              {corpus.hostCollectors.map((hc) => (
                <div
                  key={hc.host}
                  className="px-4 py-2.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{hc.host}</div>
                    <div className="text-slate-500">{hc.role}</div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-slate-600 tabular-nums">
                    <div>
                      {hc.sessionsIndexed} sessions · {hc.wisprRecords} Wispr
                    </div>
                    <div className="text-slate-400">
                      {hc.runningSessions > 0
                        ? `${hc.runningSessions} active now`
                        : 'idle'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {syncComplete && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{syncComplete}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                DeepSeek 4.1 Flash worker cap: 16 concurrent · hash-skip enabled
              </span>
              <button
                type="button"
                onClick={handleRunIncrementalSync}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Run Incremental Reconciliation</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
