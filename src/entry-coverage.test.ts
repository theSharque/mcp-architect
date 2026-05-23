import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryCoverage, validateModuleEntryCounts } from './entry-coverage.js';
import type { Entry, ModuleDetails, ProjectArchitecture } from './types.js';

const architecture: ProjectArchitecture = {
  projectId: 'test',
  description: 'test',
  modules: [
    {
      id: 'm1',
      name: 'orders',
      description: 'Orders',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('validateEntryCoverage', () => {
  it('reports entries-without-modules when architecture empty', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'http-endpoint',
        title: 'GET /x',
        summary: 'x',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { issues, coverage } = validateEntryCoverage(null, entries, new Map());
    assert.equal(coverage.entriesWithoutModules, 1);
    assert.ok(issues.some((i) => i.kind === 'entries-without-modules'));
  });

  it('reports entry-unlinked when module exists but no refs', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'glossary',
        title: 'Order',
        summary: 'term',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { issues } = validateEntryCoverage(architecture, entries, new Map());
    assert.ok(issues.some((i) => i.kind === 'entry-unlinked'));
  });

  it('reports module-no-entries when files present but no linked entries', () => {
    const details = new Map<string, ModuleDetails>([
      [
        'orders',
        {
          moduleId: 'm1',
          name: 'orders',
          description: 'Orders',
          inputs: '',
          outputs: '',
          files: ['src/OrderController.java'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);
    const { issues } = validateEntryCoverage(architecture, [], details);
    assert.ok(issues.some((i) => i.kind === 'module-no-entries'));
    assert.ok(issues.some((i) => i.kind === 'module-missing-api'));
  });

  it('reports orphan-entry-module for unknown module ref', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'http-endpoint',
        title: 'GET /x',
        summary: 'x',
        refs: { moduleName: 'missing' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { issues } = validateEntryCoverage(architecture, entries, new Map());
    assert.ok(issues.some((i) => i.kind === 'orphan-entry-module'));
  });
});

describe('validateModuleEntryCounts', () => {
  it('reports module-too-many-entries when count exceeds max', () => {
    const entries: Entry[] = Array.from({ length: 51 }, (_, index) => ({
      id: `e${index}`,
      kind: 'http-endpoint',
      title: `GET /x${index}`,
      summary: 'x',
      refs: { moduleName: 'orders' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const { issues } = validateModuleEntryCounts(architecture, entries, { moduleEntryMax: 50 });
    assert.ok(issues.some((i) => i.kind === 'module-too-many-entries'));
  });

  it('reports module-too-few-entries when count is below min but above zero', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'http-endpoint',
        title: 'GET /x',
        summary: 'x',
        refs: { moduleName: 'orders' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'e2',
        kind: 'http-endpoint',
        title: 'GET /y',
        summary: 'y',
        refs: { moduleName: 'orders' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { issues } = validateModuleEntryCounts(architecture, entries, { moduleEntryMin: 3 });
    assert.ok(issues.some((i) => i.kind === 'module-too-few-entries'));
  });

  it('does not report module-too-few-entries when count is zero', () => {
    const { issues } = validateModuleEntryCounts(architecture, [], { moduleEntryMin: 3 });
    assert.equal(issues.some((i) => i.kind === 'module-too-few-entries'), false);
  });
});
