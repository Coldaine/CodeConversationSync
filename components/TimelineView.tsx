'use client';

import { useState, type FocusEvent, type MouseEvent } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Mic,
  Monitor,
  Terminal,
} from 'lucide-react';
import {
  REFERENCE_NOW_ISO,
  buildHostSwimlanes,
  computeBarSpan,
  computeDormancyDays,
  computePointPercent,
  computeProjectMetrics,
  computeTimelineBounds,
  formatRelativeDate,
  formatShortDateTime,
} from '@/lib/threadle-engine';
import type {
  Deliverable,
  HostId,
  InspectionTarget,
  ProjectSummary,
  SessionEpisode,
  ThreadleCorpus,
  TimelineZoom,
  WisprDictation,
  WorkTask,
} from '@/lib/types';
import { ProjectHealthLabel, TaskStatusLabel } from './StatusText';

interface TimelineViewProps {
  corpus: ThreadleCorpus;
  filteredProjects: ProjectSummary[];
  hostFilter?: HostId | 'all';
  zoom: TimelineZoom;
  expandedProjects: Record<string, boolean>;
  expandedTasks: Record<string, boolean>;
  onToggleProject: (projectId: string) => void;
  onToggleTask: (taskId: string) => void;
  onInspect: (target: InspectionTarget) => void;
  onJumpToSessionsUnmatched: () => void;
}

type GroupMode = 'project' | 'host';

type HoverPreview = {
  title: string;
  subtitle: string;
  intended: string;
  happened: string;
  remains: string;
  discrepancyNote?: string;
  timestampLabel?: string;
};

type AnchoredHover = {
  preview: HoverPreview;
  left: number;
  top: number;
  placeAbove: boolean;
};

function getSessionBurstClass(ses: SessionEpisode): string {
  if (ses.agentClaimedDone && !ses.verifiedDone) {
    return 'bg-red-600 hover:bg-red-700 border-red-800/40';
  }
  if (ses.status === 'running') {
    return 'bg-blue-600 hover:bg-blue-700 border-blue-800/40';
  }
  if (ses.verifiedDone) {
    return 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800/40';
  }
  if (ses.status === 'abandoned' || ses.status === 'paused') {
    return 'bg-amber-500 hover:bg-amber-600 border-amber-700/40';
  }
  return 'bg-slate-600 hover:bg-slate-700 border-slate-800/30';
}

function getDeliverableMilestoneTime(
  deliv: Deliverable,
  corpus: ThreadleCorpus
): string {
  const firstEvidence = corpus.evidence.find((ev) =>
    deliv.evidenceIds.includes(ev.id)
  );
  return firstEvidence?.timestamp ?? deliv.lastCheckedAt;
}

