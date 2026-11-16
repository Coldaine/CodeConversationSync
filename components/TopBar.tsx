'use client';

import type { ActiveView } from '@/lib/types';

interface TopBarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onOpenIngest: () => void;
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'projects', label: 'Projects' },
  { id: 'map', label: 'Map' },
  { id: 'lineage', label: 'Lineage' },
  { id: 'sessions', label: 'Sessions' },
];

export function TopBar({ activeView, onSelectView, onOpenIngest }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-8">
        <button
          type="button"
          onClick={() => onSelectView('timeline')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Threadle
        </button>

        <nav aria-label="Primary views" className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-4 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenIngest}
            className="px-3 sm:px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span className="hidden sm:inline">Ingest &amp; Reconcile</span>
            <span className="sm:hidden">Ingest</span>
          </button>
        </div>
      </div>
    </header>
  );
}
