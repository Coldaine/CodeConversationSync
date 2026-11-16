'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { SEED_CORPUS } from '@/lib/seed-data';
import {
  EMPTY_OVERRIDES,
  applyUserOverrides,
  filterProjects,
  filterSessions,
  filterWisprDictations,
  isDeliverableOpen,
} from '@/lib/threadle-engine';
import type {
  ActiveView,
  DeliverableStatus,
  FilterState,
  InspectionTarget,
  SessionEpisode,
  ThreadleCorpus,
  TimelineZoom,
  UserOverrides,
  WisprDictation,
} from '@/lib/types';
import { DetailDrawer } from './DetailDrawer';
import { FilterBar } from './FilterBar';
import { IngestModal } from './IngestModal';
import { LineageView } from './LineageView';
import { MapView } from './MapView';
import { ProjectsView } from './ProjectsView';
import { SessionsView } from './SessionsView';
import { TimelineView } from './TimelineView';
import { TopBar } from './TopBar';

const STORAGE_OVERRIDES_KEY = 'threadle_user_overrides_v1';
const STORAGE_INGESTED_SESSIONS_KEY = 'threadle_ingested_sessions_v1';
const STORAGE_INGESTED_WISPR_KEY = 'threadle_ingested_wispr_v1';
const STORE_EVENT = 'threadle-storage-sync';

function subscribeStore(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(STORE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(STORE_EVENT, callback);
  };
}

function readStorageString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    // Ignore storage quota errors
  }
}

