import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const writeLocks = new Map();
function extraDataPosition(error) {
    if (!(error instanceof SyntaxError)) {
        return null;
    }
    const match = /position (\d+)/i.exec(error.message);
    if (!match) {
        return null;
    }
    const position = Number(match[1]);
    return Number.isFinite(position) && position > 0 ? position : null;
}
function endOfFirstJsonValue(text) {
    let i = 0;
    while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) {
        i++;
    }
    if (i >= text.length) {
        return null;
    }
    const start = text[i];
    if (start !== '{' && start !== '[') {
        return null;
    }
    const close = start === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (c === '\\') {
                escape = true;
                continue;
            }
            if (c === '"') {
                inString = false;
            }
            continue;
        }
        if (c === '"') {
            inString = true;
            continue;
        }
        if (c === start) {
            depth++;
        }
        else if (c === close) {
            depth--;
            if (depth === 0) {
                return i + 1;
            }
        }
    }
    return null;
}
function scanFirstJsonEnd(content) {
    const scanned = endOfFirstJsonValue(content);
    if (scanned === null) {
        return null;
    }
    try {
        JSON.parse(content.slice(0, scanned));
        return scanned;
    }
    catch {
        return null;
    }
}
function recoverEnd(content, error) {
    const position = extraDataPosition(error);
    if (position !== null) {
        try {
            JSON.parse(content.slice(0, position));
            return position;
        }
        catch {
            return scanFirstJsonEnd(content);
        }
    }
    return scanFirstJsonEnd(content);
}
export function parseJsonDocument(content) {
    try {
        return { value: JSON.parse(content), extraBytes: 0 };
    }
    catch (error) {
        const end = recoverEnd(content, error);
        if (end === null) {
            throw error;
        }
        const leftover = content.slice(end);
        return {
            value: JSON.parse(content.slice(0, end)),
            extraBytes: Buffer.byteLength(leftover, 'utf8'),
        };
    }
}
async function writeJsonAtomicUnlocked(filePath, value) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    const payload = JSON.stringify(value, null, 2);
    try {
        await fs.writeFile(tmpPath, payload, { encoding: 'utf-8', flag: 'w', flush: true });
        await fs.rename(tmpPath, filePath);
    }
    catch (error) {
        await fs.unlink(tmpPath).catch(() => undefined);
        throw error;
    }
}
export async function writeJsonAtomic(filePath, value) {
    const previous = writeLocks.get(filePath) ?? Promise.resolve();
    const current = previous.then(() => writeJsonAtomicUnlocked(filePath, value), () => writeJsonAtomicUnlocked(filePath, value));
    writeLocks.set(filePath, current.then(() => undefined, () => undefined));
    await current;
}
export async function readJsonFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseJsonDocument(content);
    if (parsed.extraBytes > 0) {
        await writeJsonAtomic(filePath, parsed.value);
    }
    return parsed.value;
}
//# sourceMappingURL=json-store.js.map