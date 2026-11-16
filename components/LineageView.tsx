'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitCommit,
  XCircle,
} from 'lucide-react';
import { formatShortDateTime } from '@/lib/threadle-engine';
import type {
  InspectionTarget,
  LineageNode,
  ProjectSummary,
  ThreadleCorpus,
} from '@/lib/types';

interface LineageViewProps {
  corpus: ThreadleCorpus;
  filteredProjects: ProjectSummary[];
  onInspect: (target: InspectionTarget) => void;
}

const KIND_LABELS: Record<LineageNode['kind'], string> = {
  request: 'Initial Request',
  decision: 'Decision / Constraint',
  pivot: 'Direction Pivot',
  rejected: 'Rejected Approach',
  worktree: 'Branch / Worktree',
  deliverable: 'Deliverable',
  open_thread: 'Open Thread',
};

export function LineageView({
  corpus,
  filteredProjects,
  onInspect,
}: LineageViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    filteredProjects[0]?.id ?? corpus.projects[0]?.id ?? ''
  );

  const activeProject =
    filteredProjects.find((p) => p.id === selectedProjectId) ??
    filteredProjects[0] ??
    corpus.projects[0];

  const nodes = activeProject
    ? corpus.lineageNodes
        .filter((n) => n.projectId === activeProject.id)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-950">
            Decision &amp; Requirement Lineage
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Trace how initial requests evolved through rejected approaches, worktree splits, PRs, and unresolved branches.
          </p>
        </div>

        {activeProject && (
          <button
            type="button"
            onClick={() => onInspect({ type: 'project', id: activeProject.id })}
            className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Inspect Full Project Evidence
          </button>
        )}
      </div>

      {/* Project Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {filteredProjects.map((p) => {
          const active = activeProject?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProjectId(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {!activeProject ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-600">
          No projects match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Chronological Decision Lineage Chain */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="space-y-0">
              {nodes.map((node, index) => {
                const isLast = index === nodes.length - 1;
                const parentNode = node.parentId
                  ? nodes.find((n) => n.id === node.parentId)
                  : null;

                return (
                  <div key={node.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* Vertical connector line */}
                    {!isLast && (
                      <div
                        aria-hidden="true"
                        className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200"
                      />
                    )}

                    {/* Node status marker */}
                    <div className="relative z-10 mt-0.5 shrink-0 w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center">
                      {node.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      ) : node.status === 'rejected' ? (
                        <XCircle className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      ) : node.status === 'unverified' || node.status === 'abandoned' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
                      ) : (
                        <GitCommit className="w-4 h-4 text-blue-600" aria-hidden="true" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {KIND_LABELS[node.kind]}
                          </span>
                          {node.host && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{node.host}</span>
                            </>
                          )}
                          {node.agent && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{node.agent}</span>
                            </>
                          )}
                        </div>
                        <span className="font-mono text-[11px] tabular-nums">
                          {formatShortDateTime(node.timestamp)}
                        </span>
                      </div>

                      <h3 className="mt-1 text-sm font-semibold text-slate-900">
                        {node.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {node.detail}
                      </p>

                      {parentNode && (
                        <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3" aria-hidden="true" />
                          <span>Evolved from: {parentNode.title}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Constraints & Open Questions Sidebar */}
          <aside className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Active Constraints
              </h2>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-700">
                {activeProject.constraints.map((c, i) => (
                  <li
                    key={i}
                    className="pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0 leading-relaxed"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Unresolved Questions
              </h2>
              {activeProject.openQuestions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No open questions.</p>
              ) : (
                <ul className="mt-3 divide-y divide-amber-200/60 text-xs text-amber-950">
                  {activeProject.openQuestions.map((q, i) => (
                    <li
                      key={i}
                      className="py-2.5 px-2 bg-amber-50/50 first:rounded-t last:rounded-b leading-relaxed"
                    >
                      {q}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
