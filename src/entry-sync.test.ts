import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpsertKey,
  computeImportStats,
  matchesEntryScope,
  resolveEntryRefs,
  validateImportEntries,
} from './entry-sync.js';
import type { Entry, ModuleFactInput } from './types.js';

describe('resolveEntryRefs', () => {
  it('prefers per-entry moduleName over batch default', () => {
    const fact: ModuleFactInput = {
      kind: 'http-endpoint',
      title: 'GET /x',
      summary: 'x',
      refs: { moduleName: 'postgres', files: ['a.java'] },
    };
    const refs = resolveEntryRefs(fact, 'core');
    assert.equal(refs?.moduleName, 'postgres');
  });

  it('uses batch moduleName when entry omits refs.moduleName', () => {
    const fact: ModuleFactInput = {
      kind: 'view',
      title: 'pg/list',
      summary: 'list',
      refs: { files: ['list.html'] },
    };
    const refs = resolveEntryRefs(fact, 'postgres');
    assert.equal(refs?.moduleName, 'postgres');
  });
});

describe('buildUpsertKey', () => {
  it('builds stable kind+title key', () => {
    const key = buildUpsertKey(
      { kind: 'http-endpoint', title: 'GET /pg/{id}' },
      ['kind', 'title']
    );
    assert.equal(key, 'http-endpoint\u0000GET /pg/{id}');
  });
});

describe('matchesEntryScope', () => {
  const entry: Entry = {
    id: '1',
    kind: 'http-endpoint',
    title: 'GET /pg',
    summary: 'pg',
    refs: { moduleName: 'postgres' },
    tags: ['ui'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('matches kind and moduleName scope', () => {
    assert.equal(
      matchesEntryScope(entry, { kind: 'http-endpoint', moduleName: 'postgres' }),
      true
    );
    assert.equal(
      matchesEntryScope(entry, { kind: 'http-endpoint', moduleName: 'core' }),
      false
    );
  });

  it('matches tag scope', () => {
    assert.equal(matchesEntryScope(entry, { tags: ['ui'] }), true);
    assert.equal(matchesEntryScope(entry, { tags: ['api'] }), false);
  });
});

describe('computeImportStats', () => {
  it('aggregates by kind module and tag', () => {
    const entries: Entry[] = [
      {
        id: '1',
        kind: 'http-endpoint',
        title: 'a',
        summary: 'a',
        refs: { moduleName: 'postgres' },
        tags: ['ui', 'api'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        kind: 'view',
        title: 'b',
        summary: 'b',
        refs: { moduleName: 'postgres' },
        tags: ['ui'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const stats = computeImportStats(entries);
    assert.equal(stats.total, 2);
    assert.equal(stats.byKind['http-endpoint'], 1);
    assert.equal(stats.byKind.view, 1);
    assert.equal(stats.byModule.postgres, 2);
    assert.equal(stats.byTag.ui, 2);
    assert.equal(stats.byTag.api, 1);
  });
});

describe('validateImportEntries', () => {
  it('detects duplicate keys in batch', async () => {
    const entries: ModuleFactInput[] = [
      { kind: 'http-endpoint', title: 'GET /x', summary: 'a' },
      { kind: 'http-endpoint', title: 'GET /x', summary: 'b' },
    ];
    const result = await validateImportEntries('test-project', entries, {
      checkModuleExists: false,
    });
    assert.equal(result.valid, false);
    assert.ok(result.warnings.some((warning) => warning.code === 'duplicate-key'));
  });
});
