'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  GitPullRequest,
  Mic,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  buildContinuationPacket,
  formatShortDateTime,
} from '@/lib/threadle-engine';
import type {
  DeliverableStatus,
  InspectionTarget,
  ThreadleCorpus,
} from '@/lib/types';
import { DeliverableStatusLabel, ProjectHealthLabel } from './StatusText';

interface DetailDrawerProps {
  target: InspectionTarget | null;
  corpus: ThreadleCorpus;
  onClose: () => void;
  onUpdateDeliverableStatus: (deliverableId: string, status: DeliverableStatus) => void;
  onToggleIntentionResolved: (intentionId: string, resolved: boolean) => void;
  onReassignWispr: (wisprId: string, projectId: string | null) => void;
  onInspect: (target: InspectionTarget) => void;
}

const DELIVERABLE_STATUS_OPTIONS: DeliverableStatus[] = [
  'requested',
  'implemented',
  'pr_open',
  'merged',
  'verified',
  'blocked',
  'abandoned',
  'unknown',
];

export function DetailDrawer({
  target,
  corpus,
  onClose,
  onUpdateDeliverableStatus,
  onToggleIntentionResolved,
  onReassignWispr,
  onInspect,
}: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'evidence' | 'sessions' | 'packet'
  >('overview');
  const [copied, setCopied] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!target) return null;

  // Resolve target context up to its parent Project so every inspection shows full grounding
  const session =
    target.type === 'session'
      ? corpus.sessions.find((s) => s.id === target.id)
      : undefined;
  const wispr =
    target.type === 'wispr'
      ? corpus.wisprDictations.find((w) => w.id === target.id)
      : undefined;
  const task =
    target.type === 'task'
      ? corpus.tasks.find((t) => t.id === target.id)
      : session?.taskId
        ? corpus.tasks.find((t) => t.id === session.taskId)
        : undefined;

  const projectId =
    target.type === 'project'
      ? target.id
      : task?.projectId ?? session?.projectId ?? wispr?.matchedProjectId ?? null;

  const project = projectId
    ? corpus.projects.find((p) => p.id === projectId)
    : undefined;

  const projectTasks = project
    ? corpus.tasks.filter((t) => t.projectId === project.id)
    : task
      ? [task]
      : [];
  const projectDeliverables = project
    ? corpus.deliverables.filter((d) => d.projectId === project.id)
    : [];
  const projectSessions = project
    ? corpus.sessions.filter((s) => s.projectId === project.id)
    : session
      ? [session]
      : [];
  const projectWispr = project
    ? corpus.wisprDictations.filter((w) => w.matchedProjectId === project.id)
    : wispr
      ? [wispr]
      : [];

  const relevantIntentions = corpus.intentions.filter((i) => {
    if (!project) return false;
    const text = i.sourceRef.toLowerCase();
    return (
      projectSessions.some((s) => text.includes(s.id.toLowerCase())) ||
      projectWispr.some((w) => text.includes(w.id.toLowerCase())) ||
      projectTasks.some((t) =>
        i.statement.toLowerCase().includes(t.repo.split('/').pop() ?? '')
      ) ||
      (project.id === 'proj-semantic-router' &&
        (i.id === 'int-1' || i.id === 'int-2' || i.id === 'int-4')) ||
      (project.id === 'proj-host-collector' &&
        (i.id === 'int-3' || i.id === 'int-5')) ||
      (project.id === 'proj-duckdb-compaction' && i.id === 'int-6') ||
      (project.id === 'proj-passkey-gateway' && i.id === 'int-7') ||
      (project.id === 'proj-deepseek-batch' && i.id === 'int-8')
    );
  });

  const packetText = project
    ? buildContinuationPacket(
        project,
        projectTasks,
        projectDeliverables,
        projectSessions,
        relevantIntentions,
        projectWispr
      )
    : '';

  const handleCopyPacket = async () => {
    if (!packetText) return;
    await navigator.clipboard?.writeText(packetText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleAiReconstruct = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiNote(null);
    try {
      const sourceText = wispr
        ? wispr.transcript
        : session
          ? `${session.userIntent}\n${session.whatHappened}\n${session.transcriptSnippet}`
          : `${project?.latestObjective ?? ''}\n${project?.currentState ?? ''}\nSessions:\n${projectSessions
              .map((s) => `- ${s.title}: ${s.whatHappened} | Remains: ${s.whatRemains}`)
              .join('\n')}`;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: sourceText,
          sourceType: wispr ? 'wispr' : project ? 'project_recheck' : 'session',
          host: wispr?.capturedOnHost ?? session?.host ?? project?.hosts[0],
          agent: session?.agent ?? 'Multi-agent',
          repo: project?.repos[0],
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
      setAiNote(
        `Intent: ${a.userIntent}\nNext Action: ${a.nextAction}\nUnfinished: ${(a.forgottenOrUnfinishedItems ?? []).join('; ')}`
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to run AI check.');
    } finally {
      setAiLoading(false);
    }
  };

  const headingTitle =
    target.type === 'wispr' && wispr
      ? `Wispr Dictation (${wispr.capturedOnHost})`
      : target.type === 'session' && session
        ? session.title
        : target.type === 'task' && task
          ? task.title
          : project?.name ?? 'Inspection Detail';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={headingTitle}
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
    >
      <div className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              {target.type} inspector
              {project && target.type !== 'project' ? ` · ${project.name}` : ''}
            </div>
            <h2 className="font-display text-base font-semibold text-slate-950 leading-snug">
              {headingTitle}
            </h2>
            {project && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <ProjectHealthLabel health={project.healthStatus} />
                <span aria-hidden="true">·</span>
                <span className="font-mono">{project.repos.join(', ')}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail inspector"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Sub-tabs */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-6 bg-slate-50">
          {(
            [
              { id: 'overview', label: 'Intent & Unfinished' },
              {
                id: 'evidence',
                label: `Deliverables & Proof (${projectDeliverables.length})`,
              },
              {
                id: 'sessions',
                label: `Sessions & Wispr (${projectSessions.length + projectWispr.length})`,
              },
              { id: 'packet', label: 'Continuation Packet' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`relative py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'text-slate-950'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {activeTab === t.id && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600"
                />
              )}
            </button>
          ))}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Specific Session or Wispr spotlight when opened directly */}
          {wispr && target.type === 'wispr' && (
            <div className="p-4 border border-blue-200 bg-blue-50/40 rounded-md space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-mono text-blue-800">
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  {wispr.capturedOnHost}
                  {wispr.targetHost ? ` -> ${wispr.targetHost}` : ''}
                </span>
                <span className="font-mono tabular-nums">
                  {formatShortDateTime(wispr.timestamp)}
                </span>
              </div>
              <p className="text-sm text-slate-900 italic">
                &ldquo;{wispr.transcript}&rdquo;
              </p>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Attribution: </span>
                {wispr.attributionReason}
              </div>
              <div className="pt-2 flex items-center gap-2">
                <label
                  htmlFor="drawer-wispr-assign"
                  className="text-xs font-medium text-slate-700"
                >
                  Link to Project:
                </label>
                <select
                  id="drawer-wispr-assign"
                  value={wispr.matchedProjectId ?? ''}
                  onChange={(e) =>
                    onReassignWispr(
                      wispr.id,
                      e.target.value === '' ? null : e.target.value
                    )
                  }
                  className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
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
          )}

          {session && target.type === 'session' && (
            <div className="p-4 border border-slate-200 bg-slate-50 rounded-md space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600">
                <span>
                  {session.host} · {session.agent} · {session.branch}
                </span>
                <span className="tabular-nums">
                  {formatShortDateTime(session.endedAt)}
                </span>
              </div>
              <div className="text-xs text-slate-700">
                <span className="font-semibold">Directory: </span>
                <span className="font-mono">{session.directory}</span>
              </div>
              <p className="text-xs text-slate-800 bg-white border border-slate-200 rounded p-2.5 font-mono">
                {session.transcriptSnippet}
              </p>
            </div>
          )}

          {/* TAB 1: Intent & Unfinished */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {project && (
                <>
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Current State &amp; Supported Objective
                      </h3>
                      <button
                        type="button"
                        onClick={handleAiReconstruct}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {aiLoading ? 'Analyzing...' : 'Re-check Intent with AI'}
                        </span>
                      </button>
                    </div>
                    <p className="text-sm text-slate-900 leading-relaxed">
                      {project.latestObjective}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {project.currentState}
                    </p>

                    {aiError && (
                      <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
                        {aiError}
                      </div>
                    )}
                    {aiNote && (
                      <div className="p-3 text-xs text-slate-800 bg-blue-50/70 border border-blue-200 rounded-md whitespace-pre-wrap">
                        {aiNote}
                      </div>
                    )}
                  </section>

                  <section className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Forgotten Requests, Decisions &amp; Constraints
                    </h3>
                    {relevantIntentions.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No structured intentions extracted yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                        {relevantIntentions.map((intent) => (
                          <div
                            key={intent.id}
                            className="p-3 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-700 uppercase">
                                  {intent.kind.replaceAll('_', ' ')}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono truncate">
                                  {intent.sourceRef}
                                </span>
                              </div>
                              <p
                                className={`text-xs leading-relaxed ${
                                  intent.resolved
                                    ? 'text-slate-500 line-through'
                                    : 'text-slate-900'
                                }`}
                              >
                                {intent.statement}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onToggleIntentionResolved(
                                  intent.id,
                                  !intent.resolved
                                )
                              }
                              className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700 shrink-0"
                            >
                              {intent.resolved ? 'Reopen' : 'Mark resolved'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Workstream Tasks ({projectTasks.length})
                    </h3>
                    <div className="space-y-2.5">
                      {projectTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 border border-slate-200 rounded-md space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {t.title}
                            </span>
                            {t.isForgotten && (
                              <span className="text-[11px] font-medium text-amber-800">
                                Forgotten
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">{t.objective}</p>
                          <div className="text-xs text-slate-800 pt-1">
                            <span className="font-semibold">Next: </span>
                            {t.nextAction}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {/* TAB 2: Deliverables & Provenance Evidence */}
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Agent completion claims are checked separately against git branches, PR status, CI runs, and deployed artifacts. Override status manually if you verified it directly.
              </p>

              {projectDeliverables.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No deliverables attached to this record yet.
                </p>
              ) : (
                projectDeliverables.map((d) => {
                  const linkedEvidence = corpus.evidence.filter((e) =>
                    d.evidenceIds.includes(e.id)
                  );
                  return (
                    <div
                      key={d.id}
                      className="border border-slate-200 rounded-md p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="font-semibold text-sm text-slate-900">
                          {d.title}
                        </div>
                        <DeliverableStatusLabel
                          status={d.status}
                          discrepancy={d.discrepancyFlag}
                        />
                      </div>

                      {d.discrepancyFlag && d.discrepancyReason && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-900 flex items-start gap-2">
                          <AlertTriangle
                            className="w-4 h-4 text-red-700 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <div>
                            <span className="font-semibold">
                              Verification discrepancy:{' '}
                            </span>
                            {d.discrepancyReason}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500 font-medium">
                            Agent Claimed
                          </div>
                          <div className="text-slate-700 mt-0.5">
                            {d.agentClaim ?? 'No explicit claim logged.'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 font-medium">
                            Actual Verified Reality
                          </div>
                          <div className="text-slate-900 mt-0.5 font-medium">
                            {d.actualReality}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                        <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
                          {d.prNumber && (
                            <span className="inline-flex items-center gap-1">
                              <GitPullRequest className="w-3 h-3" aria-hidden="true" />
                              {d.prNumber}
                            </span>
                          )}
                          {d.branch && <span>{d.branch}</span>}
                          {d.worktreePath && (
                            <span className="truncate max-w-[200px]">
                              {d.worktreePath}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`deliv-status-${d.id}`}
                            className="text-slate-500"
                          >
                            Status:
                          </label>
                          <select
                            id={`deliv-status-${d.id}`}
                            value={d.status}
                            onChange={(e) =>
                              onUpdateDeliverableStatus(
                                d.id,
                                e.target.value as DeliverableStatus
                              )
                            }
                            className="h-7 px-2 text-xs bg-white border border-slate-200 rounded text-slate-800"
                          >
                            {DELIVERABLE_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {linkedEvidence.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            Traceable Evidence
                          </div>
                          {linkedEvidence.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-start justify-between gap-2 text-xs bg-slate-50 px-2.5 py-2 rounded"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800 flex items-center gap-1.5">
                                  <FileCode2
                                    className="w-3.5 h-3.5 text-slate-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{ev.title}</span>
                                </div>
                                <div className="text-slate-600 mt-0.5">
                                  {ev.summary}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500 mt-0.5 truncate">
                                  {ev.reference}
                                </div>
                              </div>
                              <span
                                className={`text-[11px] font-medium shrink-0 ${
                                  ev.verified
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {ev.verified ? 'Confirmed' : 'Unverified'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: Linked Sessions & Wispr */}
          {activeTab === 'sessions' && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Agent Sessions ({projectSessions.length})
                </h3>
                {projectSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onInspect({ type: 'session', id: s.id })}
                    className="w-full text-left p-3 border border-slate-200 rounded-md hover:border-blue-300 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                        {s.host} · {s.agent}
                      </span>
                      <span className="tabular-nums">
                        {formatShortDateTime(s.endedAt)}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      {s.title}
                    </div>
                    <div className="text-xs text-slate-600">{s.whatHappened}</div>
                    <div className="text-[11px] text-amber-800">
                      Remains: {s.whatRemains}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Matched Wispr Dictations ({projectWispr.length})
                </h3>
                {projectWispr.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No Wispr Flow dictations attributed to this project yet.
                  </p>
                ) : (
                  projectWispr.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onInspect({ type: 'wispr', id: w.id })}
                      className="w-full text-left p-3 border border-slate-200 rounded-md hover:border-blue-300 transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs font-mono text-blue-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                          {w.capturedOnHost}
                          {w.targetHost ? ` -> ${w.targetHost}` : ''}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {formatShortDateTime(w.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 italic">
                        &ldquo;{w.transcript}&rdquo;
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Continuation Packet */}
          {activeTab === 'packet' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-600">
                  Paste directly into Claude Code, Codex, Droid, or OMP to resume this workstream with complete history, constraints, and verified deliverable state.
                </p>
                <button
                  type="button"
                  onClick={handleCopyPacket}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy Packet</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 bg-slate-950 text-slate-100 rounded-md text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {packetText || 'Select a project to generate a continuation packet.'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
