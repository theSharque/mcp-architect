import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getProjectDir,
  isScriptsMigrated,
  setMigratedScriptsFlag,
  writeEntry,
} from './storage.js';
import type { Entry } from './types.js';

interface LegacyScriptDocumentation {
  scriptId: string;
  scriptName: string;
  description: string;
  usage: string;
  examples: string[];
  parameters: Record<string, string>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

function getScriptsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'scripts');
}

async function listLegacyScriptIds(projectId: string): Promise<string[]> {
  try {
    const files = await fs.readdir(getScriptsDir(projectId));
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readLegacyScript(
  projectId: string,
  scriptId: string
): Promise<LegacyScriptDocumentation | null> {
  try {
    const content = await fs.readFile(
      path.join(getScriptsDir(projectId), `${scriptId}.json`),
      'utf-8'
    );
    return JSON.parse(content) as LegacyScriptDocumentation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function removeScriptsDirectory(projectId: string): Promise<void> {
  await fs.rm(getScriptsDir(projectId), { recursive: true, force: true });
}

function scriptToEntry(script: LegacyScriptDocumentation): Entry {
  return {
    id: script.scriptId,
    kind: 'script',
    title: script.scriptName,
    summary: script.description,
    payload: {
      usage: script.usage,
      examples: script.examples,
      parameters: script.parameters,
      notes: script.notes ?? '',
    },
    tags: ['script', 'migrated'],
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };
}

export async function migrateScriptsToEntries(projectId: string): Promise<{
  migrated: boolean;
  count: number;
}> {
  if (await isScriptsMigrated(projectId)) {
    await removeScriptsDirectory(projectId);
    return { migrated: false, count: 0 };
  }

  const scriptIds = await listLegacyScriptIds(projectId);
  let count = 0;

  for (const scriptId of scriptIds) {
    const script = await readLegacyScript(projectId, scriptId);
    if (!script) {
      continue;
    }
    await writeEntry(projectId, scriptToEntry(script));
    count += 1;
  }

  await setMigratedScriptsFlag(projectId);
  await removeScriptsDirectory(projectId);

  return { migrated: count > 0, count };
}
