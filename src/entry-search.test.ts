import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries } from './entry-search.js';
import type { Entry, SliceDefinition } from './types.js';

const baseEntry = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'kind' | 'title' | 'summary'>): Entry {
  return { ...baseEntry, ...overrides };
}

describe('searchEntries', () => {
  const entries: Entry[] = [
    makeEntry({
      id: 'e1',
      kind: 'http-endpoint',
      title: 'POST /orders',
      summary: 'Creates order from cart',
      refs: { moduleName: 'orders' },
    }),
    makeEntry({
      id: 'e2',
      kind: 'glossary',
      title: 'Order',
      summary: 'Customer purchase aggregate',
      refs: { moduleName: 'domain' },
      tags: ['billing'],
    }),
    makeEntry({
      id: 'e3',
      kind: 'unknown-kind',
      title: 'Widget',
      summary: 'Tagged custom fact',
      tags: ['billing'],
    }),
  ];

  it('reports matchedIn for title matches', () => {
    const response = searchEntries(entries, [], { query: 'POST' });
    assert.equal(response.total, 1);
    assert.deepEqual(response.results[0]?.matchedIn, ['title']);
  });

  it('builds snippet excerpt for long summary matches', () => {
    const longSummary = `${'prefix '.repeat(20)}order target suffix`;
    const longEntries = [
      makeEntry({
        id: 'e-long',
        kind: 'glossary',
        title: 'Long',
        summary: longSummary,
      }),
    ];
    const response = searchEntries(longEntries, [], { query: 'order' });
    const snippet = response.results[0]?.snippet ?? '';
    assert.ok(snippet.includes('order'));
    assert.ok(snippet.length <= 122);
  });

  it('includes api slice for http-endpoint kind', () => {
    const response = searchEntries(entries, [], { query: 'order' });
    const apiHit = response.results.find((result) => result.id === 'e1');
    assert.ok(apiHit?.slices.includes('api'));
  });

  it('includes custom slice id when entry matches by tag', () => {
    const custom: SliceDefinition[] = [
      {
        id: 'billing',
        title: 'Billing',
        filter: { tags: ['billing'] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const response = searchEntries(entries, custom, { query: 'billing' });
    const tagged = response.results.find((result) => result.id === 'e2');
    assert.ok(tagged?.slices.includes('billing'));
  });

  it('filters by moduleName', () => {
    const response = searchEntries(entries, [], { query: 'order', moduleName: 'orders' });
    assert.equal(response.total, 1);
    assert.equal(response.results[0]?.moduleName, 'orders');
  });

  it('paginates results with hasMore', () => {
    const manyEntries = Array.from({ length: 25 }, (_, index) =>
      makeEntry({
        id: `e${index}`,
        kind: 'glossary',
        title: `Order term ${index}`,
        summary: 'order related',
      })
    );
    const response = searchEntries(manyEntries, [], {
      query: 'order',
      limit: 10,
      offset: 10,
    });
    assert.equal(response.total, 25);
    assert.equal(response.returned, 10);
    assert.equal(response.offset, 10);
    assert.equal(response.hasMore, true);
  });

  it('keeps legacy fields summary and refs', () => {
    const response = searchEntries(entries, [], { query: 'POST' });
    const hit = response.results[0];
    assert.equal(hit?.summary, 'Creates order from cart');
    assert.equal(hit?.refs?.moduleName, 'orders');
  });
});
