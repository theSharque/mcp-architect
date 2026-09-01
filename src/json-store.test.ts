import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseJsonDocument, readJsonFile, writeJsonAtomic } from './json-store.js';

describe('parseJsonDocument', () => {
  it('returns the value when JSON is valid', () => {
    const parsed = parseJsonDocument('{"a":1}');
    assert.deepEqual(parsed.value, { a: 1 });
    assert.equal(parsed.extraBytes, 0);
  });

  it('recovers the first object when leftover bytes follow', () => {
    const first = {
      projectId: '_qs_noon',
      dataFlow: { 'encyclopedia-part-images': {} },
      createdAt: '2026-07-18T10:06:00.004Z',
      updatedAt: '2026-08-28T16:34:03.967Z',
    };
    const leftover = 'ages": {}\n  },\n  "createdAt": "2026-07-18T10:06:00.004Z"\n}';
    const content = `${JSON.stringify(first, null, 2)}${leftover}`;
    const parsed = parseJsonDocument<typeof first>(content);
    assert.equal(parsed.value.projectId, '_qs_noon');
    assert.deepEqual(parsed.value.dataFlow, { 'encyclopedia-part-images': {} });
    assert.equal(parsed.extraBytes, Buffer.byteLength(leftover, 'utf8'));
  });

  it('throws when JSON is truncated', () => {
    assert.throws(() => parseJsonDocument('{"a":'), SyntaxError);
  });
});

describe('writeJsonAtomic', () => {
  it('leaves valid JSON after concurrent shorter and longer writes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'json-store-'));
    const filePath = path.join(dir, 'architecture.json');
    const long = { a: 'x'.repeat(8000), k: 1 };
    const short = { a: 'y', k: 2 };
    try {
      await writeJsonAtomic(filePath, long);
      await Promise.all([
        writeJsonAtomic(filePath, long),
        writeJsonAtomic(filePath, short),
        writeJsonAtomic(filePath, long),
        writeJsonAtomic(filePath, short),
      ]);
      const raw = await readFile(filePath, 'utf-8');
      const value = JSON.parse(raw) as { k: number };
      assert.ok(value.k === 1 || value.k === 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('readJsonFile', () => {
  it('rewrites leftover extra data so the file parses', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'json-store-read-'));
    const filePath = path.join(dir, 'architecture.json');
    const first = { projectId: 'p', modules: [{ name: 'core' }] };
    try {
      await writeFile(filePath, `${JSON.stringify(first, null, 2)}ages": {}\n}`, 'utf-8');
      const value = await readJsonFile<typeof first>(filePath);
      assert.equal(value.projectId, 'p');
      const raw = await readFile(filePath, 'utf-8');
      assert.deepEqual(JSON.parse(raw), first);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
