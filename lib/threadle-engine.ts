import type {
  Deliverable,
  DeliverableStatus,
  FilterState,
  HostCollectorStatus,
  HostId,
  IntentionRecord,
  ProjectSummary,
  SessionEpisode,
  ThreadleCorpus,
  TimelineZoom,
  UserOverrides,
  WisprDictation,
  WorkTask,
} from './types';

export const REFERENCE_NOW_ISO = '2026-11-16T10:54:32-08:00';

export const EMPTY_OVERRIDES: UserOverrides = {
  sessionProjectMap: {},
  wisprProjectMap: {},
  deliverableStatusMap: {},
  resolvedIntentionIds: {},
};

export function applyUserOverrides(
  corpus: ThreadleCorpus,
  overrides: UserOverrides
): ThreadleCorpus {
  const sessions = corpus.sessions.map((s) => {
    if (Object.prototype.hasOwnProperty.call(overrides.sessionProjectMap, s.id)) {
      return { ...s, projectId: overrides.sessionProjectMap[s.id] };
    }
    return s;
  });

  const wisprDictations = corpus.wisprDictations.map((w) => {
    if (Object.prototype.hasOwnProperty.call(overrides.wisprProjectMap, w.id)) {
      const nextProjectId = overrides.wisprProjectMap[w.id];
      return {
        ...w,
        matchedProjectId: nextProjectId,
        attributionStatus: nextProjectId ? ('matched' as const) : ('unmatched' as const),
        attributionReason: nextProjectId
          ? 'Manually attributed by user override'
          : 'Unassigned by user override',
      };
    }
    return w;
  });

  const deliverables = corpus.deliverables.map((d) => {
    const overrideStatus = overrides.deliverableStatusMap[d.id];
    if (overrideStatus && overrideStatus !== d.status) {
      const nowVerified = overrideStatus === 'verified' || overrideStatus === 'merged';
      return {
        ...d,
        status: overrideStatus,
        discrepancyFlag: nowVerified ? false : d.discrepancyFlag,
      };
    }
    return d;
  });

  const intentions = corpus.intentions.map((i) => {
    if (Object.prototype.hasOwnProperty.call(overrides.resolvedIntentionIds, i.id)) {
      return { ...i, resolved: overrides.resolvedIntentionIds[i.id] };
    }
    return i;
  });

  return {
    ...corpus,
    sessions,
    wisprDictations,
    deliverables,
    intentions,
  };
}

export function isDeliverableOpen(status: DeliverableStatus): boolean {
  return (
    status === 'requested' ||
    status === 'implemented' ||
    status === 'pr_open' ||
    status === 'blocked' ||
    status === 'abandoned' ||
    status === 'unknown'
  );
}

export function computeProjectMetrics(
  project: ProjectSummary,
  corpus: ThreadleCorpus
) {
  const tasks = corpus.tasks.filter((t) => t.projectId === project.id);
  const deliverables = corpus.deliverables.filter((d) => d.projectId === project.id);
  const sessions = corpus.sessions.filter((s) => s.projectId === project.id);
  const wispr = corpus.wisprDictations.filter((w) => w.matchedProjectId === project.id);

  const verifiedCount = deliverables.filter(
    (d) => d.status === 'verified' || d.status === 'merged'
  ).length;
  const discrepancyCount = deliverables.filter((d) => d.discrepancyFlag).length;
  const openDeliverables = deliverables.filter((d) => isDeliverableOpen(d.status));
  const forgottenTasks = tasks.filter((t) => t.isForgotten);

  const hostSet = new Set(project.hosts);
  sessions.forEach((s) => hostSet.add(s.host));

  const agentSet = new Set(project.agents);
  sessions.forEach((s) => agentSet.add(s.agent));

  return {
    taskCount: tasks.length,
    deliverableCount: deliverables.length,
    verifiedCount,
    openDeliverableCount: openDeliverables.length,
    discrepancyCount,
    forgottenCount: forgottenTasks.length,
    sessionCount: sessions.length,
    wisprCount: wispr.length,
    hosts: Array.from(hostSet),
    agents: Array.from(agentSet),
  };
}

