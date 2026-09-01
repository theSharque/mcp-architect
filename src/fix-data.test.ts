import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fixProjectData } from './fix-data.js';
import {
  getArchitectureFile,
  getEntriesDir,
  getProjectDir,
  initializeProjectStorage,
} from './storage.js';
import type { ProjectArchitecture } from './types.js';

describe('fixProjectData', () => {
  it('trims leftover JSON on architecture.json and rebuilds the index', async () => {
    const projectId = `test-fix-data-${Date.now()}`;
    await initializeProjectStorage(projectId);
    const arch: ProjectArchitecture = {
      projectId,
      description: 'test',
      modules: [
        {
          id: 'm1',
          name: 'core',
          description: 'core',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const leftover = 'ages": {}\n  },\n  "createdAt": "2026-07-18T10:06:00.004Z"\n}';
    await writeFile(getArchitectureFile(projectId), `${JSON.stringify(arch, null, 2)}${leftover}`, 'utf-8');
    await writeFile(
      `${getEntriesDir(projectId)}/e1.json`,
      JSON.stringify({
        id: 'e1',
        kind: 'glossary',
        title: 'Term',
        summary: 'x',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf-8'
    );
    await writeFile(
      `${getEntriesDir(projectId)}/index.json`,
      JSON.stringify({ items: [] }),
      'utf-8'
    );

    try {
      const result = await fixProjectData(projectId);
      assert.equal(result.repaired, 1);
      assert.equal(result.unreadable, 0);
      assert.equal(result.files[0]?.path, 'architecture.json');
      assert.ok((result.files[0]?.extraBytes ?? 0) > 0);
      assert.equal(result.indexItemCount, 1);
      const parsed = JSON.parse(await readFile(getArchitectureFile(projectId), 'utf-8')) as ProjectArchitecture;
      assert.equal(parsed.projectId, projectId);
      assert.equal(parsed.modules[0]?.name, 'core');
      assert.ok(result.summary.includes('architecture.json'));
    } finally {
      await rm(getProjectDir(projectId), { recursive: true, force: true });
    }
  });

  it('dryRun does not rewrite leftover JSON', async () => {
    const projectId = `test-fix-data-dry-${Date.now()}`;
    await initializeProjectStorage(projectId);
    const leftover = `${JSON.stringify({ ok: true }, null, 2)}ages": {}`;
    await writeFile(getArchitectureFile(projectId), leftover, 'utf-8');
    try {
      const result = await fixProjectData(projectId, { dryRun: true });
      assert.equal(result.dryRun, true);
      assert.equal(result.repaired, 1);
      const raw = await readFile(getArchitectureFile(projectId), 'utf-8');
      assert.equal(raw, leftover);
    } finally {
      await rm(getProjectDir(projectId), { recursive: true, force: true });
    }
  });

  it('reports truncated JSON as unreadable', async () => {
    const projectId = `test-fix-data-bad-${Date.now()}`;
    await initializeProjectStorage(projectId);
    await writeFile(getArchitectureFile(projectId), '{"projectId":', 'utf-8');
    try {
      const result = await fixProjectData(projectId);
      assert.equal(result.unreadable, 1);
      assert.equal(result.files[0]?.status, 'unreadable');
    } finally {
      await rm(getProjectDir(projectId), { recursive: true, force: true });
    }
  });
});
