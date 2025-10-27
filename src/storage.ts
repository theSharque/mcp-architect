import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ProjectArchitecture, ModuleDetails, ScriptDocumentation } from './types.js';

const STORAGE_BASE_DIR = path.join(os.homedir(), '.mcp-architector');

/**
 * Get the storage directory for a specific project
 */
export function getProjectDir(projectId: string): string {
  return path.join(STORAGE_BASE_DIR, projectId);
}

/**
 * Get the path to the project architecture file
 */
export function getArchitectureFile(projectId: string): string {
  return path.join(getProjectDir(projectId), 'architecture.json');
}

/**
 * Get the path to a module details file
 */
export function getModuleFile(projectId: string, moduleId: string): string {
  return path.join(getProjectDir(projectId), 'modules', `${moduleId}.json`);
}

/**
 * Ensure the storage directory structure exists
 */
async function ensureDirectoryExists(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Initialize storage for a project
 */
export async function initializeProjectStorage(projectId: string): Promise<void> {
  const projectDir = getProjectDir(projectId);
  await ensureDirectoryExists(projectDir);
  await ensureDirectoryExists(path.join(projectDir, 'modules'));
}

/**
 * Read project architecture from storage
 */
export async function readArchitecture(projectId: string): Promise<ProjectArchitecture | null> {
  try {
    const filePath = getArchitectureFile(projectId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ProjectArchitecture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write project architecture to storage
 */
export async function writeArchitecture(
  projectId: string,
  architecture: ProjectArchitecture
): Promise<void> {
  await initializeProjectStorage(projectId);
  const filePath = getArchitectureFile(projectId);
  await fs.writeFile(filePath, JSON.stringify(architecture, null, 2), 'utf-8');
}

/**
 * Read module details from storage
 */
export async function readModule(projectId: string, moduleId: string): Promise<ModuleDetails | null> {
  try {
    const filePath = getModuleFile(projectId, moduleId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ModuleDetails;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write module details to storage
 */
export async function writeModule(
  projectId: string,
  moduleDetails: ModuleDetails
): Promise<void> {
  await initializeProjectStorage(projectId);
  const filePath = getModuleFile(projectId, moduleDetails.moduleId);
  await fs.writeFile(filePath, JSON.stringify(moduleDetails, null, 2), 'utf-8');
}

/**
 * List all modules in a project
 */
export async function listModules(projectId: string): Promise<string[]> {
  try {
    const modulesDir = path.join(getProjectDir(projectId), 'modules');
    const files = await fs.readdir(modulesDir);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete a module
 */
export async function deleteModule(projectId: string, moduleId: string): Promise<void> {
  const filePath = getModuleFile(projectId, moduleId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get the path to a script documentation file
 */
export function getScriptFile(projectId: string, scriptId: string): string {
  return path.join(getProjectDir(projectId), 'scripts', `${scriptId}.json`);
}

/**
 * Read script documentation from storage
 */
export async function readScript(projectId: string, scriptId: string): Promise<ScriptDocumentation | null> {
  try {
    const filePath = getScriptFile(projectId, scriptId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ScriptDocumentation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write script documentation to storage
 */
export async function writeScript(
  projectId: string,
  scriptDoc: ScriptDocumentation
): Promise<void> {
  await initializeProjectStorage(projectId);
  // Ensure scripts directory exists
  await ensureDirectoryExists(path.join(getProjectDir(projectId), 'scripts'));
  const filePath = getScriptFile(projectId, scriptDoc.scriptId);
  await fs.writeFile(filePath, JSON.stringify(scriptDoc, null, 2), 'utf-8');
}

/**
 * List all scripts in a project
 */
export async function listScripts(projectId: string): Promise<string[]> {
  try {
    const scriptsDir = path.join(getProjectDir(projectId), 'scripts');
    const files = await fs.readdir(scriptsDir);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Normalize project ID from workdir or user input
 */
export function normalizeProjectId(workdir?: string): string {
  if (!workdir || workdir === '') {
    throw new Error('Project ID is required (workdir context)');
  }
  
  // Use workdir as project ID, normalized for filesystem
  return workdir.replace(/[^a-zA-Z0-9_-]/g, '_');
}

