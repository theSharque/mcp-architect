import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSliceCoverage } from './slice-coverage.js';
import type { Entry, SliceDefinition } from './types.js';

const baseEntry = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('validateSliceCoverage', () => {
  it('does not flag entries with built-in slice kinds', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'http-endpoint',
        title: 'GET /x',
        summary: 'x',
        ...baseEntry,
      },
    ];
    const { issues, entriesSliceOrphan } = validateSliceCoverage(entries, []);
    assert.equal(entriesSliceOrphan, 0);
    assert.equal(issues.length, 0);
  });

  it('flags unknown kinds as slice orphans', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'unknown-kind',
        title: 'Mystery',
        summary: 'x',
        ...baseEntry,
      },
    ];
    const { issues, entriesSliceOrphan } = validateSliceCoverage(entries, []);
    assert.equal(entriesSliceOrphan, 1);
    assert.ok(issues.some((i) => i.kind === 'entry-slice-orphan'));
  });

  it('does not flag entries matching a custom slice by tag', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        kind: 'unknown-kind',
        title: 'Tagged',
        summary: 'x',
        tags: ['billing'],
        ...baseEntry,
      },
    ];
    const custom: SliceDefinition[] = [
      {
        id: 'billing',
        title: 'Billing',
        description: 'Billing facts',
        filter: { tags: ['billing'] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const { issues, entriesSliceOrphan } = validateSliceCoverage(entries, custom);
    assert.equal(entriesSliceOrphan, 0);
    assert.equal(issues.length, 0);
  });
});