function formatShortPrLabel(prNumber?: string): string | null {
  if (!prNumber) return null;
  const match = prNumber.match(/#\d+/);
  return match ? `PR ${match[0]}` : prNumber;
}

export function TimelineView({
  corpus,
  filteredProjects,
  hostFilter = 'all',
  zoom,
  expandedProjects,
  expandedTasks,
  onToggleProject,
  onToggleTask,
  onInspect,
  onJumpToSessionsUnmatched,
}: TimelineViewProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>('project');
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({
    SER10: true,
    Icarus: true,
  });
  const [anchoredHover, setAnchoredHover] = useState<AnchoredHover | null>(null);

  const bounds = computeTimelineBounds(zoom);
  const nowPoint = computePointPercent(REFERENCE_NOW_ISO, bounds);

  const forgottenTasks = corpus.tasks.filter((t) => t.isForgotten);
  const discrepancyDeliverables = corpus.deliverables.filter((d) => d.discrepancyFlag);
  const unmatchedWispr = corpus.wisprDictations.filter(
    (w) => w.attributionStatus === 'unmatched' || w.attributionStatus === 'ambiguous'
  );

  const allowedProjectIds = new Set(filteredProjects.map((p) => p.id));
  const hostSwimlanes = buildHostSwimlanes(corpus, allowedProjectIds, hostFilter);

  const showHoverForElement = (
    el: HTMLElement,
    preview: HoverPreview
  ) => {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardWidth = Math.min(370, vw - 24);
    const centerX = (rect.left + rect.right) / 2;
    const left = Math.max(12, Math.min(vw - cardWidth - 12, centerX - cardWidth / 2));
    const placeAbove = rect.bottom + 220 > vh && rect.top > 220;
    const top = placeAbove ? rect.top - 10 : rect.bottom + 10;

    setAnchoredHover({
      preview,
      left,
      top,
      placeAbove,
    });
  };

  const handleMouseAnchor =
    (preview: HoverPreview) => (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      showHoverForElement(e.currentTarget, preview);
    };

  const handleTrackMouseOver =
    (preview: HoverPreview) => (e: MouseEvent<HTMLElement>) => {
      if (e.target === e.currentTarget) {
        showHoverForElement(e.currentTarget, preview);
      }
    };

  const handleFocusAnchor =
    (preview: HoverPreview) => (e: FocusEvent<HTMLElement>) => {
      showHoverForElement(e.currentTarget, preview);
    };

  const handleClearHover = () => {
    setAnchoredHover(null);
  };

  const buildSessionPreview = (ses: SessionEpisode): HoverPreview => ({
    title: ses.title,
    subtitle: `${ses.host} · ${ses.agent} · ${ses.branch}`,
    timestampLabel: `${formatShortDateTime(ses.startedAt)} – ${formatShortDateTime(ses.endedAt)}`,
    intended: ses.userIntent,
    happened: ses.whatHappened,
    remains: ses.whatRemains,
    discrepancyNote:
      ses.agentClaimedDone && !ses.verifiedDone
        ? 'Agent claimed done without verified repo/CI proof'
        : undefined,
  });

  const buildWisprPreview = (w: WisprDictation): HoverPreview => ({
    title: `Wispr Note (${w.capturedOnHost})`,
    subtitle: w.targetHost
      ? `Dictated on ${w.capturedOnHost} -> ${w.targetHost}`
      : `Captured on ${w.capturedOnHost}`,
    timestampLabel: formatShortDateTime(w.timestamp),
    intended: w.extractedIntent,
    happened: `"${w.transcript}"`,
    remains: w.attributionReason,
  });

  const renderGridlinesAndNow = () => (
    <>
      {bounds.ticks.map((tick) => {
        const pct = ((tick.ms - bounds.startMs) / bounds.totalMs) * 100;
        return (
          <div
            key={tick.ms}
            style={{ left: `${pct}%` }}
            className="absolute top-0 bottom-0 w-px bg-slate-100 pointer-events-none"
          />
        );
      })}
      {nowPoint.visible && (
        <div
          aria-hidden="true"
          style={{ left: `${nowPoint.pct}%` }}
          className="absolute top-0 bottom-0 w-px bg-blue-500/60 pointer-events-none z-[2]"
        />
      )}
    </>
  );

  const renderBurstElements = (
    sessions: SessionEpisode[],
    wisprList: WisprDictation[],
    deliverablesList: Deliverable[],
    rowVariant: 'project' | 'task' | 'host',
    isTrackForgottenOrOpen: boolean,
    lastActivityAt: string,
    dormancyDays: number
  ) => {
    const firstSessionStart =
      sessions.length > 0
        ? sessions.reduce(
            (min, s) =>
              new Date(s.startedAt).getTime() < new Date(min).getTime()
                ? s.startedAt
                : min,
            sessions[0].startedAt
          )
        : lastActivityAt;

    const railSpan = computeBarSpan(firstSessionStart, lastActivityAt, bounds);
    const lastPoint = computePointPercent(lastActivityAt, bounds);
    const showDormancyTail =
      isTrackForgottenOrOpen &&
      dormancyDays >= 2 &&
      lastPoint.visible &&
      nowPoint.visible &&
      lastPoint.pct < nowPoint.pct - 2.5;

    const burstHeightClass =
      rowVariant === 'task' ? 'h-4' : 'h-5';

    return (
      <>
        {/* Subtle continuous lifespan thread rail */}
        {railSpan.visible && (
          <div
            aria-hidden="true"
            style={{
              left: `${railSpan.leftPct}%`,
              width: `${railSpan.widthPct}%`,
            }}
            className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-slate-200 pointer-events-none z-[1]"
          />
        )}

        {/* Trailing dashed dormancy tail toward Now */}
        {showDormancyTail && (
          <div
            aria-hidden="true"
            style={{
              left: `${lastPoint.pct}%`,
              width: `${Math.max(0, nowPoint.pct - lastPoint.pct)}%`,
            }}
            className="absolute top-1/2 -translate-y-1/2 border-t border-dashed border-amber-500/80 pointer-events-none z-[1] flex justify-end"
          >
            <span className="-mt-4 mr-1.5 font-mono text-[10px] font-medium text-amber-800 bg-white/90 px-1 rounded-xs tabular-nums whitespace-nowrap">
              {dormancyDays}d cold
            </span>
          </div>
        )}

        {/* Discrete session burst blocks along center execution rail */}
        {sessions.map((ses) => {
          const span = computeBarSpan(ses.startedAt, ses.endedAt, bounds);
          if (!span.visible) return null;
          const preview = buildSessionPreview(ses);
          return (
            <button
              key={ses.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspect({ type: 'session', id: ses.id });
              }}
              onMouseEnter={handleMouseAnchor(preview)}
              onFocus={handleFocusAnchor(preview)}
              style={{
                left: `${span.leftPct}%`,
                width: `${span.widthPct}%`,
              }}
              aria-label={`Session: ${ses.title} (${ses.host}, ${ses.agent})`}
              className={`absolute top-1/2 -translate-y-1/2 ${burstHeightClass} min-w-[7px] rounded-xs border transition-transform hover:scale-y-115 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 z-10 flex items-center overflow-hidden ${getSessionBurstClass(
                ses
              )}`}
            >
              {span.widthPct >= 6 && (
                <span className="px-1 font-mono text-[9px] font-medium text-white/95 truncate leading-none">
                  {ses.agent === 'Claude Code'
                    ? 'CC'
                    : ses.agent === 'Claude Desktop'
                      ? 'CD'
                      : ses.agent}
                </span>
              )}
            </button>
          );
        })}

        {/* PR / Deliverable milestone flags anchored to top band */}
        {deliverablesList.map((deliv) => {
          const label = formatShortPrLabel(deliv.prNumber);
          if (!label) return null;
          const milestoneTs = getDeliverableMilestoneTime(deliv, corpus);
          const pt = computePointPercent(milestoneTs, bounds);
          if (!pt.visible) return null;

          const isVerified = deliv.status === 'verified' || deliv.status === 'merged';
          const isGap = deliv.discrepancyFlag;
          const alignLeft = pt.pct > 84;
          const preview: HoverPreview = {
            title: `${deliv.prNumber}: ${deliv.title}`,
            subtitle: `${deliv.status.toUpperCase()} · ${deliv.branch ?? deliv.repo ?? ''}`,
            timestampLabel: formatShortDateTime(milestoneTs),
            intended: deliv.requestedSummary,
            happened: deliv.actualReality,
            remains: isVerified ? 'Verified delivered' : 'Open / needs verification',
            discrepancyNote: isGap ? deliv.discrepancyReason : undefined,
          };

          return (
            <div
              key={deliv.id}
              style={{ left: `${pt.pct}%` }}
              className="absolute top-0.5 bottom-1/2 -translate-x-1/2 pointer-events-none z-20"
            >
              <span
                aria-hidden="true"
                className={`block mx-auto w-[1.5px] h-full ${
                  isGap
                    ? 'bg-red-500/80'
                    : isVerified
                      ? 'bg-emerald-500/80'
                      : 'bg-slate-400'
                }`}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect({ type: 'task', id: deliv.taskId });
                }}
                onMouseEnter={handleMouseAnchor(preview)}
                onFocus={handleFocusAnchor(preview)}
                aria-label={`Deliverable ${deliv.prNumber}: ${deliv.title}`}
                className={`pointer-events-auto absolute top-0 ${
                  alignLeft ? 'right-1' : 'left-1'
                } font-mono text-[9px] font-semibold leading-none whitespace-nowrap px-1 py-0.5 rounded-xs border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isGap
                    ? 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
                    : isVerified
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            </div>
          );
        })}

        {/* Wispr Dictation diamonds anchored along bottom band */}
        {wisprList.map((w) => {
          const pt = computePointPercent(w.timestamp, bounds);
          if (!pt.visible) return null;
          const preview = buildWisprPreview(w);
          return (
            <div
              key={w.id}
              style={{ left: `${pt.pct}%` }}
              className="absolute top-1/2 bottom-0.5 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center justify-end"
            >
              <span
                aria-hidden="true"
                className="w-px flex-1 bg-blue-400/70"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect({ type: 'wispr', id: w.id });
                }}
                onMouseEnter={handleMouseAnchor(preview)}
                onFocus={handleFocusAnchor(preview)}
                aria-label={`Wispr dictation from ${w.capturedOnHost}`}
                className="pointer-events-auto w-3.5 h-3.5 flex items-center justify-center group focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <span className="w-2 h-2 rotate-45 bg-blue-600 group-hover:bg-blue-700 ring-1 ring-white transition-transform group-hover:scale-125" />
              </button>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Compact Header Strip */}
      <div className="bg-white border border-slate-200 rounded-lg px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-display text-lg font-semibold text-slate-950 text-balance">
            {groupMode === 'project'
              ? 'Project & Workstream Timeline'
              : 'Host & Cross-Machine Activity Timeline'}
          </h1>
          <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              <span className="tabular-nums font-medium text-slate-900">
                {groupMode === 'project'
                  ? filteredProjects.length
                  : hostSwimlanes.length}
              </span>{' '}
              {groupMode === 'project'
                ? filteredProjects.length === 1
                  ? 'project'
                  : 'projects'
                : hostSwimlanes.length === 1
                  ? 'host'
                  : 'hosts'}{' '}
              from{' '}
              <span className="tabular-nums font-medium text-slate-900">
                {corpus.sessions.length}
              </span>{' '}
              discrete sessions &amp;{' '}
              <span className="tabular-nums font-medium text-slate-900">
                {corpus.wisprDictations.length}
              </span>{' '}
              Wispr notes
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-amber-800 font-medium tabular-nums whitespace-nowrap">
              {forgottenTasks.length} forgotten
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-red-700 font-medium tabular-nums whitespace-nowrap">
              {discrepancyDeliverables.length} unverified claims
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Group By Toggle */}
          <div
            role="group"
            aria-label="Timeline grouping"
            className="flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200"
          >
            <button
              type="button"
              aria-pressed={groupMode === 'project'}
              onClick={() => setGroupMode('project')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                groupMode === 'project'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>By Project</span>
            </button>
            <button
              type="button"
              aria-pressed={groupMode === 'host'}
              onClick={() => setGroupMode('host')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                groupMode === 'host'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
              <span>By Host</span>
            </button>
          </div>

          {discrepancyDeliverables.slice(0, 1).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onInspect({ type: 'task', id: d.taskId })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[190px]">
                {d.prNumber ? `${d.prNumber}: ` : ''}
                {d.title}
              </span>
            </button>
          ))}

          {unmatchedWispr.length > 0 && (
            <button
              type="button"
              onClick={onJumpToSessionsUnmatched}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">
                {unmatchedWispr.length} unmatched Wispr
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Aggregated Timeline Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-medium text-slate-900">
            No projects match your current filters
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try clearing your host, agent, or verification gap filter to survey all workstreams.
          </p>
        </div>
      ) : (
        <div
          onMouseLeave={handleClearHover}
          className="bg-white border border-slate-200 rounded-lg overflow-x-auto"
        >
          <div className="min-w-[820px]">
            {/* Timeline Ruler Header */}
            <div className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] border-b border-slate-200 bg-slate-50">
              <div className="px-4 py-2.5 text-xs font-semibold text-slate-700 border-r border-slate-200 flex items-center justify-between">
                <span>
                  {groupMode === 'project'
                    ? 'Projects / Tasks / Bursts'
                    : 'Hosts / Machines / Bursts'}
                </span>
                <span className="font-mono text-[11px] font-normal text-slate-500 uppercase tracking-wider">
                  {zoom}
                </span>
              </div>
              <div className="relative h-9 select-none">
                {bounds.ticks.map((tick) => {
                  const pct = ((tick.ms - bounds.startMs) / bounds.totalMs) * 100;
                  if (pct < 2 || pct > 94) return null;
                  return (
                    <div
                      key={tick.ms}
                      style={{ left: `${pct}%` }}
                      className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col justify-center items-center"
                    >
                      <span className="font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                        {tick.label}
                      </span>
                      {tick.sublabel && (
                        <span className="font-mono text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                          {tick.sublabel}
                        </span>
                      )}
                    </div>
                  );
                })}
                {nowPoint.visible && (
                  <div
                    style={{ left: `${nowPoint.pct}%` }}
                    className="absolute top-0 bottom-0 -translate-x-full pr-1.5 flex items-center pointer-events-none"
                  >
                    <span className="font-mono text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-xs whitespace-nowrap">
                      Now
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* PROJECT GROUPING MODE */}
            {groupMode === 'project' ? (
              <div className="divide-y divide-slate-200">
                {filteredProjects.map((project) => {
                  const isExpanded = !!expandedProjects[project.id];
                  const metrics = computeProjectMetrics(project, corpus);
                  const projectTasks = corpus.tasks.filter(
                    (t) => t.projectId === project.id
                  );
                  const projectDeliverables = corpus.deliverables.filter(
                    (d) => d.projectId === project.id
                  );
                  const projectSessions = corpus.sessions.filter(
                    (s) => s.projectId === project.id
                  );
                  const projectWispr = corpus.wisprDictations.filter(
                    (w) => w.matchedProjectId === project.id
                  );
                  const hasDiscrepancy = metrics.discrepancyCount > 0;
                  const dormancyDays = computeDormancyDays(project.lastActivityAt);
                  const isRiskOrUnfinished =
                    metrics.openDeliverableCount > 0 || metrics.forgottenCount > 0;

                  const projectPreview: HoverPreview = {
                    title: project.name,
                    subtitle: `${project.workstreamCategory} · ${metrics.hosts.join(', ')}`,
                    timestampLabel: `${metrics.sessionCount} sessions · Last activity ${formatRelativeDate(
                      project.lastActivityAt
                    )}`,
                    intended: project.latestObjective,
                    happened: project.currentState,
                    remains:
                      project.openQuestions[0] ||
                      `${metrics.openDeliverableCount} open deliverables`,
                    discrepancyNote: hasDiscrepancy
                      ? `${metrics.discrepancyCount} agent claim discrepancy detected`
                      : undefined,
                  };

                  return (
                    <div key={project.id}>
                      {/* Project Row */}
                      <div className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-slate-50/80 transition-colors">
                        <div className="px-3 py-3 border-r border-slate-200 flex items-start gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => onToggleProject(project.id)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
                            className="mt-0.5 p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-200/60 shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onInspect({ type: 'project', id: project.id })
                            }
                            onMouseEnter={handleMouseAnchor(projectPreview)}
                            onFocus={handleFocusAnchor(projectPreview)}
                            className="text-left min-w-0 flex-1 group focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
                          >
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                              {project.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                              <ProjectHealthLabel health={project.healthStatus} />
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {metrics.sessionCount}{' '}
                                {metrics.sessionCount === 1 ? 'session' : 'sessions'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {metrics.verifiedCount}/{metrics.deliverableCount}{' '}
                                verified
                              </span>
                            </div>
                          </button>
                        </div>

                        {/* Project Activity Rhythm Track */}
                        <div
                          onClick={() =>
                            onInspect({ type: 'project', id: project.id })
                          }
                          onMouseOver={handleTrackMouseOver(projectPreview)}
                          className="relative min-h-[60px] cursor-pointer"
                        >
                          {renderGridlinesAndNow()}
                          {renderBurstElements(
                            projectSessions,
                            projectWispr,
                            projectDeliverables,
                            'project',
                            isRiskOrUnfinished,
                            project.lastActivityAt,
                            dormancyDays
                          )}
                        </div>
                      </div>

                      {/* Expanded Workstream Tasks */}
                      {isExpanded && (
                        <div className="bg-slate-50/50 divide-y divide-slate-200/80 border-t border-slate-200">
                          {projectTasks.map((task: WorkTask) => {
                            const isTaskExpanded = !!expandedTasks[task.id];
                            const taskSessions = corpus.sessions.filter(
                              (s) => s.taskId === task.id
                            );
                            const taskWispr = corpus.wisprDictations.filter((w) =>
                              taskSessions.some((s) => s.id === w.matchedSessionId)
                            );
                            const taskDelivs = projectDeliverables.filter(
                              (d) => d.taskId === task.id
                            );
                            const primaryDeliv = taskDelivs[0];
                            const taskDormancy = computeDormancyDays(
                              task.lastActivityAt
                            );
                            const isTaskOpen =
                              task.status !== 'verified' || task.isForgotten;

                            const taskPreview: HoverPreview = {
                              title: task.title,
                              subtitle: `${task.workstreamName} · ${task.branches.join(', ')}`,
                              timestampLabel: `${taskSessions.length} ${
                                taskSessions.length === 1 ? 'session' : 'sessions'
                              } · Last active ${formatRelativeDate(task.lastActivityAt)}`,
                              intended: task.objective,
                              happened:
                                primaryDeliv?.actualReality ??
                                `${taskSessions.length} sessions across ${task.hosts.join(', ')}`,
                              remains: task.nextAction,
                              discrepancyNote: primaryDeliv?.discrepancyFlag
                                ? primaryDeliv.discrepancyReason
                                : undefined,
                            };

                            return (
                              <div key={task.id}>
                                <div className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-slate-100/70 transition-colors">
                                  <div className="pl-8 pr-3 py-2.5 border-r border-slate-200 flex items-start gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => onToggleTask(task.id)}
                                      aria-expanded={isTaskExpanded}
                                      aria-label={`${
                                        isTaskExpanded ? 'Collapse' : 'Expand'
                                      } task ${task.title}`}
                                      className="mt-0.5 p-0.5 text-slate-400 hover:text-slate-900 rounded shrink-0"
                                    >
                                      {isTaskExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onInspect({ type: 'task', id: task.id })
                                      }
                                      onMouseEnter={handleMouseAnchor(taskPreview)}
                                      onFocus={handleFocusAnchor(taskPreview)}
                                      className="text-left min-w-0 flex-1 group"
                                    >
                                      <div className="text-xs font-medium text-slate-900 group-hover:text-blue-700 truncate">
                                        {task.title}
                                      </div>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                                        <TaskStatusLabel status={task.status} />
                                        {task.isForgotten && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="text-amber-800 font-medium">
                                              Forgotten
                                            </span>
                                          </>
                                        )}
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono truncate max-w-[140px]">
                                          {task.branches[0]}
                                        </span>
                                      </div>
                                    </button>
                                  </div>

                                  <div
                                    onClick={() =>
                                      onInspect({ type: 'task', id: task.id })
                                    }
                                    onMouseOver={handleTrackMouseOver(taskPreview)}
                                    className="relative min-h-[48px] cursor-pointer"
                                  >
                                    {renderGridlinesAndNow()}
                                    {renderBurstElements(
                                      taskSessions,
                                      taskWispr,
                                      taskDelivs,
                                      'task',
                                      isTaskOpen,
                                      task.lastActivityAt,
                                      taskDormancy
                                    )}
                                  </div>
                                </div>

                                {/* Expanded Individual Sessions & Wispr Notes */}
                                {isTaskExpanded && (
                                  <div className="bg-white divide-y divide-slate-100 border-t border-slate-200/70">
                                    {taskSessions.map((ses: SessionEpisode) => {
                                      const sesSpan = computeBarSpan(
                                        ses.startedAt,
                                        ses.endedAt,
                                        bounds
                                      );
                                      const sesPreview = buildSessionPreview(ses);
                                      return (
                                        <div
                                          key={ses.id}
                                          className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-slate-50"
                                          onMouseEnter={handleMouseAnchor(
                                            sesPreview
                                          )}
                                        >
                                          <div className="pl-14 pr-3 py-2 border-r border-slate-200 min-w-0">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onInspect({
                                                  type: 'session',
                                                  id: ses.id,
                                                })
                                              }
                                              onFocus={handleFocusAnchor(
                                                sesPreview
                                              )}
                                              className="text-left w-full group"
                                            >
                                              <div className="flex items-center gap-1.5 text-xs text-slate-800 group-hover:text-blue-700">
                                                <Terminal
                                                  className="w-3.5 h-3.5 text-slate-400 shrink-0"
                                                  aria-hidden="true"
                                                />
                                                <span className="truncate font-medium">
                                                  {ses.title}
                                                </span>
                                              </div>
                                              <div className="mt-0.5 pl-5 font-mono text-[11px] text-slate-500 truncate">
                                                {ses.host} · {ses.agent} ·{' '}
                                                {formatShortDateTime(
                                                  ses.startedAt
                                                )}
                                              </div>
                                            </button>
                                          </div>

                                          <div className="relative min-h-[38px]">
                                            {renderGridlinesAndNow()}
                                            {sesSpan.visible && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onInspect({
                                                    type: 'session',
                                                    id: ses.id,
                                                  })
                                                }
                                                onFocus={handleFocusAnchor(
                                                  sesPreview
                                                )}
                                                style={{
                                                  left: `${sesSpan.leftPct}%`,
                                                  width: `${sesSpan.widthPct}%`,
                                                }}
                                                aria-label={`Inspect session ${ses.title}`}
                                                className={`absolute top-1/2 -translate-y-1/2 h-4 min-w-[7px] rounded-xs border text-white px-1.5 flex items-center text-[10px] font-mono truncate transition-colors z-10 ${getSessionBurstClass(
                                                  ses
                                                )}`}
                                              >
                                                {sesSpan.widthPct >= 6 && (
                                                  <span className="truncate">
                                                    {ses.agent}
                                                  </span>
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {taskWispr.map((w: WisprDictation) => {
                                      const pt = computePointPercent(
                                        w.timestamp,
                                        bounds
                                      );
                                      const wPreview = buildWisprPreview(w);
                                      return (
                                        <div
                                          key={w.id}
                                          className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-slate-50"
                                          onMouseEnter={handleMouseAnchor(
                                            wPreview
                                          )}
                                        >
                                          <div className="pl-14 pr-3 py-2 border-r border-slate-200 min-w-0">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onInspect({
                                                  type: 'wispr',
                                                  id: w.id,
                                                })
                                              }
                                              onFocus={handleFocusAnchor(wPreview)}
                                              className="text-left w-full group"
                                            >
                                              <div className="flex items-center gap-1.5 text-xs text-slate-800 group-hover:text-blue-700">
                                                <Mic
                                                  className="w-3.5 h-3.5 text-blue-600 shrink-0"
                                                  aria-hidden="true"
                                                />
                                                <span className="truncate italic">
                                                  &ldquo;{w.transcript}&rdquo;
                                                </span>
                                              </div>
                                              <div className="mt-0.5 pl-5 font-mono text-[11px] text-slate-500 truncate">
                                                {w.capturedOnHost}
                                                {w.targetHost
                                                  ? ` -> ${w.targetHost}`
                                                  : ''}{' '}
                                                · {formatShortDateTime(w.timestamp)}
                                              </div>
                                            </button>
                                          </div>

                                          <div className="relative min-h-[36px]">
                                            {renderGridlinesAndNow()}
                                            {pt.visible && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  onInspect({
                                                    type: 'wispr',
                                                    id: w.id,
                                                  })
                                                }
                                                onFocus={handleFocusAnchor(
                                                  wPreview
                                                )}
                                                style={{ left: `${pt.pct}%` }}
                                                aria-label={`Inspect Wispr dictation from ${w.capturedOnHost}`}
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center z-20"
                                              >
                                                <span className="w-3 h-3 rotate-45 bg-blue-600 hover:bg-blue-700 ring-2 ring-white" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* HOST GROUPING MODE */
              <div className="divide-y divide-slate-200">
                {hostSwimlanes.map((lane) => {
                  const hostName = lane.collector.host;
                  const isHostExpanded = !!expandedHosts[hostName];
                  const lastIso =
                    lane.sessions.length > 0
                      ? lane.sessions[lane.sessions.length - 1].endedAt
                      : lane.collector.lastAuditSync;

                  const hostPreview: HoverPreview = {
                    title: `${hostName} — ${lane.collector.role}`,
                    subtitle: `${lane.sessions.length} visible sessions · ${lane.wispr.length} Wispr links · ${lane.collector.agentsDetected.join(', ')}`,
                    timestampLabel: `Last sync ${formatShortDateTime(
                      lane.collector.lastAuditSync
                    )}`,
                    intended: `Agents detected: ${lane.collector.agentsDetected.join(', ')}`,
                    happened:
                      lane.sessions.length > 0
                        ? `Latest episode: ${
                            lane.sessions[lane.sessions.length - 1].title
                          }`
                        : 'No matching sessions in active filters.',
                    remains:
                      lane.dormancyDays >= 4
                        ? `Silent for ${lane.dormancyDays} days — check collector or local unpushed worktrees.`
                        : lane.runningCount > 0
                          ? `${lane.runningCount} active session running now`
                          : 'Collector synced cleanly.',
                    discrepancyNote:
                      lane.discrepancyCount > 0
                        ? `${lane.discrepancyCount} unverified agent claim on this host`
                        : undefined,
                  };

                  return (
                    <div key={hostName}>
                      <div className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-slate-50/80 transition-colors">
                        <div className="px-3 py-3 border-r border-slate-200 flex items-start gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedHosts((prev) => ({
                                ...prev,
                                [hostName]: !prev[hostName],
                              }))
                            }
                            aria-expanded={isHostExpanded}
                            aria-label={`${
                              isHostExpanded ? 'Collapse' : 'Expand'
                            } host ${hostName}`}
                            className="mt-0.5 p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-200/60 shrink-0"
                          >
                            {isHostExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div
                            onMouseEnter={handleMouseAnchor(hostPreview)}
                            className="min-w-0 flex-1"
                          >
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {hostName}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500 truncate">
                              {lane.collector.role}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 tabular-nums">
                              <span>
                                {lane.sessions.length}{' '}
                                {lane.sessions.length === 1
                                  ? 'session'
                                  : 'sessions'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{lane.wispr.length} Wispr</span>
                              {lane.discrepancyCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-red-700 font-medium">
                                    {lane.discrepancyCount} unverified
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div
                          onMouseOver={handleTrackMouseOver(hostPreview)}
                          className="relative min-h-[60px]"
                        >
                          {renderGridlinesAndNow()}
                          {renderBurstElements(
                            lane.sessions,
                            lane.wispr,
                            [],
                            'host',
                            lane.dormancyDays >= 3 || lane.discrepancyCount > 0,
                            lastIso,
                            lane.dormancyDays
                          )}
                        </div>
                      </div>

                      {isHostExpanded && (
                        <div className="bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-200">
                          {lane.sessions.map((ses) => {
                            const span = computeBarSpan(
                              ses.startedAt,
                              ses.endedAt,
                              bounds
                            );
                            const sesPreview = buildSessionPreview(ses);
                            const project = corpus.projects.find(
                              (p) => p.id === ses.projectId
                            );
                            return (
                              <div
                                key={ses.id}
                                className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-white"
                                onMouseEnter={handleMouseAnchor(sesPreview)}
                              >
                                <div className="pl-10 pr-3 py-2 border-r border-slate-200 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onInspect({ type: 'session', id: ses.id })
                                    }
                                    onFocus={handleFocusAnchor(sesPreview)}
                                    className="text-left w-full group"
                                  >
                                    <div className="text-xs font-medium text-slate-800 group-hover:text-blue-700 truncate">
                                      {ses.title}
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] text-slate-500 truncate">
                                      {ses.agent} · {project?.name ?? 'Unassigned'}{' '}
                                      · {formatShortDateTime(ses.startedAt)}
                                    </div>
                                  </button>
                                </div>
                                <div className="relative min-h-[38px]">
                                  {renderGridlinesAndNow()}
                                  {span.visible && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onInspect({ type: 'session', id: ses.id })
                                      }
                                      onFocus={handleFocusAnchor(sesPreview)}
                                      style={{
                                        left: `${span.leftPct}%`,
                                        width: `${span.widthPct}%`,
                                      }}
                                      aria-label={`Inspect session ${ses.title}`}
                                      className={`absolute top-1/2 -translate-y-1/2 h-4 min-w-[7px] rounded-xs border text-white px-1.5 flex items-center text-[10px] font-mono truncate z-10 ${getSessionBurstClass(
                                        ses
                                      )}`}
                                    >
                                      {span.widthPct >= 6 && (
                                        <span className="truncate">
                                          {ses.agent}
                                        </span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {lane.wispr.map((w) => {
                            const pt = computePointPercent(w.timestamp, bounds);
                            const wPreview = buildWisprPreview(w);
                            return (
                              <div
                                key={`${hostName}-${w.id}`}
                                className="grid grid-cols-[280px_1fr] md:grid-cols-[340px_1fr] lg:grid-cols-[390px_1fr] hover:bg-white"
                                onMouseEnter={handleMouseAnchor(wPreview)}
                              >
                                <div className="pl-10 pr-3 py-2 border-r border-slate-200 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onInspect({ type: 'wispr', id: w.id })
                                    }
                                    onFocus={handleFocusAnchor(wPreview)}
                                    className="text-left w-full group"
                                  >
                                    <div className="flex items-center gap-1.5 text-xs text-slate-800 group-hover:text-blue-700">
                                      <Mic
                                        className="w-3.5 h-3.5 text-blue-600 shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span className="truncate italic">
                                        &ldquo;{w.transcript}&rdquo;
                                      </span>
                                    </div>
                                    <div className="mt-0.5 pl-5 font-mono text-[11px] text-slate-500 truncate">
                                      {w.capturedOnHost}
                                      {w.targetHost ? ` -> ${w.targetHost}` : ''} ·{' '}
                                      {formatShortDateTime(w.timestamp)}
                                    </div>
                                  </button>
                                </div>
                                <div className="relative min-h-[36px]">
                                  {renderGridlinesAndNow()}
                                  {pt.visible && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onInspect({ type: 'wispr', id: w.id })
                                      }
                                      onFocus={handleFocusAnchor(wPreview)}
                                      style={{ left: `${pt.pct}%` }}
                                      aria-label={`Inspect Wispr dictation from ${w.capturedOnHost}`}
                                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center z-20"
                                    >
                                      <span className="w-3 h-3 rotate-45 bg-blue-600 hover:bg-blue-700 ring-2 ring-white" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend Footer Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-blue-600 inline-block" />
            <span>Running now</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-red-600 inline-block" />
            <span>Unverified claim</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-amber-500 inline-block" />
            <span>Abandoned / paused</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-emerald-600 inline-block" />
            <span>Verified done</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rotate-45 bg-blue-600 inline-block" />
            <span>Wispr note</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-amber-500 inline-block" />
            <span>Idle tail to Now</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Same-repo tasks kept separate</span>
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums">
          Window: {formatRelativeDate(new Date(bounds.startMs).toISOString())} –{' '}
          {formatRelativeDate(new Date(bounds.endMs).toISOString())}
        </span>
      </div>

      {/* Anchored Floating Hover Popover */}
      {anchoredHover && (
        <div
          role="tooltip"
          data-testid="timeline-hover-card"
          style={{
            left: `${anchoredHover.left}px`,
            top: `${anchoredHover.top}px`,
            transform: anchoredHover.placeAbove ? 'translateY(-100%)' : 'none',
          }}
          className="fixed z-50 w-[370px] max-w-[calc(100vw-24px)] bg-white border border-slate-300 rounded-lg shadow-lg p-3.5 pointer-events-none space-y-2 text-xs"
        >
          <div>
            <div className="font-semibold text-slate-950 leading-snug">
              {anchoredHover.preview.title}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
              {anchoredHover.preview.subtitle}
              {anchoredHover.preview.timestampLabel
                ? ` · ${anchoredHover.preview.timestampLabel}`
                : ''}
            </div>
          </div>

          {anchoredHover.preview.discrepancyNote && (
            <div className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
              {anchoredHover.preview.discrepancyNote}
            </div>
          )}

          <div className="space-y-1.5 pt-0.5">
            <div>
              <span className="font-semibold text-slate-700">Intended: </span>
              <span className="text-slate-600 line-clamp-2">
                {anchoredHover.preview.intended}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Happened: </span>
              <span className="text-slate-600 line-clamp-2">
                {anchoredHover.preview.happened}
              </span>
            </div>
            <div>
              <span className="font-semibold text-amber-800">Remains: </span>
              <span className="text-slate-800 line-clamp-2">
                {anchoredHover.preview.remains}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
