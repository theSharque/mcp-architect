import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRefactorLimit,
  clampRefactorOffset,
  createDraftState,
  executeRefactorDraft,
  paginateRefactorResult,
  assertRefactorOperationLimit,
} from './refactor.js';
import type { Entry, ModuleDetails } from './types.js';

const now = '2026-01-01T00:00:00.000Z';

function entry(
  id: string,
  kind: string,
  title: string,
  files?: string[],
  extra?: Partial<Entry>
): Entry {
  return {
    id,
    kind,
    title,
    summary: `${title} summary`,
    refs: files ? { moduleName: 'orders', files } : { moduleName: 'orders' },
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function moduleDetails(
  moduleId: string,
  name: string,
  files?: string[]
): ModuleDetails {
  return {
    moduleId,
    name,
    description: `${name} module`,
    inputs: 'in',
    outputs: 'out',
    files,
    createdAt: now,
    updatedAt: now,
  };
}

describe('executeRefactorDraft', () => {
  it('move-file updates entry and module files', () => {
    const state = createDraftState(
      [entry('e1', 'glossary', 'OrderController', ['src/OrderController.java'])],
      [moduleDetails('m1', 'orders', ['src/OrderController.java'])]
    );

    const result = executeRefactorDraft(state, {
      operations: [
        {
          type: 'move-file',
          from: 'src/OrderController.java',
          to: 'src/api/OrderController.java',
        },
      ],
    });

    const updated = state.entries.get('e1');
    assert.equal(updated?.refs?.files?.[0], 'src/api/OrderController.java');
    assert.equal(state.modules.get('m1')?.files?.[0], 'src/api/OrderController.java');
    assert.equal(result.stats.entriesUpdated, 1);
    assert.equal(result.stats.modules, 1);
  });

  it('replace-path-prefix updates multiple entries', () => {
    const state = createDraftState(
      [
        entry('e1', 'glossary', 'A', ['src/orders/A.java']),
        entry('e2', 'glossary', 'B', ['src/orders/B.java']),
      ],
      [moduleDetails('m1', 'orders', ['src/orders/A.java', 'src/orders/B.java'])]
    );

    executeRefactorDraft(state, {
      operations: [
        {
          type: 'replace-path-prefix',
          fromPrefix: 'src/orders/',
          toPrefix: 'src/sales/orders/',
        },
      ],
    });

    assert.deepEqual(state.entries.get('e1')?.refs?.files, ['src/sales/orders/A.java']);
    assert.deepEqual(state.entries.get('e2')?.refs?.files, ['src/sales/orders/B.java']);
  });

  it('rename-text exact updates title and contains updates summary', () => {
    const state = createDraftState(
      [
        entry('e1', 'glossary', 'OrderService', ['src/OrderService.java']),
        entry('e2', 'flow', 'Order flow', ['src/Flow.java'], {
          summary: 'Uses OrderService internally',
        }),
      ],
      [moduleDetails('m1', 'orders')]
    );

    executeRefactorDraft(state, {
      operations: [
        {
          type: 'rename-text',
          from: 'OrderService',
          to: 'OrderApplicationService',
          fields: ['title'],
          match: 'exact',
        },
        {
          type: 'rename-text',
          from: 'OrderService',
          to: 'OrderApplicationService',
          fields: ['summary'],
          match: 'contains',
        },
      ],
      scope: { moduleName: 'orders' },
    });

    assert.equal(state.entries.get('e1')?.title, 'OrderApplicationService');
    assert.equal(state.entries.get('e2')?.summary, 'Uses OrderApplicationService internally');
  });

  it('rename-text updates payload strings', () => {
    const state = createDraftState(
      [
        entry('e1', 'http-endpoint', 'POST /orders', ['src/OrderController.java'], {
          payload: { method: 'POST', path: '/orders', handler: 'OrderController.create' },
        }),
      ],
      [moduleDetails('m1', 'orders')]
    );

    executeRefactorDraft(state, {
      operations: [
        {
          type: 'rename-text',
          from: 'OrderController',
          to: 'OrdersController',
          fields: ['payload'],
          match: 'contains',
        },
      ],
    });

    assert.equal(
      state.entries.get('e1')?.payload?.handler,
      'OrdersController.create'
    );
  });

  it('merge-files consolidates paths and dedupes', () => {
    const state = createDraftState(
      [
        entry('e1', 'glossary', 'OnlyB', ['src/B.java']),
        entry('e2', 'glossary', 'Both', ['src/A.java', 'src/B.java']),
      ],
      [moduleDetails('m1', 'orders')]
    );

    const result = executeRefactorDraft(state, {
      operations: [
        {
          type: 'merge-files',
          from: ['src/B.java'],
          to: 'src/C.java',
        },
      ],
    });

    assert.deepEqual(state.entries.get('e1')?.refs?.files, ['src/C.java']);
    assert.deepEqual(state.entries.get('e2')?.refs?.files, ['src/A.java', 'src/C.java']);
    assert.equal(result.stats.entriesDeleted, 0);
  });

  it('remove-file-ref with deleteIfEmpty removes orphan entry', () => {
    const state = createDraftState(
      [entry('e1', 'glossary', 'OnlyFile', ['src/Old.java'])],
      [moduleDetails('m1', 'orders', ['src/Old.java'])]
    );

    const result = executeRefactorDraft(state, {
      operations: [{ type: 'remove-file-ref', file: 'src/Old.java', deleteIfEmpty: true }],
    });

    assert.equal(state.entries.has('e1'), false);
    assert.deepEqual(state.modules.get('m1')?.files, []);
    assert.equal(result.stats.entriesDeleted, 1);
  });

  it('skips title rename on collision', () => {
    const state = createDraftState(
      [
        entry('e1', 'glossary', 'OrderService', ['src/A.java']),
        entry('e2', 'glossary', 'OrderApplicationService', ['src/B.java']),
      ],
      [moduleDetails('m1', 'orders')]
    );

    const result = executeRefactorDraft(state, {
      operations: [
        {
          type: 'rename-text',
          from: 'OrderService',
          to: 'OrderApplicationService',
          fields: ['title'],
          match: 'exact',
        },
      ],
    });

    assert.equal(state.entries.get('e1')?.title, 'OrderService');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? '', /already exists/);
  });

  it('scan does not mutate draft state', () => {
    const state = createDraftState(
      [entry('e1', 'glossary', 'OrderController', ['src/OrderController.java'])],
      [moduleDetails('m1', 'orders', ['src/OrderController.java'])]
    );

    const before = structuredClone(state);
    const result = executeRefactorDraft(state, {
      operations: [{ type: 'scan', file: 'src/OrderController.java' }],
    });

    assert.deepEqual(state, before);
    assert.equal(result.hits?.length, 2);
    assert.equal(result.stats.hits, 2);
    assert.equal(result.changes.length, 0);
  });

  it('patch-entry updates matched entry by kind and title', () => {
    const state = createDraftState(
      [entry('e1', 'http-endpoint', 'POST /orders', ['src/OrderController.java'])],
      [moduleDetails('m1', 'orders')]
    );

    executeRefactorDraft(state, {
      operations: [
        {
          type: 'patch-entry',
          match: { kind: 'http-endpoint', title: 'POST /orders' },
          set: {
            title: 'POST /v2/orders',
            payload: { method: 'POST', path: '/v2/orders' },
          },
        },
      ],
    });

    assert.equal(state.entries.get('e1')?.title, 'POST /v2/orders');
    assert.equal(state.entries.get('e1')?.payload?.path, '/v2/orders');
  });

  it('keeps entry with entryIds when files become empty', () => {
    const state = createDraftState(
      [
        entry('e1', 'flow', 'Order flow', ['src/Only.java'], {
          refs: { moduleName: 'orders', files: ['src/Only.java'], entryIds: ['e2'] },
        }),
      ],
      [moduleDetails('m1', 'orders')]
    );

    executeRefactorDraft(state, {
      operations: [{ type: 'remove-file-ref', file: 'src/Only.java' }],
    });

    assert.equal(state.entries.has('e1'), true);
    assert.deepEqual(state.entries.get('e1')?.refs?.files, []);
  });
});

describe('paginateRefactorResult', () => {
  it('paginates changes with hasMore', () => {
    const changes = Array.from({ length: 20 }, (_, index) => ({
      action: 'update' as const,
      target: 'entry' as const,
      id: `e${index}`,
      field: 'title',
      before: 'a',
      after: 'b',
    }));

    const page = paginateRefactorResult(
      true,
      undefined,
      changes,
      [],
      { modules: 0, entriesUpdated: 20, entriesDeleted: 0 },
      15,
      0
    );

    assert.equal(page.changes.length, 15);
    assert.equal(page.hasMore, true);
    assert.equal(page.offset, 0);
  });
});

describe('refactor limits', () => {
  it('assertRefactorOperationLimit rejects oversized batches', () => {
    assert.throws(
      () => assertRefactorOperationLimit(11),
      /Too many refactor operations/
    );
  });

  it('clampRefactorLimit defaults to 15', () => {
    assert.equal(clampRefactorLimit(), 15);
    assert.equal(clampRefactorOffset(), 0);
  });
});
