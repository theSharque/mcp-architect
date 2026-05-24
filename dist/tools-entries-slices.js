import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { BUILTIN_SLICES, buildSliceResponse, clampLimit, clampOffset, countEntriesForKinds, getBuiltinSlice, resolveSliceFilter, } from "./slices.js";
import { deleteEntry, deleteSlice, filterIndexItems, findEntryByKindTitle, loadEntries, readArchitecture, readEntry, readEntryIndex, readSlice, writeEntry, writeSlice, listSliceIds, } from "./storage.js";
import { migrateScriptsToEntries } from "./migrate-scripts.js";
import { ENTRIES_MODULE_REMINDER, buildEntryLinkHints } from "./agent-hints.js";
import { BULK_ENTRIES_WARN_THRESHOLD, MAX_BULK_ENTRIES, computeImportStats, deleteEntriesByFilter, replaceEntries, upsertFacts, validateImportEntries, } from "./entry-sync.js";
import { searchEntries } from "./entry-search.js";
import { loadCustomSlices } from "./slice-coverage.js";
const replaceScopeSchema = z.object({
    kind: z.string().optional().describe("Exact entry kind in scope"),
    kinds: z.array(z.string()).optional().describe("Entry kinds in scope"),
    moduleName: z.string().optional().describe("Only entries linked to this module"),
    tags: z.array(z.string()).optional().describe("Entries having any of these tags"),
});
const entryRefsSchema = z
    .object({
    moduleName: z
        .string()
        .optional()
        .describe("Module name from list-modules. Required when project has modules. Do not paste module description here—link by name."),
    files: z
        .array(z.string())
        .optional()
        .describe("Workspace-relative file paths where this fact lives"),
    entryIds: z
        .array(z.string())
        .optional()
        .describe("Related entry ids, e.g. flow steps pointing to other entries"),
})
    .optional();
const moduleFactRefsSchema = z
    .object({
    moduleName: z
        .string()
        .optional()
        .describe("Module name from list-modules; per-entry override of batch moduleName"),
    files: z
        .array(z.string())
        .optional()
        .describe("Workspace-relative file paths where this fact lives"),
    entryIds: z
        .array(z.string())
        .optional()
        .describe("Related entry ids, e.g. flow steps pointing to other entries"),
})
    .optional();
