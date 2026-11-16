'use client';

import { useState } from 'react';
import { AlertTriangle, GitBranch, Laptop, Mic, Server } from 'lucide-react';
import { computeProjectMetrics } from '@/lib/threadle-engine';
import type {
  HostId,
  InspectionTarget,
  ProjectSummary,
  ThreadleCorpus,
} from '@/lib/types';

interface MapViewProps {
  corpus: ThreadleCorpus;
  filteredProjects: ProjectSummary[];
  onInspect: (target: InspectionTarget) => void;
}

export function MapView({ corpus, filteredProjects, onInspect }: MapViewProps) {
  const [selectedHost, setSelectedHost] = useState<HostId | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    filteredProjects[0]?.id ?? null
  );

  const hosts = corpus.hostCollectors;
  const crossHostWispr = corpus.wisprDictations.filter(
    (w) => w.attributionStatus === 'cross_host_matched'
  );
  const unmatchedWispr = corpus.wisprDictations.filter(
    (w) => w.attributionStatus === 'unmatched' || w.attributionStatus === 'ambiguous'
  );

  // Map layout coordinates for clean SVG topology connecting Hosts <-> Projects <-> Repos
  const hostCoords = hosts.map((h, idx) => ({
    host: h.host,
    x: 110,
    y: 54 + idx * 66,
  }));
  const projectCoords = filteredProjects.map((p, idx) => ({
    project: p,
    x: 470,
    y: 66 + idx * 78,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-950">
            Cross-Host Topology &amp; Attribution Map
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Click any host or project to highlight cross-machine sessions, shared-repo splits, and Wispr Flow dictations targeting remote agents.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-slate-300 inline-block" />
            <span>Session link</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-blue-600 inline-block" />
            <span>Cross-host Wispr</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-red-500 inline-block" />
            <span>Unverified gap</span>
          </span>
        </div>
      </div>

      {/* Interactive Topology Canvas */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          <div className="overflow-x-auto">
            <div className="min-w-[720px] relative">
              <svg
                viewBox="0 0 820 440"
                className="w-full h-[430px] select-none"
                role="img"
                aria-label="Topology graph connecting hosts, Wispr dictations, projects, and repositories"
              >
                {/* Column headings */}
                <text x="15" y="22" className="fill-slate-500 text-[11px] font-semibold">
                  HOSTS &amp; WISPR SOURCES
                </text>
                <text x="365" y="22" className="fill-slate-500 text-[11px] font-semibold">
                  PROJECTS (BY INTENT)
                </text>
                <text x="675" y="22" className="fill-slate-500 text-[11px] font-semibold">
                  DELIVERABLES
                </text>

                {/* Edges: Host -> Project */}
                {hostCoords.map((hc) =>
                  projectCoords.map((pc) => {
                    const metrics = computeProjectMetrics(pc.project, corpus);
                    const connected = metrics.hosts.includes(hc.host);
                    if (!connected) return null;

                    const hasCrossWispr = crossHostWispr.some(
                      (w) =>
                        w.matchedProjectId === pc.project.id &&
                        (w.capturedOnHost === hc.host || w.targetHost === hc.host)
                    );
                    const isHighlighted =
                      selectedHost === hc.host || selectedProjectId === pc.project.id;

                    const pathD = `M ${hc.x + 95} ${hc.y} C ${hc.x + 210} ${hc.y}, ${pc.x - 160} ${pc.y}, ${pc.x - 105} ${pc.y}`;

                    return (
                      <path
                        key={`${hc.host}-${pc.project.id}`}
                        d={pathD}
                        fill="none"
                        stroke={
                          hasCrossWispr
                            ? '#2563EB'
                            : isHighlighted
                              ? '#334155'
                              : '#CBD5E1'
                        }
                        strokeWidth={isHighlighted ? 2 : 1.25}
                        strokeDasharray={hasCrossWispr ? '5 4' : undefined}
                        opacity={
                          selectedHost || selectedProjectId
                            ? isHighlighted
                              ? 0.95
                              : 0.2
                            : 0.75
                        }
                      />
                    );
                  })
                )}

                {/* Edges: Project -> Deliverable summary */}
                {projectCoords.map((pc) => {
                  const metrics = computeProjectMetrics(pc.project, corpus);
                  const hasGap = metrics.discrepancyCount > 0;
                  const isHighlighted = selectedProjectId === pc.project.id;
                  return (
                    <g key={`deliv-edge-${pc.project.id}`}>
                      <path
                        d={`M ${pc.x + 125} ${pc.y} L 675 ${pc.y}`}
                        fill="none"
                        stroke={hasGap ? '#DC2626' : '#16A34A'}
                        strokeWidth={isHighlighted ? 2 : 1.5}
                        opacity={
                          selectedProjectId && !isHighlighted ? 0.25 : 0.85
                        }
                      />
                      <rect
                        x="675"
                        y={pc.y - 18}
                        width="135"
                        height="36"
                        rx="6"
                        className={
                          hasGap
                            ? 'fill-red-50 stroke-red-200'
                            : 'fill-emerald-50 stroke-emerald-200'
                        }
                        strokeWidth="1"
                      />
                      <text
                        x="686"
                        y={pc.y - 2}
                        className={`text-[11px] font-medium ${
                          hasGap ? 'fill-red-900' : 'fill-emerald-900'
                        }`}
                      >
                        {metrics.verifiedCount}/{metrics.deliverableCount} verified
                      </text>
                      <text
                        x="686"
                        y={pc.y + 12}
                        className="fill-slate-500 text-[10px]"
                      >
                        {metrics.discrepancyCount > 0
                          ? `${metrics.discrepancyCount} claim mismatch`
                          : `${metrics.openDeliverableCount} open`}
                      </text>
                    </g>
                  );
                })}

                {/* Host Nodes */}
                {hostCoords.map((hc) => {
                  const collector = hosts.find((h) => h.host === hc.host)!;
                  const active = selectedHost === hc.host;
                  return (
                    <g
                      key={hc.host}
                      onClick={() =>
                        setSelectedHost((prev) =>
                          prev === hc.host ? null : hc.host
                        )
                      }
                      className="cursor-pointer"
                    >
                      <rect
                        x={hc.x - 95}
                        y={hc.y - 22}
                        width="190"
                        height="44"
                        rx="6"
                        className={
                          active
                            ? 'fill-blue-50 stroke-blue-600'
                            : 'fill-white stroke-slate-200 hover:stroke-slate-400'
                        }
                        strokeWidth={active ? 1.75 : 1}
                      />
                      <text
                        x={hc.x - 82}
                        y={hc.y - 3}
                        className="fill-slate-900 text-[12px] font-semibold"
                      >
                        {hc.host}
                      </text>
                      <text
                        x={hc.x - 82}
                        y={hc.y + 13}
                        className="fill-slate-500 text-[10px]"
                      >
                        {collector.sessionsIndexed} sessions
                        {collector.wisprRecords > 0
                          ? ` · ${collector.wisprRecords} Wispr`
                          : ''}
                      </text>
                    </g>
                  );
                })}

                {/* Project Nodes */}
                {projectCoords.map((pc) => {
                  const active = selectedProjectId === pc.project.id;
                  return (
                    <g
                      key={pc.project.id}
                      onClick={() => setSelectedProjectId(pc.project.id)}
                      onDoubleClick={() =>
                        onInspect({ type: 'project', id: pc.project.id })
                      }
                      className="cursor-pointer"
                    >
                      <rect
                        x={pc.x - 105}
                        y={pc.y - 24}
                        width="230"
                        height="48"
                        rx="6"
                        className={
                          active
                            ? 'fill-slate-900 stroke-slate-900'
                            : 'fill-white stroke-slate-300 hover:stroke-slate-500'
                        }
                        strokeWidth="1.25"
                      />
                      <text
                        x={pc.x - 93}
                        y={pc.y - 4}
                        className={`text-[11px] font-semibold ${
                          active ? 'fill-white' : 'fill-slate-900'
                        }`}
                      >
                        {pc.project.name.length > 31
                          ? `${pc.project.name.slice(0, 30)}…`
                          : pc.project.name}
                      </text>
                      <text
                        x={pc.x - 93}
                        y={pc.y + 13}
                        className={`text-[10px] ${
                          active ? 'fill-slate-300' : 'fill-slate-500'
                        }`}
                      >
                        {pc.project.repos[0].replace('github.com/pmaclyman/', '')}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right Side Panel: Selected Context & Unmatched Wispr Bucket */}
          <div className="border-t xl:border-t-0 xl:border-l border-slate-200 pt-5 xl:pt-0 xl:pl-6 space-y-5">
            <div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Cross-Host Wispr Links
              </h2>
              <div className="mt-2 divide-y divide-slate-100">
                {crossHostWispr.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onInspect({ type: 'wispr', id: w.id })}
                    className="w-full text-left py-2.5 px-1 hover:bg-slate-50 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-blue-700">
                      <span className="inline-flex items-center gap-1">
                        <Laptop className="w-3 h-3" aria-hidden="true" />
                        {w.capturedOnHost}
                      </span>
                      <span>→</span>
                      <span className="inline-flex items-center gap-1">
                        <Server className="w-3 h-3" aria-hidden="true" />
                        {w.targetHost}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700 line-clamp-2">
                      &ldquo;{w.transcript}&rdquo;
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Unmatched &amp; Ambiguous Notes
                </h2>
                <span className="text-xs font-mono text-amber-800 tabular-nums">
                  {unmatchedWispr.length}
                </span>
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {unmatchedWispr.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onInspect({ type: 'wispr', id: w.id })}
                    className="w-full text-left py-2.5 px-1.5 bg-amber-50/40 hover:bg-amber-50 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-900 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Mic className="w-3 h-3" aria-hidden="true" />
                        {w.capturedOnHost}
                      </span>
                      <span className="capitalize">{w.attributionStatus}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700 line-clamp-2">
                      &ldquo;{w.transcript}&rdquo;
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedProjectId && (
              <div className="pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    onInspect({ type: 'project', id: selectedProjectId })
                  }
                  className="w-full px-3 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Selected Project Inspector</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Host Collector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {hosts.map((h) => (
          <div
            key={h.host}
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-slate-900">
                {h.host}
              </span>
              {h.host === 'Blood Arrow' ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sync stale</span>
                </span>
              ) : (
                <span className="text-xs font-medium text-emerald-700">
                  Audit current
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">{h.role}</p>
            <div className="pt-1 font-mono text-[11px] text-slate-500 flex flex-wrap gap-x-2">
              <span className="tabular-nums">{h.sessionsIndexed} sessions</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{h.wisprRecords} Wispr</span>
              <span aria-hidden="true">·</span>
              <span>{h.agentsDetected.join(', ')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
