'use client';

import { useState } from 'react';
import { ArrowRight, Check, Copy } from 'lucide-react';
import {
  buildContinuationPacket,
  computeProjectMetrics,
  formatRelativeDate,
} from '@/lib/threadle-engine';
import type {
  InspectionTarget,
  ProjectSummary,
  ThreadleCorpus,
} from '@/lib/types';
import { DeliverableStatusLabel, ProjectHealthLabel } from './StatusText';

interface ProjectsViewProps {
  corpus: ThreadleCorpus;
  filteredProjects: ProjectSummary[];
  onInspect: (target: InspectionTarget) => void;
}

export function ProjectsView({
  corpus,
  filteredProjects,
  onInspect,
}: ProjectsViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPacket = async (project: ProjectSummary) => {
    const packet = buildContinuationPacket(
      project,
      corpus.tasks.filter((t) => t.projectId === project.id),
      corpus.deliverables.filter((d) => d.projectId === project.id),
      corpus.sessions.filter((s) => s.projectId === project.id),
      corpus.intentions,
      corpus.wisprDictations.filter((w) => w.matchedProjectId === project.id)
    );
    await navigator.clipboard?.writeText(packet);
    setCopiedId(project.id);
    setTimeout(() => setCopiedId((prev) => (prev === project.id ? null : prev)), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-950">
            Recognized Projects &amp; Workstreams
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Automatically clustered across hosts, agents, branches, and Wispr dictations—preserving distinct tasks inside shared repositories.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 tabular-nums">
          {filteredProjects.length} active workstreams
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-medium text-slate-900">
            No projects match the selected filters
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Reset filters above to view all discovered projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredProjects.map((project) => {
            const metrics = computeProjectMetrics(project, corpus);
            const deliverables = corpus.deliverables.filter(
              (d) => d.projectId === project.id
            );
            const isCopied = copiedId === project.id;

            return (
              <article
                key={project.id}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {project.workstreamCategory}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-600">
                        {project.repos.join(', ')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        Last active {formatRelativeDate(project.lastActivityAt)}
                      </span>
                    </div>

                    <h2 className="font-display text-base font-semibold text-slate-950">
                      <button
                        type="button"
                        onClick={() =>
                          onInspect({ type: 'project', id: project.id })
                        }
                        className="text-left hover:text-blue-700 transition-colors"
                      >
                        {project.name}
                      </button>
                    </h2>

                    <p className="text-sm text-slate-700 leading-relaxed max-w-4xl">
                      {project.currentState}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyPacket(project)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span>Packet copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Continuation packet</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onInspect({ type: 'project', id: project.id })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <span>Inspect &amp; verify</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Single-level horizontal divider & verification summary */}
                <div className="pt-4 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 space-y-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Latest Objective &amp; Provenance
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {project.latestObjective}
                    </p>
                    <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      <ProjectHealthLabel health={project.healthStatus} />
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {metrics.sessionCount} sessions
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {metrics.wisprCount} Wispr notes
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]">
                        {metrics.hosts.join(' / ')}
                      </span>
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">
                        Deliverables Verification ({metrics.verifiedCount}/
                        {metrics.deliverableCount} verified)
                      </span>
                      {metrics.forgottenCount > 0 && (
                        <span className="text-amber-800 font-medium tabular-nums">
                          {metrics.forgottenCount} forgotten task
                          {metrics.forgottenCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                      {deliverables.map((d) => (
                        <div
                          key={d.id}
                          className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onInspect({ type: 'task', id: d.taskId })
                            }
                            className="text-left font-medium text-slate-800 hover:text-blue-700 truncate"
                          >
                            {d.title}
                          </button>
                          <div className="flex items-center gap-3 shrink-0">
                            {d.prNumber && (
                              <span className="font-mono text-[11px] text-slate-500">
                                {d.prNumber}
                              </span>
                            )}
                            <DeliverableStatusLabel
                              status={d.status}
                              discrepancy={d.discrepancyFlag}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
