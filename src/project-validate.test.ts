import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProjectValidation } from './project-validate.js';
import type { ModuleDetails, ProjectArchitecture } from './types.js';

describe('runProjectValidation', () => {
  it('reports missing-architecture and entries-without-modules', async () => {
    const projectId = `test-validate-${Date.now()}`;
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { getProjectDir, getEntriesDir, initializeProjectStorage } = await import('./storage.js');

    await initializeProjectStorage(projectId);
    const entriesDir = getEntriesDir(projectId);
    await writeFile(
      `${entriesDir}/e1.json`,
      JSON.stringify({
        id: 'e1',
        kind: 'http-endpoint',
        title: 'GET /x',
        summary: 'x',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf-8'
    );
    await writeFile(
      `${entriesDir}/index.json`,
      JSON.stringify({
        items: [
          {
            id: 'e1',
            kind: 'http-endpoint',
            title: 'GET /x',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
      'utf-8'
    );

    const result = await runProjectValidation(projectId, {
      checkStorage: false,
      checkEmptySlices: false,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.kind === 'missing-architecture'));
    assert.ok(result.issues.some((i) => i.kind === 'entries-without-modules'));
    assert.ok(result.summary.includes('failed'));
    assert.equal(result.issueCount, result.issues.length);

    const { rm } = await import('node:fs/promises');
    await rm(getProjectDir(projectId), { recursive: true, force: true });
  });

  it('passes for consistent minimal project', async () => {
    const projectId = `test-validate-ok-${Date.now()}`;
    const { writeFile, rm } = await import('node:fs/promises');
    const {
      getProjectDir,
      getArchitectureFile,
      getModuleFile,
      getEntriesDir,
      initializeProjectStorage,
    } = await import('./storage.js');

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
      dataFlow: { core: { dependsOn: [], providesTo: [] } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeFile(getArchitectureFile(projectId), JSON.stringify(arch), 'utf-8');

    const details: ModuleDetails = {
      moduleId: 'm1',
      name: 'core',
      description: 'core',
      inputs: '',
      outputs: '',
      files: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeFile(getModuleFile(projectId, 'm1'), JSON.stringify(details), 'utf-8');
    await writeFile(`${getEntriesDir(projectId)}/index.json`, JSON.stringify({ items: [] }), 'utf-8');

    const result = await runProjectValidation(projectId, { checkEmptySlices: false });

    assert.equal(result.valid, true);
    assert.equal(result.issueCount, 0);
    assert.ok(result.summary.includes('passed'));

    await rm(getProjectDir(projectId), { recursive: true, force: true });
  });
});
