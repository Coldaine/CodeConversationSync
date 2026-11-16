import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitPullRequest,
  HelpCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import type { DeliverableStatus, ProjectSummary, WorkTask } from '@/lib/types';

export function DeliverableStatusLabel({
  status,
  discrepancy,
}: {
  status: DeliverableStatus;
  discrepancy?: boolean;
}) {
  if (discrepancy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Claim unverified</span>
      </span>
    );
  }

  switch (status) {
    case 'verified':
    case 'merged':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status === 'merged' ? 'Merged' : 'Verified'}</span>
        </span>
      );
    case 'pr_open':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <GitPullRequest className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Open PR</span>
        </span>
      );
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Blocked</span>
        </span>
      );
    case 'abandoned':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
          <PauseCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Abandoned worktree</span>
        </span>
      );
    case 'implemented':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Implemented (unmerged)</span>
        </span>
      );
    case 'requested':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Requested</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Unknown</span>
        </span>
      );
  }
}

export function ProjectHealthLabel({ health }: { health: ProjectSummary['healthStatus'] }) {
  switch (health) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Mostly verified</span>
        </span>
      );
    case 'needs_verification':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Needs verification</span>
        </span>
      );
    case 'unfinished_risk':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Unfinished / gap</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>In progress</span>
        </span>
      );
  }
}

export function TaskStatusLabel({ status }: { status: WorkTask['status'] }) {
  switch (status) {
    case 'verified':
      return <span className="text-xs font-medium text-emerald-700">Verified</span>;
    case 'partially_done':
      return <span className="text-xs font-medium text-amber-700">Partially done</span>;
    case 'unfinished':
      return <span className="text-xs font-medium text-amber-800">Unfinished</span>;
    case 'blocked':
      return <span className="text-xs font-medium text-red-700">Blocked</span>;
    default:
      return <span className="text-xs font-medium text-blue-700">Active</span>;
  }
}
