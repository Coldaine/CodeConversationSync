'use client';

import { RotateCcw, Search } from 'lucide-react';
import type {
  ActiveView,
  AgentSource,
  FilterState,
  HostId,
  TimelineZoom,
} from '@/lib/types';

const HOSTS: (HostId | 'all')[] = [
  'all',
  'SER10',
  'N5',
  'Blood Arrow',
  'Primary Desktop',
  'Gemini Laptop',
  'Icarus',
];

const AGENTS: (AgentSource | 'Wispr Flow' | 'all')[] = [
  'all',
  'Claude Code',
  'Codex',
  'Droid',
  'OMP',
  'Maestro',
  'Claude Desktop',
  'ChatGPT',
  'Wispr Flow',
];

interface FilterBarProps {
  activeView: ActiveView;
  filters: FilterState;
  onChangeFilters: (next: FilterState) => void;
  zoom: TimelineZoom;
  onChangeZoom: (zoom: TimelineZoom) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  summaryCounts: {
    projects: number;
    openDeliverables: number;
    discrepancies: number;
    unmatchedWispr: number;
  };
}

export function FilterBar({
  activeView,
  filters,
  onChangeFilters,
  zoom,
  onChangeZoom,
  onExpandAll,
  onCollapseAll,
  summaryCounts,
}: FilterBarProps) {
  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.host !== 'all' ||
    filters.agent !== 'all' ||
    filters.unfinishedOnly ||
    filters.discrepancyOnly;

  return (
    <section
      aria-label="Workspace filters"
      className="bg-white border-b border-slate-200"
    >
      <div className="max-w-[1440px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="threadle-search" className="sr-only">
              Search projects, branches, hosts, or transcripts
            </label>
            <input
              id="threadle-search"
              type="search"
              value={filters.search}
              onChange={(e) =>
                onChangeFilters({ ...filters, search: e.target.value })
              }
              placeholder="Search projects, branches, PRs, Wispr..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-2 focus:outline-blue-600 focus:border-blue-600"
            />
          </div>

          <div>
            <label htmlFor="host-filter" className="sr-only">
              Filter by host
            </label>
            <select
              id="host-filter"
              value={filters.host}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  host: e.target.value as HostId | 'all',
                })
              }
              className="h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-2 focus:outline-blue-600"
            >
              {HOSTS.map((h) => (
                <option key={h} value={h}>
                  {h === 'all' ? 'All hosts (6)' : h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="agent-filter" className="sr-only">
              Filter by agent or source
            </label>
            <select
              id="agent-filter"
              value={filters.agent}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  agent: e.target.value as AgentSource | 'Wispr Flow' | 'all',
                })
              }
              className="h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-2 focus:outline-blue-600"
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a === 'all' ? 'All agents & Wispr' : a}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            aria-pressed={filters.unfinishedOnly}
            onClick={() =>
              onChangeFilters({
                ...filters,
                unfinishedOnly: !filters.unfinishedOnly,
              })
            }
            className={`h-9 px-3 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              filters.unfinishedOnly
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Unfinished &amp; Forgotten ({summaryCounts.openDeliverables})
          </button>

          <button
            type="button"
            aria-pressed={filters.discrepancyOnly}
            onClick={() =>
              onChangeFilters({
                ...filters,
                discrepancyOnly: !filters.discrepancyOnly,
              })
            }
            className={`h-9 px-3 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              filters.discrepancyOnly
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Verification Gaps ({summaryCounts.discrepancies})
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() =>
                onChangeFilters({
                  search: '',
                  host: 'all',
                  agent: 'all',
                  unfinishedOnly: false,
                  discrepancyOnly: false,
                })
              }
              className="inline-flex items-center gap-1.5 h-9 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {activeView === 'timeline' && (
          <div className="flex items-center gap-3 shrink-0">
            {onExpandAll && onCollapseAll && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={onExpandAll}
                  className="hover:text-slate-950 font-medium whitespace-nowrap"
                >
                  Expand all
                </button>
                <span aria-hidden="true" className="text-slate-300">
                  /
                </span>
                <button
                  type="button"
                  onClick={onCollapseAll}
                  className="hover:text-slate-950 font-medium whitespace-nowrap"
                >
                  Collapse
                </button>
              </div>
            )}

            <div
              role="group"
              aria-label="Timeline zoom"
              className="flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200"
            >
              {(['weeks', 'days', 'hours'] as TimelineZoom[]).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => onChangeZoom(z)}
                  className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                    zoom === z
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
