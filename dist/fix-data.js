import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseJsonDocument, writeJsonAtomic } from './json-store.js';
import { getArchitectureFile, getEntriesDir, getModulesDir, getProjectDir, getSlicesDir, rebuildEntryIndex, } from './storage.js';
const MAX_REPORT_FILES = 50;
async function listDirNames(dir) {
    try {
        return await fs.readdir(dir);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}
async function collectCatalogFiles(projectId) {
    const jsonFiles = [];
    const tmpFiles = [];
    const projectDir = getProjectDir(projectId);
    const architectureFile = getArchitectureFile(projectId);
    for (const name of await listDirNames(projectDir)) {
        const abs = path.join(projectDir, name);
        if (name === path.basename(architectureFile)) {
            jsonFiles.push(abs);
        }
        else if (name.endsWith('.tmp')) {
            tmpFiles.push(abs);
        }
    }
    for (const dir of [getModulesDir(projectId), getEntriesDir(projectId), getSlicesDir(projectId)]) {
        for (const name of await listDirNames(dir)) {
            const abs = path.join(dir, name);
            if (name.endsWith('.json')) {
                jsonFiles.push(abs);
            }
            else if (name.endsWith('.tmp')) {
                tmpFiles.push(abs);
            }
        }
    }
    return { jsonFiles, tmpFiles };
}
function rel(projectId, abs) {
    return path.relative(getProjectDir(projectId), abs);
}
function buildSummary(result) {
    const parts = [];
    if (result.dryRun) {
        parts.push('Dry run');
    }
    if (result.repaired === 0 && result.unreadable === 0 && result.tmpFound === 0) {
        const indexBit = result.dryRun
            ? `index ${result.indexItemCount} entries`
            : `rebuilt index: ${result.indexItemCount} entries`;
        parts.push(`Catalog JSON is valid (${result.scanned} files, ${indexBit})`);
        return `${parts.join('. ')}.`;
    }
    if (result.repaired > 0) {
        const first = result.files.find((f) => f.status === 'repaired');
        const hint = first ? ` (${first.path}, ${first.extraBytes} leftover bytes)` : '';
        parts.push(`Repaired ${result.repaired} file(s)${hint}`);
    }
    if (result.unreadable > 0) {
        parts.push(`${result.unreadable} unreadable`);
    }
    if (result.tmpFound > 0) {
        parts.push(result.dryRun
            ? `${result.tmpFound} tmp file(s) would be removed`
            : `Removed ${result.tmpRemoved} tmp file(s)`);
    }
    if (!result.dryRun) {
        parts.push(`Rebuilt index: ${result.indexItemCount} entries`);
    }
    return `${parts.join('. ')}.`;
}
export async function fixProjectData(projectId, options = {}) {
    const dryRun = options.dryRun ?? false;
    const { jsonFiles, tmpFiles } = await collectCatalogFiles(projectId);
    const files = [];
    let repaired = 0;
    let unreadable = 0;
    for (const filePath of jsonFiles) {
        let content;
        try {
            content = await fs.readFile(filePath, 'utf-8');
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
        try {
            const parsed = parseJsonDocument(content);
            if (parsed.extraBytes === 0) {
                continue;
            }
            if (!dryRun) {
                await writeJsonAtomic(filePath, parsed.value);
            }
            repaired++;
            if (files.length < MAX_REPORT_FILES) {
                files.push({
                    path: rel(projectId, filePath),
                    status: 'repaired',
                    extraBytes: parsed.extraBytes,
                });
            }
        }
        catch (error) {
            unreadable++;
            if (files.length < MAX_REPORT_FILES) {
                files.push({
                    path: rel(projectId, filePath),
                    status: 'unreadable',
                    detail: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    let tmpRemoved = 0;
    if (!dryRun) {
        for (const tmpPath of tmpFiles) {
            try {
                await fs.unlink(tmpPath);
                tmpRemoved++;
            }
            catch {
                continue;
            }
        }
    }
    let indexItemCount = 0;
    if (!dryRun) {
        const index = await rebuildEntryIndex(projectId);
        indexItemCount = index.items.length;
    }
    else {
        try {
            const indexPath = path.join(getEntriesDir(projectId), 'index.json');
            const content = await fs.readFile(indexPath, 'utf-8');
            const parsed = parseJsonDocument(content);
            indexItemCount = Array.isArray(parsed.value.items) ? parsed.value.items.length : 0;
        }
        catch {
            indexItemCount = 0;
        }
    }
    const summary = buildSummary({
        scanned: jsonFiles.length,
        repaired,
        unreadable,
        tmpRemoved,
        tmpFound: tmpFiles.length,
        indexItemCount,
        dryRun,
        files,
    });
    return {
        projectId,
        scanned: jsonFiles.length,
        repaired,
        unreadable,
        tmpRemoved: dryRun ? tmpFiles.length : tmpRemoved,
        indexItemCount,
        files,
        summary,
        dryRun,
    };
}
//# sourceMappingURL=fix-data.js.map