export function ThreadleApp() {
  const [activeView, setActiveView] = useState<ActiveView>('timeline');
  const [sessionsSubTab, setSessionsSubTab] = useState<
    'all' | 'sessions' | 'wispr' | 'unmatched'
  >('all');
  const [zoom, setZoom] = useState<TimelineZoom>('weeks');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    host: 'all',
    agent: 'all',
    unfinishedOnly: false,
    discrepancyOnly: false,
  });

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    'proj-semantic-router': true,
    'proj-host-collector': true,
  });
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [inspectTarget, setInspectTarget] = useState<InspectionTarget | null>(null);
  const [ingestOpen, setIngestOpen] = useState(false);

  const overridesRaw = useSyncExternalStore(
    subscribeStore,
    () => readStorageString(STORAGE_OVERRIDES_KEY, '{}'),
    () => '{}'
  );
  const sessionsRaw = useSyncExternalStore(
    subscribeStore,
    () => readStorageString(STORAGE_INGESTED_SESSIONS_KEY, '[]'),
    () => '[]'
  );
  const wisprRaw = useSyncExternalStore(
    subscribeStore,
    () => readStorageString(STORAGE_INGESTED_WISPR_KEY, '[]'),
    () => '[]'
  );

  const overrides: UserOverrides = useMemo(() => {
    try {
      return { ...EMPTY_OVERRIDES, ...JSON.parse(overridesRaw) };
    } catch {
      return EMPTY_OVERRIDES;
    }
  }, [overridesRaw]);

  const ingestedSessions: SessionEpisode[] = useMemo(() => {
    try {
      return JSON.parse(sessionsRaw);
    } catch {
      return [];
    }
  }, [sessionsRaw]);

  const ingestedWispr: WisprDictation[] = useMemo(() => {
    try {
      return JSON.parse(wisprRaw);
    } catch {
      return [];
    }
  }, [wisprRaw]);

  const updateOverrides = useCallback(
    (updater: (prev: UserOverrides) => UserOverrides) => {
      writeStorageJson(STORAGE_OVERRIDES_KEY, updater(overrides));
    },
    [overrides]
  );

  const baseCorpus: ThreadleCorpus = useMemo(
    () => ({
      ...SEED_CORPUS,
      sessions: [...ingestedSessions, ...SEED_CORPUS.sessions],
      wisprDictations: [...ingestedWispr, ...SEED_CORPUS.wisprDictations],
    }),
    [ingestedSessions, ingestedWispr]
  );

  const corpus = useMemo(
    () => applyUserOverrides(baseCorpus, overrides),
    [baseCorpus, overrides]
  );

  const filteredProjects = useMemo(
    () => filterProjects(corpus, filters),
    [corpus, filters]
  );
  const filteredSessions = useMemo(
    () => filterSessions(corpus, filters),
    [corpus, filters]
  );
  const filteredWispr = useMemo(
    () => filterWisprDictations(corpus, filters),
    [corpus, filters]
  );

  const summaryCounts = useMemo(
    () => ({
      projects: corpus.projects.length,
      openDeliverables: corpus.deliverables.filter((d) =>
        isDeliverableOpen(d.status)
      ).length,
      discrepancies: corpus.deliverables.filter((d) => d.discrepancyFlag).length,
      unmatchedWispr: corpus.wisprDictations.filter(
        (w) =>
          w.attributionStatus === 'unmatched' ||
          w.attributionStatus === 'ambiguous'
      ).length,
    }),
    [corpus]
  );

  const handleToggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handleToggleTask = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleExpandAll = () => {
    const nextProj: Record<string, boolean> = {};
    corpus.projects.forEach((p) => {
      nextProj[p.id] = true;
    });
    const nextTasks: Record<string, boolean> = {};
    corpus.tasks.forEach((t) => {
      nextTasks[t.id] = true;
    });
    setExpandedProjects(nextProj);
    setExpandedTasks(nextTasks);
  };

  const handleCollapseAll = () => {
    setExpandedProjects({});
    setExpandedTasks({});
  };

  const handleReassignSession = (sessionId: string, projectId: string | null) => {
    updateOverrides((prev) => ({
      ...prev,
      sessionProjectMap: { ...prev.sessionProjectMap, [sessionId]: projectId },
    }));
  };

  const handleReassignWispr = (wisprId: string, projectId: string | null) => {
    updateOverrides((prev) => ({
      ...prev,
      wisprProjectMap: { ...prev.wisprProjectMap, [wisprId]: projectId },
    }));
  };

  const handleUpdateDeliverableStatus = (
    deliverableId: string,
    status: DeliverableStatus
  ) => {
    updateOverrides((prev) => ({
      ...prev,
      deliverableStatusMap: {
        ...prev.deliverableStatusMap,
        [deliverableId]: status,
      },
    }));
  };

  const handleToggleIntentionResolved = (
    intentionId: string,
    resolved: boolean
  ) => {
    updateOverrides((prev) => ({
      ...prev,
      resolvedIntentionIds: {
        ...prev.resolvedIntentionIds,
        [intentionId]: resolved,
      },
    }));
  };

  const handleIngestSession = (
    session: SessionEpisode,
    targetProjectId: string | null
  ) => {
    writeStorageJson(STORAGE_INGESTED_SESSIONS_KEY, [session, ...ingestedSessions]);
    if (targetProjectId) {
      setExpandedProjects((prev) => ({ ...prev, [targetProjectId]: true }));
    }
    setActiveView('sessions');
    setSessionsSubTab('sessions');
    setInspectTarget({ type: 'session', id: session.id });
  };

  const handleIngestWispr = (wispr: WisprDictation) => {
    writeStorageJson(STORAGE_INGESTED_WISPR_KEY, [wispr, ...ingestedWispr]);
    setActiveView('sessions');
    setSessionsSubTab('wispr');
    setInspectTarget({ type: 'wispr', id: wispr.id });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          if (v !== 'sessions') setSessionsSubTab('all');
        }}
        onOpenIngest={() => setIngestOpen(true)}
      />

      <FilterBar
        activeView={activeView}
        filters={filters}
        onChangeFilters={setFilters}
        zoom={zoom}
        onChangeZoom={setZoom}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        summaryCounts={summaryCounts}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeView === 'timeline' && (
          <TimelineView
            corpus={corpus}
            filteredProjects={filteredProjects}
            hostFilter={filters.host}
            zoom={zoom}
            expandedProjects={expandedProjects}
            expandedTasks={expandedTasks}
            onToggleProject={handleToggleProject}
            onToggleTask={handleToggleTask}
            onInspect={setInspectTarget}
            onJumpToSessionsUnmatched={() => {
              setSessionsSubTab('unmatched');
              setActiveView('sessions');
            }}
          />
        )}

        {activeView === 'projects' && (
          <ProjectsView
            corpus={corpus}
            filteredProjects={filteredProjects}
            onInspect={setInspectTarget}
          />
        )}

        {activeView === 'map' && (
          <MapView
            corpus={corpus}
            filteredProjects={filteredProjects}
            onInspect={setInspectTarget}
          />
        )}

        {activeView === 'lineage' && (
          <LineageView
            corpus={corpus}
            filteredProjects={filteredProjects}
            onInspect={setInspectTarget}
          />
        )}

        {activeView === 'sessions' && (
          <SessionsView
            key={sessionsSubTab}
            corpus={corpus}
            filteredSessions={filteredSessions}
            filteredWispr={filteredWispr}
            initialSubTab={sessionsSubTab}
            onInspect={setInspectTarget}
            onReassignSession={handleReassignSession}
            onReassignWispr={handleReassignWispr}
          />
        )}
      </main>

      <DetailDrawer
        target={inspectTarget}
        corpus={corpus}
        onClose={() => setInspectTarget(null)}
        onUpdateDeliverableStatus={handleUpdateDeliverableStatus}
        onToggleIntentionResolved={handleToggleIntentionResolved}
        onReassignWispr={handleReassignWispr}
        onInspect={setInspectTarget}
      />

      <IngestModal
        open={ingestOpen}
        corpus={corpus}
        onClose={() => setIngestOpen(false)}
        onIngestSession={handleIngestSession}
        onIngestWispr={handleIngestWispr}
      />
    </div>
  );
}