export const moduleFactSchema = z.object({
    kind: z.string(),
    title: z.string(),
    summary: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    refs: moduleFactRefsSchema,
    tags: z.array(z.string()).optional(),
});
async function saveSingleEntry(projectId, params) {
    const now = new Date().toISOString();
    let existing = null;
    if (params.id) {
        existing = await readEntry(projectId, params.id);
    }
    else {
        existing = await findEntryByKindTitle(projectId, params.kind, params.title);
    }
    const entryId = params.id ?? existing?.id ?? uuidv4();
    const entry = {
        id: entryId,
        kind: params.kind,
        title: params.title,
        summary: params.summary,
        payload: params.payload,
        refs: params.refs,
        tags: params.tags,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    await writeEntry(projectId, entry);
    return entry;
}
function entryLinkStructuredContent(entryId, entry, architecture) {
    const moduleNames = architecture?.modules.map((m) => m.name) ?? [];
    const linkHints = buildEntryLinkHints(moduleNames, entry.refs?.moduleName);
    return {
        entryId,
        message: `Entry '${entry.title}' saved`,
        ...linkHints,
    };
}
export function registerEntriesAndSlicesTools(server, resolveProjectId) {
    async function ensureMigrated(projectId) {
        await migrateScriptsToEntries(projectId);
    }
    server.registerTool("set-entry", {
        title: "Set Entry",
        description: `${ENTRIES_MODULE_REMINDER} Creates or updates one canonical project fact (entry). Use when you discovered a concrete fact while working. Do not use for module structure—use set-module-details. Do not copy module.description into summary; link via refs.moduleName only. Upsert: pass id to update, or omit id to match by kind+title or create new. Example: kind=http-endpoint, title='POST /orders', summary='Creates order', refs.moduleName='orders', refs.files=['src/OrderController.java'].`,
        inputSchema: {
            projectId: z
                .string()
                .optional()
                .describe("Project id from list-projects if workspace path may differ; defaults to MCP_PROJECT_ID"),
            id: z
                .string()
                .optional()
                .describe("Entry uuid; omit to upsert by kind+title or create new"),
            kind: z
                .string()
                .describe("Free-form type: http-endpoint, glossary, entity, flow, script, godot-scene, etc. Builtin slice list-slices shows recommended kinds per sliceId"),
            title: z
                .string()
                .describe("Short unique label for search, e.g. 'POST /orders' or 'Order'"),
            summary: z
                .string()
                .describe("1-2 sentences; not a module essay—only this fact"),
            payload: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Kind-specific extra fields only, e.g. method/path for APIs, steps for flow"),
            refs: entryRefsSchema,
            tags: z
                .array(z.string())
                .optional()
                .describe("Optional labels for get-slice query filtering"),
        },
        outputSchema: {
            entryId: z.string(),
            message: z.string(),
            reminder: z.string().optional(),
            warning: z.string().optional(),
            suggestedModuleNames: z.array(z.string()).optional(),
        },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const entry = await saveSingleEntry(projectId, params);
        const architecture = await readArchitecture(projectId);
        const structuredContent = entryLinkStructuredContent(entry.id, entry, architecture);
        const textParts = [`Entry saved: ${entry.title} (${entry.kind})`];
        if (structuredContent.reminder)
            textParts.push(structuredContent.reminder);
        if (structuredContent.warning)
            textParts.push(structuredContent.warning);
        return {
            content: [{ type: "text", text: textParts.join("\n") }],
            structuredContent,
        };
    });
    server.registerTool("set-entries", {
        title: "Set Entries",
        description: `${ENTRIES_MODULE_REMINDER} Bulk upsert entries (max ${MAX_BULK_ENTRIES} per call; warn above ${BULK_ENTRIES_WARN_THRESHOLD}). Set refs.moduleName per entry, or pass top-level moduleName as default for entries without refs.moduleName. Prefer replace-entries for full idempotent sync of a module/kind slice.`,
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            moduleName: z
                .string()
                .optional()
                .describe("Default refs.moduleName for entries that omit refs.moduleName"),
            entries: z
                .array(moduleFactSchema)
                .describe(`Array of facts to upsert (max ${MAX_BULK_ENTRIES})`),
        },
        outputSchema: {
            entriesCreated: z.number(),
            entriesUpdated: z.number(),
            entryIds: z.array(z.string()),
            message: z.string(),
            warning: z.string().optional(),
            reminder: z.string().optional(),
            suggestedModuleNames: z.array(z.string()).optional(),
        },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const upsert = await upsertFacts(projectId, params.entries, params.moduleName);
        const architecture = await readArchitecture(projectId);
        const moduleNames = architecture?.modules.map((m) => m.name) ?? [];
        const linkHints = buildEntryLinkHints(moduleNames, params.moduleName);
        const structuredContent = {
            ...upsert,
            message: `${upsert.entriesCreated} created, ${upsert.entriesUpdated} updated`,
            ...linkHints,
        };
        const textParts = [`Entries saved: ${structuredContent.message}`];
        if (upsert.warning) {
            textParts.push(upsert.warning);
        }
        if (linkHints.reminder) {
            textParts.push(linkHints.reminder);
        }
        if (linkHints.warning) {
            textParts.push(linkHints.warning);
        }
        return {
            content: [
                {
                    type: "text",
                    text: textParts.join("\n"),
                },
            ],
            structuredContent,
        };
    });
    server.registerTool("delete-entries", {
        title: "Delete Entries",
        description: "Bulk delete entries matching kind/moduleName/tags filter. Requires confirm=true. Use before full re-import or to clear a module slice. Prefer replace-entries with deleteOrphans for idempotent sync.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            kind: z.string().optional().describe("Exact entry kind"),
            kinds: z.array(z.string()).optional().describe("Entry kinds"),
            moduleName: z.string().optional().describe("Only entries linked to this module"),
            tags: z.array(z.string()).optional().describe("Entries having any of these tags"),
            confirm: z
                .boolean()
                .describe("Must be true to delete; safety guard against accidental bulk delete"),
        },
        outputSchema: {
            deleted: z.number(),
            message: z.string(),
        },
    }, async (params) => {
        if (!params.confirm) {
            return {
                content: [{ type: "text", text: "Bulk delete requires confirm: true" }],
                structuredContent: { deleted: 0, message: "Bulk delete requires confirm: true" },
            };
        }
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const result = await deleteEntriesByFilter(projectId, {
            kind: params.kind,
            kinds: params.kinds,
            moduleName: params.moduleName,
            tags: params.tags,
        });
        return {
            content: [{ type: "text", text: `Deleted ${result.deleted} entries` }],
            structuredContent: {
                deleted: result.deleted,
                message: `Deleted ${result.deleted} entries`,
            },
        };
    });
    server.registerTool("replace-entries", {
        title: "Replace Entries",
        description: "Idempotent sync: upsert entries in scope and optionally delete orphans not in the batch. Main tool for full API/UI catalog import—one call per module or kind. Match existing entries by upsertBy (default kind+title). Each entry may set refs.moduleName individually.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            scope: replaceScopeSchema.describe("Which existing entries participate in orphan deletion"),
            moduleName: z
                .string()
                .optional()
                .describe("Default refs.moduleName for entries without refs.moduleName"),
            upsertBy: z
                .array(z.enum(["kind", "title", "id"]))
                .optional()
                .describe("Fields used to match existing entries (default kind+title)"),
            entries: z
                .array(moduleFactSchema)
                .describe(`Full desired set for this scope (max ${MAX_BULK_ENTRIES})`),
            deleteOrphans: z
                .boolean()
                .optional()
                .describe("Delete scope entries missing from batch (default true)"),
        },
        outputSchema: {
            created: z.number(),
            updated: z.number(),
            deleted: z.number(),
            entryIds: z.array(z.string()),
            message: z.string(),
        },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const result = await replaceEntries(projectId, params.scope, params.entries, {
            upsertBy: params.upsertBy,
            deleteOrphans: params.deleteOrphans,
            batchModuleName: params.moduleName,
        });
        const message = `${result.created} created, ${result.updated} updated, ${result.deleted} deleted`;
        return {
            content: [{ type: "text", text: `Replace complete: ${message}` }],
            structuredContent: { ...result, message },
        };
    });
    server.registerTool("import-entries", {
        title: "Import Entries",
        description: "Alias for replace-entries with explicit import semantics. mode=replace performs full slice replacement (same as replace-entries). Pass filter as scope; entries is the complete desired set for that slice.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            mode: z
                .enum(["replace"])
                .describe("Only replace mode is supported (full slice sync)"),
            filter: replaceScopeSchema.describe("Scope filter (kind, moduleName, tags)"),
            moduleName: z
                .string()
                .optional()
                .describe("Default refs.moduleName for entries without refs.moduleName"),
            upsertBy: z
                .array(z.enum(["kind", "title", "id"]))
                .optional()
                .describe("Match keys (default kind+title)"),
            entries: z
                .array(moduleFactSchema)
                .describe(`Complete import batch (max ${MAX_BULK_ENTRIES})`),
            deleteOrphans: z
                .boolean()
                .optional()
                .describe("Delete scope entries missing from batch (default true)"),
        },
        outputSchema: {
            created: z.number(),
            updated: z.number(),
            deleted: z.number(),
            entryIds: z.array(z.string()),
            message: z.string(),
        },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const result = await replaceEntries(projectId, params.filter, params.entries, {
            upsertBy: params.upsertBy,
            deleteOrphans: params.deleteOrphans,
            batchModuleName: params.moduleName,
        });
        const message = `${result.created} created, ${result.updated} updated, ${result.deleted} deleted`;
        return {
            content: [{ type: "text", text: `Import complete: ${message}` }],
            structuredContent: { ...result, message },
        };
    });
    server.registerTool("validate-import", {
        title: "Validate Import",
        description: "Dry-run validation for a proposed import batch. Checks duplicate upsert keys and unknown moduleName refs without writing.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            entries: z.array(moduleFactSchema).describe("Proposed entries to validate"),
            upsertBy: z
                .array(z.enum(["kind", "title", "id"]))
                .optional()
                .describe("Match keys (default kind+title)"),
            checkDuplicates: z.boolean().optional().describe("Detect duplicate keys in batch (default true)"),
            checkModuleExists: z
                .boolean()
                .optional()
                .describe("Warn on unknown refs.moduleName (default true)"),
        },
        outputSchema: {
            valid: z.boolean(),
            warningCount: z.number(),
            warnings: z.array(z.object({
                code: z.string(),
                detail: z.string(),
                entryIndex: z.number().optional(),
            })),
        },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        const result = await validateImportEntries(projectId, params.entries, {
            upsertBy: params.upsertBy,
            checkDuplicates: params.checkDuplicates,
            checkModuleExists: params.checkModuleExists,
        });
        return {
            content: [
                {
                    type: "text",
                    text: result.valid
                        ? "Import validation passed"
                        : `Import validation: ${result.warningCount} warning(s)\n${result.warnings.map((w) => w.detail).join("\n")}`,
                },
            ],
            structuredContent: { ...result },
        };
    });
    server.registerTool("get-import-stats", {
        title: "Get Import Stats",
        description: "Returns entry counts grouped by kind, module, and tag. Use after replace-entries/import to verify catalog size.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
        },
        outputSchema: {
            byKind: z.record(z.string(), z.number()),
            byModule: z.record(z.string(), z.number()),
            byTag: z.record(z.string(), z.number()),
            total: z.number(),
        },
    }, async ({ projectId: provided }) => {
        const projectId = resolveProjectId(provided);
        await ensureMigrated(projectId);
        const entries = await loadEntries(projectId);
        const stats = computeImportStats(entries);
        return {
            content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
            structuredContent: { ...stats },
        };
    });
    server.registerTool("get-entry", {
        title: "Get Entry",
        description: "Returns one full entry by id. Use after list-entries or search-entries when you need payload and refs. Do not use for a full API list—use get-slice sliceId=api. Do not use for module structure—use get-module-details.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id; use list-projects if unsure"),
            id: z.string().describe("Entry id from list-entries or search-entries"),
        },
        outputSchema: { entry: z.any() },
    }, async ({ projectId: provided, id }) => {
        const projectId = resolveProjectId(provided);
        await ensureMigrated(projectId);
        const entry = await readEntry(projectId, id);
        if (!entry) {
            return {
                content: [{ type: "text", text: `Entry not found: ${id}` }],
                structuredContent: { entry: null },
            };
        }
        return {
            content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
            structuredContent: { entry },
        };
    });
    server.registerTool("delete-entry", {
        title: "Delete Entry",
        description: "Removes one entry and updates the index. Use when a fact is obsolete. Do not use to delete modules—use delete-module. Cannot delete slice definitions—use delete-slice.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            id: z.string().describe("Entry id to delete"),
        },
        outputSchema: { message: z.string() },
    }, async ({ projectId: provided, id }) => {
        const projectId = resolveProjectId(provided);
        await deleteEntry(projectId, id);
        return {
            content: [{ type: "text", text: `Entry deleted: ${id}` }],
            structuredContent: { message: `Entry ${id} deleted` },
        };
    });
    server.registerTool("list-entries", {
        title: "List Entries",
        description: "Returns the entry catalog (id, kind, title, tags, moduleName)—no payload. Supports kind/moduleName/tags filters and pagination (limit max 200). Unlinked entries lack moduleName; run validate after edits. For typed horizontal views use get-slice.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            kind: z.string().optional().describe("Filter by exact kind, e.g. http-endpoint"),
            moduleName: z.string().optional().describe("Filter by refs.moduleName"),
            tags: z
                .array(z.string())
                .optional()
                .describe("Filter entries having any of these tags"),
            query: z
                .string()
                .optional()
                .describe("Case-insensitive substring in title, kind, or tags"),
            limit: z.number().optional().describe("Max items (default 50, max 200)"),
            offset: z.number().optional().describe("Skip first N matches (default 0)"),
        },
        outputSchema: {
            entries: z.array(z.any()),
            total: z.number(),
            returned: z.number(),
            offset: z.number(),
            hasMore: z.boolean(),
        },
    }, async ({ projectId: provided, kind, moduleName, tags, query, limit, offset }) => {
        const projectId = resolveProjectId(provided);
        await ensureMigrated(projectId);
        const index = await readEntryIndex(projectId);
        const filtered = filterIndexItems(index.items, {
            kind,
            moduleName,
            tags,
            query,
        });
        const pageLimit = clampLimit(limit);
        const pageOffset = clampOffset(offset);
        const page = filtered.slice(pageOffset, pageOffset + pageLimit);
        const structuredContent = {
            entries: page,
            total: filtered.length,
            returned: page.length,
            offset: pageOffset,
            hasMore: pageOffset + page.length < filtered.length,
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(structuredContent, null, 2),
                },
            ],
            structuredContent,
        };
    });
    server.registerTool("search-entries", {
        title: "Search Entries",
        description: "Compact navigation search over entries by title, summary, kind, and tags. Returns snippet, matchedIn, slices, and moduleName per hit—use get-entry for full payload. Prefer get-slice when you know the category (api, domain). Filters (moduleName, kind, tags) narrow agent context. Default limit 10.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            query: z.string().describe("Search text"),
            moduleName: z
                .string()
                .optional()
                .describe("Exact filter on refs.moduleName"),
            kind: z.string().optional().describe("Exact filter on entry kind"),
            tags: z
                .array(z.string())
                .optional()
                .describe("Filter entries having any of these tags"),
            limit: z
                .number()
                .optional()
                .describe("Max results per page (default 10, max 50)"),
            offset: z
                .number()
                .optional()
                .describe("Skip first N matches (default 0)"),
        },
        outputSchema: {
            summary: z.string(),
            total: z.number(),
            returned: z.number(),
            offset: z.number(),
            hasMore: z.boolean(),
            results: z.array(z.object({
                id: z.string(),
                kind: z.string(),
                title: z.string(),
                summary: z.string(),
                tags: z.array(z.string()).optional(),
                refs: z
                    .object({
                    moduleName: z.string().optional(),
                    files: z.array(z.string()).optional(),
                    entryIds: z.array(z.string()).optional(),
                })
                    .optional(),
                snippet: z.string(),
                matchedIn: z.array(z.enum(["title", "summary", "kind", "tags"])),
                slices: z.array(z.string()),
                moduleName: z.string(),
            })),
        },
    }, async ({ projectId: provided, query, moduleName, kind, tags, limit, offset }) => {
        const projectId = resolveProjectId(provided);
        await ensureMigrated(projectId);
        const entries = await loadEntries(projectId, {
            kind,
            tags,
        });
        const customSlices = await loadCustomSlices(projectId);
        const response = searchEntries(entries, customSlices, {
            query,
            moduleName,
            kind,
            tags,
            limit,
            offset,
        });
        return {
            content: [
                {
                    type: "text",
                    text: `${response.summary}\n\n${JSON.stringify(response, null, 2)}`,
                },
            ],
            structuredContent: { ...response },
        };
    });
    server.registerTool("list-slices", {
        title: "List Slices",
        description: "Lists built-in and custom slice views (filters over entries—not separate stored data). Empty slice = no entries with matching kind, not a missing slice definition. Use before get-slice to pick sliceId (api, domain, persistence, …).",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
        },
        outputSchema: { slices: z.array(z.any()) },
    }, async ({ projectId: provided }) => {
        const projectId = resolveProjectId(provided);
        await ensureMigrated(projectId);
        const index = await readEntryIndex(projectId);
        const customIds = await listSliceIds(projectId);
        const builtins = BUILTIN_SLICES.map((b) => ({
            sliceId: b.id,
            title: b.title,
            description: b.description,
            builtin: true,
            entryCount: countEntriesForKinds(index.items, b.kinds),
            kinds: b.kinds,
        }));
        const custom = await Promise.all(customIds.map(async (id) => {
            const def = await readSlice(projectId, id);
            if (!def)
                return null;
            const kinds = def.filter.kinds ?? [];
            const tags = def.filter.tags;
            let entryCount = index.items.length;
            if (kinds.length || tags?.length) {
                const entries = await loadEntries(projectId, {
                    kinds: kinds.length ? kinds : undefined,
                    tags,
                });
                entryCount = entries.length;
            }
            return {
                sliceId: def.id,
                title: def.title,
                description: def.description ?? "",
                builtin: false,
                entryCount,
                kinds,
                tags,
            };
        }));
        const slices = [...builtins, ...custom.filter(Boolean)];
        return {
            content: [{ type: "text", text: JSON.stringify(slices, null, 2) }],
            structuredContent: { slices },
        };
    });
    const sliceFormatSchema = z
        .enum(["compact", "detail", "table"])
        .optional()
        .describe("compact=minimal list; detail=full entries; table=rows for API-like kinds (method/path columns)");
    server.registerTool("get-slice", {
        title: "Get Slice",
        description: "Returns a horizontal project view: filtered entries transformed for agents. Empty slice = no entries with matching kind. Call list-slices first to pick sliceId. format=compact default; table for api/ui slice. Use offset/limit for pagination. Filter further by moduleName or tags.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            sliceId: z
                .string()
                .describe("Built-in id (api, ui, domain, persistence, …) or custom id from list-slices"),
            moduleName: z.string().optional().describe("Filter by refs.moduleName"),
            tags: z
                .array(z.string())
                .optional()
                .describe("Filter entries having any of these tags"),
            query: z
                .string()
                .optional()
                .describe("Further filter by substring in title, summary, kind, tags"),
            format: sliceFormatSchema,
            limit: z.number().optional().describe("Max items (default 50, max 200)"),
            offset: z.number().optional().describe("Skip first N items after sort (default 0)"),
            includeModuleContext: z
                .boolean()
                .optional()
                .describe("If true, attach module name+description from architecture when refs.moduleName is set"),
        },
        outputSchema: { slice: z.any() },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        await ensureMigrated(projectId);
        const custom = (await readSlice(projectId, params.sliceId)) ?? null;
        const filter = resolveSliceFilter(params.sliceId, custom);
        if (!filter) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Unknown sliceId: ${params.sliceId}. Call list-slices for built-in and custom ids.`,
                    },
                ],
                structuredContent: { slice: null },
            };
        }
        const combinedFilter = {
            ...filter,
            moduleName: params.moduleName ?? filter.moduleName,
            tags: params.tags ?? filter.tags,
            query: params.query ?? filter.query,
        };
        const entries = await loadEntries(projectId, combinedFilter);
        const builtin = getBuiltinSlice(params.sliceId);
        const title = custom?.title ?? builtin?.title ?? params.sliceId;
        const format = (params.format ?? "compact");
        const architecture = params.includeModuleContext
            ? await readArchitecture(projectId)
            : null;
        const slice = buildSliceResponse(params.sliceId, title, entries, {
            format,
            limit: clampLimit(params.limit),
            offset: clampOffset(params.offset),
            query: undefined,
            includeModuleContext: params.includeModuleContext,
        }, architecture);
        return {
            content: [{ type: "text", text: JSON.stringify(slice, null, 2) }],
            structuredContent: { slice },
        };
    });
    server.registerTool("set-slice", {
        title: "Set Slice",
        description: "Saves a custom slice definition (filter only—no items). Items always live in entries. Use when built-in slices (api, domain, …) are not enough, e.g. filter kinds godot-scene + tag gameplay. Do not store duplicate entry text here. get-slice reads entries through this filter.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            id: z
                .string()
                .describe("Custom slice id (avoid colliding with built-in: api, domain, persistence, …)"),
            title: z.string().describe("Human-readable slice name"),
            description: z.string().optional().describe("When an agent should use this slice"),
            kinds: z
                .array(z.string())
                .optional()
                .describe("Include entries with any of these kind values"),
            tags: z
                .array(z.string())
                .optional()
                .describe("Include entries having any of these tags"),
        },
        outputSchema: { sliceId: z.string(), message: z.string() },
    }, async (params) => {
        const projectId = resolveProjectId(params.projectId);
        if (getBuiltinSlice(params.id)) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Cannot override built-in slice id: ${params.id}`,
                    },
                ],
                structuredContent: {
                    sliceId: params.id,
                    message: "Built-in slice ids are reserved",
                },
            };
        }
        const now = new Date().toISOString();
        const existing = await readSlice(projectId, params.id);
        const slice = {
            id: params.id,
            title: params.title,
            description: params.description,
            filter: {
                kinds: params.kinds,
                tags: params.tags,
            },
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        await writeSlice(projectId, slice);
        return {
            content: [{ type: "text", text: `Slice saved: ${slice.id}` }],
            structuredContent: {
                sliceId: slice.id,
                message: `Slice '${slice.title}' saved`,
            },
        };
    });
    server.registerTool("delete-slice", {
        title: "Delete Slice",
        description: "Deletes a custom slice definition only. Built-in slices (api, domain, …) cannot be deleted. Does not delete entries—use delete-entry.",
        inputSchema: {
            projectId: z.string().optional().describe("Project id"),
            sliceId: z.string().describe("Custom slice id from list-slices"),
        },
        outputSchema: { message: z.string() },
    }, async ({ projectId: provided, sliceId }) => {
        const projectId = resolveProjectId(provided);
        if (getBuiltinSlice(sliceId)) {
            return {
                content: [{ type: "text", text: `Cannot delete built-in slice: ${sliceId}` }],
                structuredContent: { message: "Built-in slices cannot be deleted" },
            };
        }
        await deleteSlice(projectId, sliceId);
        return {
            content: [{ type: "text", text: `Slice deleted: ${sliceId}` }],
            structuredContent: { message: `Slice ${sliceId} deleted` },
        };
    });
}
//# sourceMappingURL=tools-entries-slices.js.map