import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_CORPUS } from './seed-data';
import {
  EMPTY_OVERRIDES,
  REFERENCE_NOW_ISO,
  applyUserOverrides,
  buildContinuationPacket,
  buildHostSwimlanes,
  computeBarSpan,
  computeDormancyDays,
  computePointPercent,
  computeProjectMetrics,
  computeTimelineBounds,
  filterProjects,
  filterSessions,
  filterWisprDictations,
} from './threadle-engine';
import type { FilterState } from './types';

const DEFAULT_FILTERS: FilterState = {
  search: '',
  host: 'all',
  agent: 'all',
  unfinishedOnly: false,
  discrepancyOnly: false,
};

test('shared repository tasks remain separated across distinct projects', () => {
  const threadleCoreProjects = SEED_CORPUS.projects.filter((p) =>
    p.repos.includes('github.com/pmaclyman/threadle-core')
  );
  assert.equal(threadleCoreProjects.length, 2);
  assert.notEqual(threadleCoreProjects[0].id, threadleCoreProjects[1].id);
});

test('applyUserOverrides preserves manual project attribution and deliverable verification', () => {
  const updated = applyUserOverrides(SEED_CORPUS, {
    ...EMPTY_OVERRIDES,
    wisprProjectMap: { 'w-106': 'proj-passkey-gateway' },
    deliverableStatusMap: { 'deliv-pr412': 'verified' },
  });

  const reassigned = updated.wisprDictations.find((w) => w.id === 'w-106');
  assert.equal(reassigned?.matchedProjectId, 'proj-passkey-gateway');
  assert.equal(reassigned?.attributionStatus, 'matched');

  const verifiedDeliv = updated.deliverables.find((d) => d.id === 'deliv-pr412');
  assert.equal(verifiedDeliv?.status, 'verified');
  assert.equal(verifiedDeliv?.discrepancyFlag, false);
});

test('computeProjectMetrics accurately counts discrepancies and forgotten work', () => {
  const collector = SEED_CORPUS.projects.find((p) => p.id === 'proj-host-collector');
  assert.ok(collector);
  const metrics = computeProjectMetrics(collector, SEED_CORPUS);
  assert.equal(metrics.discrepancyCount, 2);
  assert.equal(metrics.forgottenCount, 2);
  assert.equal(metrics.openDeliverableCount, 2);
});

test('filterProjects filters by host, discrepancyOnly, and search query', () => {
  const byIcarus = filterProjects(SEED_CORPUS, {
    ...DEFAULT_FILTERS,
    host: 'Icarus',
  });
  assert.equal(byIcarus.length, 1);
  assert.equal(byIcarus[0].id, 'proj-host-collector');

  const withDiscrepancy = filterProjects(SEED_CORPUS, {
    ...DEFAULT_FILTERS,
    discrepancyOnly: true,
  });
  assert.equal(withDiscrepancy.length, 3);

  const byQuery = filterProjects(SEED_CORPUS, {
    ...DEFAULT_FILTERS,
    search: 'duckdb',
  });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].id, 'proj-duckdb-compaction');
});

test('filterSessions and filterWisprDictations handle Wispr Flow agent filter cleanly', () => {
  const sessions = filterSessions(SEED_CORPUS, {
    ...DEFAULT_FILTERS,
    agent: 'Wispr Flow',
  });
  assert.equal(sessions.length, 0);

  const wispr = filterWisprDictations(SEED_CORPUS, {
    ...DEFAULT_FILTERS,
    agent: 'Wispr Flow',
    host: 'Gemini Laptop',
  });
  assert.equal(wispr.length, 2);
});

test('computeTimelineBounds and computeBarSpan produce valid percentage coordinates', () => {
  const bounds = computeTimelineBounds('weeks');
  assert.ok(bounds.ticks.length >= 3);
  const span = computeBarSpan('2026-11-01T10:00:00-08:00', '2026-11-10T10:00:00-08:00', bounds);
  assert.equal(span.visible, true);
  assert.ok(span.leftPct > 0 && span.leftPct < 100);
  assert.ok(span.widthPct > 0 && span.leftPct + span.widthPct <= 100.1);
});

test('buildContinuationPacket includes objective, discrepancies, and next action', () => {
  const project = SEED_CORPUS.projects[0];
  const packet = buildContinuationPacket(
    project,
    SEED_CORPUS.tasks.filter((t) => t.projectId === project.id),
    SEED_CORPUS.deliverables.filter((d) => d.projectId === project.id),
    SEED_CORPUS.sessions.filter((s) => s.projectId === project.id),
    SEED_CORPUS.intentions.slice(0, 2),
    SEED_CORPUS.wisprDictations.filter((w) => w.matchedProjectId === project.id)
  );
  assert.ok(packet.includes(project.name));
  assert.ok(packet.includes('PR #412'));
  assert.ok(packet.includes('DISCREPANCY'));
  assert.ok(packet.includes('Immediate Recommended Next Action'));
});

test('computePointPercent and computeDormancyDays accurately locate markers and idle tails', () => {
  const bounds = computeTimelineBounds('weeks');
  const nowPoint = computePointPercent(REFERENCE_NOW_ISO, bounds);
  assert.equal(nowPoint.visible, true);
  assert.ok(nowPoint.pct > 95 && nowPoint.pct <= 100);

  const outOfRange = computePointPercent('2026-09-01T12:00:00-08:00', bounds);
  assert.equal(outOfRange.visible, false);

  assert.equal(computeDormancyDays('2026-11-04T17:20:00-08:00'), 11);
  assert.equal(computeDormancyDays('2026-11-12T10:15:00-08:00'), 4);
  assert.equal(computeDormancyDays('2026-11-16T10:50:00-08:00'), 0);
});

test('buildHostSwimlanes groups sessions and cross-host Wispr notes across all 6 hosts', () => {
  const allowed = new Set(SEED_CORPUS.projects.map((p) => p.id));
  const lanes = buildHostSwimlanes(SEED_CORPUS, allowed);
  assert.equal(lanes.length, 6);

  const icarus = lanes.find((l) => l.collector.host === 'Icarus');
  assert.ok(icarus);
  assert.equal(icarus.sessions.length, 2);
  assert.equal(icarus.dormancyDays, 11);
  assert.equal(icarus.discrepancyCount, 1);

  const ser10 = lanes.find((l) => l.collector.host === 'SER10');
  assert.ok(ser10);
  // Includes cross-host Wispr notes targeting SER10 (w-101, w-102)
  assert.ok(ser10.wispr.some((w) => w.id === 'w-101' && w.capturedOnHost === 'Gemini Laptop'));
});

