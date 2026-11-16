export type HostId =
  | 'SER10'
  | 'N5'
  | 'Blood Arrow'
  | 'Primary Desktop'
  | 'Gemini Laptop'
  | 'Icarus';

export type AgentSource =
  | 'Claude Code'
  | 'Codex'
  | 'Droid'
  | 'OMP'
  | 'Maestro'
  | 'ChatGPT'
  | 'Claude Desktop';

export type DeliverableStatus =
  | 'requested'
  | 'implemented'
  | 'pr_open'
  | 'merged'
  | 'verified'
  | 'blocked'
  | 'abandoned'
  | 'unknown';

export type EvidenceKind =
  | 'pull_request'
  | 'commit'
  | 'worktree'
  | 'test_run'
  | 'deployment'
  | 'file_artifact'
  | 'transcript_excerpt'
  | 'wispr_note';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  reference: string;
  host?: HostId;
  timestamp: string;
  verified: boolean;
  summary: string;
  url?: string;
}

export interface Deliverable {
  id: string;
  projectId: string;
  taskId: string;
  title: string;
  requestedSummary: string;
  status: DeliverableStatus;
  agentClaim?: string;
  actualReality: string;
  discrepancyFlag: boolean;
  discrepancyReason?: string;
  repo?: string;
  branch?: string;
  worktreePath?: string;
  prNumber?: string;
  evidenceIds: string[];
  lastCheckedAt: string;
}

export interface IntentionRecord {
  id: string;
  kind:
    | 'explicit_request'
    | 'decision'
    | 'constraint'
    | 'pivot'
    | 'rejected_approach'
    | 'planned_unimplemented'
    | 'unresolved_investigation'
    | 'forgotten_request';
  statement: string;
  sourceRef: string;
  timestamp: string;
  resolved: boolean;
}

export interface SessionEpisode {
  id: string;
  title: string;
  projectId: string | null;
  taskId: string | null;
  host: HostId;
  agent: AgentSource;
  repo: string;
  branch: string;
  worktree?: string;
  directory: string;
  startedAt: string;
  endedAt: string;
  status: 'running' | 'completed' | 'abandoned' | 'paused';
  userIntent: string;
  whatHappened: string;
  whatRemains: string;
  agentClaimedDone: boolean;
  verifiedDone: boolean;
  transcriptSnippet: string;
  contentHash: string;
  analyzedBy: string;
}

export interface WisprDictation {
  id: string;
  capturedOnHost: 'Primary Desktop' | 'Gemini Laptop' | 'Icarus';
  targetHost?: HostId;
  timestamp: string;
  durationSeconds: number;
  transcript: string;
  matchedSessionId: string | null;
  matchedProjectId: string | null;
  attributionStatus: 'matched' | 'cross_host_matched' | 'ambiguous' | 'unmatched';
  attributionReason: string;
  extractedIntent: string;
}

export interface LineageNode {
  id: string;
  projectId: string;
  parentId: string | null;
  timestamp: string;
  kind: 'request' | 'decision' | 'pivot' | 'rejected' | 'worktree' | 'deliverable' | 'open_thread';
  title: string;
  detail: string;
  host?: HostId;
  agent?: AgentSource;
  status: 'active' | 'completed' | 'rejected' | 'abandoned' | 'unverified';
}

export interface WorkTask {
  id: string;
  projectId: string;
  workstreamName: string;
  title: string;
  objective: string;
  status: 'active' | 'partially_done' | 'unfinished' | 'blocked' | 'verified';
  isForgotten: boolean;
  startedAt: string;
  lastActivityAt: string;
  repo: string;
  branches: string[];
  hosts: HostId[];
  agents: AgentSource[];
  nextAction: string;
  unresolvedQuestions: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  workstreamCategory: string;
  currentState: string;
  latestObjective: string;
  constraints: string[];
  repos: string[];
  hosts: HostId[];
  agents: AgentSource[];
  startedAt: string;
  lastActivityAt: string;
  healthStatus: 'on_track' | 'needs_verification' | 'unfinished_risk' | 'verified';
  forgottenCount: number;
  openQuestions: string[];
  continuationPromptSeed: string;
}

export interface HostCollectorStatus {
  host: HostId;
  role: string;
  lastAuditSync: string;
  sessionsIndexed: number;
  wisprRecords: number;
  runningSessions: number;
  agentsDetected: AgentSource[];
}

export interface UserOverrides {
  sessionProjectMap: Record<string, string | null>;
  wisprProjectMap: Record<string, string | null>;
  deliverableStatusMap: Record<string, DeliverableStatus>;
  resolvedIntentionIds: Record<string, boolean>;
}

export interface ThreadleCorpus {
  projects: ProjectSummary[];
  tasks: WorkTask[];
  deliverables: Deliverable[];
  evidence: EvidenceItem[];
  intentions: IntentionRecord[];
  sessions: SessionEpisode[];
  wisprDictations: WisprDictation[];
  lineageNodes: LineageNode[];
  hostCollectors: HostCollectorStatus[];
}

export type ActiveView = 'timeline' | 'projects' | 'map' | 'lineage' | 'sessions';
export type TimelineZoom = 'weeks' | 'days' | 'hours';

export type InspectionTarget =
  | { type: 'project'; id: string }
  | { type: 'task'; id: string }
  | { type: 'session'; id: string }
  | { type: 'wispr'; id: string };

export interface FilterState {
  search: string;
  host: HostId | 'all';
  agent: AgentSource | 'Wispr Flow' | 'all';
  unfinishedOnly: boolean;
  discrepancyOnly: boolean;
}