export function filterProjects(
  corpus: ThreadleCorpus,
  filters: FilterState
): ProjectSummary[] {
  const query = filters.search.trim().toLowerCase();

  return corpus.projects.filter((project) => {
    const metrics = computeProjectMetrics(project, corpus);
    const projectTasks = corpus.tasks.filter((t) => t.projectId === project.id);
    const projectSessions = corpus.sessions.filter((s) => s.projectId === project.id);
    const projectDeliverables = corpus.deliverables.filter(
      (d) => d.projectId === project.id
    );
    const projectWispr = corpus.wisprDictations.filter(
      (w) => w.matchedProjectId === project.id
    );

    if (filters.host !== 'all') {
      const hasHost =
        metrics.hosts.includes(filters.host) ||
        projectWispr.some(
          (w) => w.capturedOnHost === filters.host || w.targetHost === filters.host
        );
      if (!hasHost) return false;
    }

    if (filters.agent !== 'all') {
      if (filters.agent === 'Wispr Flow') {
        if (projectWispr.length === 0) return false;
      } else if (!metrics.agents.includes(filters.agent)) {
        return false;
      }
    }

    if (filters.unfinishedOnly) {
      const hasUnfinished =
        metrics.forgottenCount > 0 ||
        metrics.openDeliverableCount > 0 ||
        projectTasks.some((t) => t.status === 'unfinished' || t.status === 'blocked');
      if (!hasUnfinished) return false;
    }

    if (filters.discrepancyOnly && metrics.discrepancyCount === 0) {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        project.name,
        project.workstreamCategory,
        project.currentState,
        project.latestObjective,
        ...project.repos,
        ...projectTasks.map((t) => `${t.title} ${t.objective} ${t.branches.join(' ')}`),
        ...projectSessions.map((s) => `${s.title} ${s.userIntent} ${s.branch} ${s.host}`),
        ...projectDeliverables.map((d) => `${d.title} ${d.prNumber ?? ''} ${d.actualReality}`),
        ...projectWispr.map((w) => w.transcript),
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

export function filterSessions(
  corpus: ThreadleCorpus,
  filters: FilterState
): SessionEpisode[] {
  const query = filters.search.trim().toLowerCase();
  return corpus.sessions.filter((session) => {
    if (filters.host !== 'all' && session.host !== filters.host) return false;
    if (filters.agent !== 'all') {
      if (filters.agent === 'Wispr Flow') return false;
      if (session.agent !== filters.agent) return false;
    }
    if (filters.unfinishedOnly) {
      const unfinished =
        session.status === 'abandoned' ||
        session.status === 'paused' ||
        session.status === 'running' ||
        !session.verifiedDone;
      if (!unfinished) return false;
    }
    if (filters.discrepancyOnly) {
      if (!(session.agentClaimedDone && !session.verifiedDone)) return false;
    }
    if (query.length > 0) {
      const haystack = [
        session.title,
        session.host,
        session.agent,
        session.repo,
        session.branch,
        session.userIntent,
        session.whatHappened,
        session.whatRemains,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function filterWisprDictations(
  corpus: ThreadleCorpus,
  filters: FilterState
): WisprDictation[] {
  const query = filters.search.trim().toLowerCase();
  return corpus.wisprDictations.filter((w) => {
    if (filters.host !== 'all') {
      if (w.capturedOnHost !== filters.host && w.targetHost !== filters.host) {
        return false;
      }
    }
    if (filters.agent !== 'all' && filters.agent !== 'Wispr Flow') {
      return false;
    }
    if (filters.unfinishedOnly && w.attributionStatus === 'matched') {
      // keep ambiguous/unmatched or dictations tied to open projects
      const projectOpen = w.matchedProjectId
        ? corpus.deliverables.some(
            (d) => d.projectId === w.matchedProjectId && isDeliverableOpen(d.status)
          )
        : true;
      if (!projectOpen) return false;
    }
    if (query.length > 0) {
      const haystack = `${w.transcript} ${w.extractedIntent} ${w.capturedOnHost} ${w.targetHost ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface TimelineBounds {
  startMs: number;
  endMs: number;
  totalMs: number;
  ticks: { ms: number; label: string; sublabel?: string }[];
}

export function computeTimelineBounds(
  zoom: TimelineZoom,
  referenceEndIso = '2026-11-16T12:00:00-08:00'
): TimelineBounds {
  const endMs = new Date(referenceEndIso).getTime();
  let durationDays = 28;
  let tickStepHours = 24 * 7;

  if (zoom === 'days') {
    durationDays = 10;
    tickStepHours = 24;
  } else if (zoom === 'hours') {
    durationDays = 2;
    tickStepHours = 6;
  }

  const startMs = endMs - durationDays * 24 * 60 * 60 * 1000;
  const totalMs = Math.max(1, endMs - startMs);
  const ticks: { ms: number; label: string; sublabel?: string }[] = [];

  const stepMs = tickStepHours * 60 * 60 * 1000;
  // Align first tick cleanly
  const firstTick = Math.ceil(startMs / stepMs) * stepMs;
  for (let ms = firstTick; ms <= endMs; ms += stepMs) {
    const d = new Date(ms);
    if (zoom === 'weeks') {
      ticks.push({
        ms,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    } else if (zoom === 'days') {
      ticks.push({
        ms,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    } else {
      ticks.push({
        ms,
        label: d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        sublabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }
  }

  return { startMs, endMs, totalMs, ticks };
}

export function computeBarSpan(
  startedAt: string,
  endedAt: string,
  bounds: TimelineBounds
): { leftPct: number; widthPct: number; visible: boolean } {
  const s = new Date(startedAt).getTime();
  const e = new Date(endedAt).getTime();
  if (e < bounds.startMs || s > bounds.endMs) {
    return { leftPct: 0, widthPct: 0, visible: false };
  }
  const clampedStart = Math.max(s, bounds.startMs);
  const clampedEnd = Math.min(Math.max(e, clampedStart + 60 * 60 * 1000), bounds.endMs);
  const leftPct = ((clampedStart - bounds.startMs) / bounds.totalMs) * 100;
  const widthPct = Math.max(1.2, ((clampedEnd - clampedStart) / bounds.totalMs) * 100);
  return { leftPct, widthPct, visible: true };
}

export function computePointPercent(
  timestampIso: string,
  bounds: TimelineBounds
): { pct: number; visible: boolean } {
  const t = new Date(timestampIso).getTime();
  if (t < bounds.startMs || t > bounds.endMs) {
    return { pct: 0, visible: false };
  }
  const pct = ((t - bounds.startMs) / bounds.totalMs) * 100;
  return { pct, visible: true };
}

export function computeDormancyDays(
  lastActivityIso: string,
  referenceNowIso = REFERENCE_NOW_ISO
): number {
  const diffMs =
    new Date(referenceNowIso).getTime() - new Date(lastActivityIso).getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export interface HostSwimlane {
  collector: HostCollectorStatus;
  sessions: SessionEpisode[];
  wispr: WisprDictation[];
  discrepancyCount: number;
  runningCount: number;
  dormancyDays: number;
}

export function buildHostSwimlanes(
  corpus: ThreadleCorpus,
  allowedProjectIds: Set<string>,
  hostFilter: HostId | 'all' = 'all'
): HostSwimlane[] {
  return corpus.hostCollectors
    .filter((hc) => hostFilter === 'all' || hc.host === hostFilter)
    .map((collector) => {
      const sessions = corpus.sessions
        .filter(
          (s) =>
            s.host === collector.host &&
            (!s.projectId || allowedProjectIds.has(s.projectId))
        )
        .sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );

      const wispr = corpus.wisprDictations
        .filter(
          (w) =>
            (w.capturedOnHost === collector.host || w.targetHost === collector.host) &&
            (!w.matchedProjectId || allowedProjectIds.has(w.matchedProjectId))
        )
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

      const discrepancyCount = sessions.filter(
        (s) => s.agentClaimedDone && !s.verifiedDone
      ).length;
      const runningCount = sessions.filter((s) => s.status === 'running').length;

      const latestIso =
        sessions.length > 0
          ? sessions.reduce(
              (max, s) =>
                new Date(s.endedAt).getTime() > new Date(max).getTime()
                  ? s.endedAt
                  : max,
              sessions[0].endedAt
            )
          : collector.lastAuditSync;

      return {
        collector,
        sessions,
        wispr,
        discrepancyCount,
        runningCount,
        dormancyDays: computeDormancyDays(latestIso),
      };
    });
}

export function buildContinuationPacket(
  project: ProjectSummary,
  tasks: WorkTask[],
  deliverables: Deliverable[],
  sessions: SessionEpisode[],
  intentions: IntentionRecord[],
  wispr: WisprDictation[]
): string {
  const openDeliverables = deliverables.filter((d) => isDeliverableOpen(d.status));
  const verifiedDeliverables = deliverables.filter(
    (d) => d.status === 'verified' || d.status === 'merged'
  );
  const unresolvedIntentions = intentions.filter((i) => !i.resolved);
  const latestSessions = [...sessions]
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, 4);

  const lines: string[] = [
    `# Continuation Packet: ${project.name}`,
    `Workstream: ${project.workstreamCategory}`,
    `Repositories: ${project.repos.join(', ')}`,
    `Active Hosts: ${Array.from(new Set(sessions.map((s) => s.host))).join(', ')}`,
    '',
    '## 1. Latest Supported Objective',
    project.latestObjective,
    '',
    '## 2. Constraints & Prior Decisions',
    ...project.constraints.map((c) => `- ${c}`),
    '',
    '## 3. Verified Completed Deliverables',
    ...(verifiedDeliverables.length > 0
      ? verifiedDeliverables.map(
          (d) =>
            `- [VERIFIED: ${d.status}] ${d.title} (${d.prNumber || d.branch || d.repo || 'artifact'}) — ${d.actualReality}`
        )
      : ['- No deliverables independently verified yet.']),
    '',
    '## 4. Unfinished, Blocked, or Unverified Work',
    ...(openDeliverables.length > 0
      ? openDeliverables.map((d) => {
          const warn = d.discrepancyFlag
            ? ` [DISCREPANCY: ${d.discrepancyReason}]`
            : '';
          return `- [${d.status.toUpperCase()}] ${d.title} (${d.branch ?? d.worktreePath ?? 'no branch'})${warn}: ${d.actualReality}`;
        })
      : ['- All tracked deliverables appear closed.']),
    '',
    '## 5. Forgotten Requests & Open Questions',
    ...(unresolvedIntentions.length > 0
      ? unresolvedIntentions.map((i) => `- (${i.kind}) ${i.statement} [${i.sourceRef}]`)
      : ['- No unresolved intentions logged.']),
    ...(project.openQuestions.length > 0
      ? project.openQuestions.map((q) => `- Question: ${q}`)
      : []),
    '',
    '## 6. Relevant Recent Context (Sessions & Wispr Notes)',
    ...latestSessions.map(
      (s) =>
        `- ${s.host} / ${s.agent} on branch \`${s.branch}\` (${s.directory}): ${s.whatRemains}`
    ),
    ...wispr.slice(0, 3).map(
      (w) =>
        `- Wispr (${w.capturedOnHost}${w.targetHost ? ` -> ${w.targetHost}` : ''}): "${w.transcript}"`
    ),
    '',
    '## 7. Immediate Recommended Next Action',
    tasks.find((t) => t.isForgotten || t.status === 'unfinished' || t.status === 'blocked')
      ?.nextAction || project.continuationPromptSeed,
  ];

  return lines.join('\n');
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
