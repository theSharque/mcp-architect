#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { readArchitecture, writeArchitecture, readModule, writeModule, deleteModule, listProjects, normalizeProjectId, rebuildEntryIndex, } from "./storage.js";
import { registerEntriesAndSlicesTools } from "./tools-entries-slices.js";
import { MODULE_ENTRIES_REMINDER, suggestKindsFromFiles } from "./agent-hints.js";
import { upsertFacts, MAX_BULK_ENTRIES } from "./entry-sync.js";
import { BULK_BATCH_GUIDANCE } from "./agent-hints.js";
import { runProjectValidation } from "./project-validate.js";
import { buildDataFlowFromDependsOn, buildDataFlowFromModules, diffFlowEdges, mergeDataFlow, mergeModules, pruneDataFlow, recomputeProvidesTo, removeModuleFromDataFlow, syncModuleDependsOn, } from "./data-flow.js";
function resolveProjectId(provided) {
    return provided || globalProjectId || "default-project";
}
async function loadModuleDetailsMap(projectId, architecture) {
    const map = new Map();
    for (const mod of architecture.modules) {
        const details = await readModule(projectId, mod.id);
        if (details) {
            map.set(mod.name, details);
        }
    }
    return map;
}
const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf-8"));
const server = new McpServer({
    name: "mcp-architector",
    version: packageJson.version,
});
// Store the project ID from environment
let globalProjectId = null;
// Try to get project ID from environment on startup
const envProjectId = process.env.MCP_PROJECT_ID;
if (envProjectId) {
    globalProjectId = normalizeProjectId(envProjectId);
    console.error(`Initialized with project ID from env: ${globalProjectId}`);
}
/**
 * Tool: Create or update project architecture
 */
server.registerTool("set-project-architecture", {
    title: "Set Project Architecture",
    description: "Creates or updates vertical module structure (components and dataFlow)—not horizontal facts. By default merges modules and dataFlow by name; omit dataFlow to keep existing flow. Use replaceModules or replaceDataFlow for full replace. For one module use set-module-details or set-module-data-flow. For bulk flow rebuild use rebuild-data-flow. Each new module still needs entries—use set-module-details with facts[] or set-entries after bulk structure. For APIs, domain terms, scripts use set-entry + get-slice—not this tool. If projectId is wrong, call list-projects first. Do not duplicate entry text in module descriptions.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        description: z.string().describe("Overall project description"),
        modules: z.array(z.object({
            name: z.string().describe("Module name"),
            description: z.string().describe("Brief description of the module"),
            inputs: z.string().optional().describe("What this module requires to work"),
            outputs: z.string().optional().describe("What this module produces or generates"),
        })).describe("List of modules in the project"),
        dataFlow: z.record(z.string(), z.object({
            dependsOn: z.array(z.string()).optional().describe("Modules this module depends on"),
            providesTo: z.array(z.string()).optional().describe("Modules that receive data from this module"),
            dataTransformation: z.string().optional().describe("How data is transformed between modules"),
        })).optional().describe("Data flow between modules; omit to preserve existing"),
        replaceModules: z.boolean().optional().describe("Replace entire modules list (default false = merge by name)"),
        replaceDataFlow: z.boolean().optional().describe("Replace entire dataFlow (default false = merge by module name)"),
    },
    outputSchema: {
        projectId: z.string(),
        message: z.string(),
    },
}, async ({ description, modules, dataFlow, replaceModules, replaceDataFlow, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const existing = await readArchitecture(projectId);
    const now = new Date().toISOString();
    const moduleSummaries = modules.map((module) => {
        const existingModule = existing?.modules.find((m) => m.name === module.name);
        return {
            id: existingModule?.id ?? uuidv4(),
            name: module.name,
            description: module.description,
            inputs: module.inputs ?? existingModule?.inputs,
            outputs: module.outputs ?? existingModule?.outputs,
            createdAt: existingModule?.createdAt ?? now,
            updatedAt: now,
        };
    });
    const mergedModules = mergeModules(existing?.modules, moduleSummaries, {
        replace: replaceModules ?? false,
    });
    const moduleNames = mergedModules.map((m) => m.name);
    let mergedFlow = mergeDataFlow(existing?.dataFlow, dataFlow, {
        replace: replaceDataFlow ?? false,
    });
    if (mergedFlow) {
        mergedFlow = recomputeProvidesTo(mergedFlow, moduleNames);
    }
    const architecture = {
        projectId,
        description,
        modules: mergedModules,
        dataFlow: mergedFlow,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    await writeArchitecture(projectId, architecture);
    return {
        content: [
            {
                type: "text",
                text: `Project architecture saved for: ${projectId}`,
            },
        ],
        structuredContent: {
            projectId,
            message: `Architecture updated with ${mergedModules.length} modules`,
        },
    };
});
/**
 * Tool: Get project architecture
 */
server.registerTool("get-project-architecture", {
    title: "Get Project Architecture",
    description: "Returns vertical structure: project description, module list, dataFlow. Use for refactoring boundaries between components. For all HTTP endpoints or domain terms use get-slice—not this tool. For one module's files and examples use get-module-details. projectId from list-projects if unsure.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        architecture: z.any(),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [
                {
                    type: "text",
                    text: `No architecture found for project: ${projectId}`,
                },
            ],
            structuredContent: {
                architecture: null,
            },
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(architecture, null, 2),
            },
        ],
        structuredContent: {
            architecture,
        },
    };
});
server.registerTool("list-projects", {
    title: "List Projects",
    description: "Lists all projects in ~/.mcp-architector with projectId, description, moduleCount, updatedAt, isCurrent. Call first when tools return empty/wrong project—the workspace path may normalize to a different id (e.g. _qs_my-app). Then pass projectId to other tools. Optional query filters by id or description.",
    inputSchema: {
        query: z.string().optional().describe("Filter by substring in projectId or description"),
    },
    outputSchema: {
        projects: z.array(z.any()),
    },
}, async ({ query }) => {
    const projects = await listProjects(globalProjectId, query);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(projects, null, 2),
            },
        ],
        structuredContent: {
            projects,
        },
    };
});
/**
 * Tool: Set module details
 */
const moduleFactRefsSchema = z
    .object({
    moduleName: z.string().optional().describe("Module name; set-module-details sets this automatically"),
    files: z.array(z.string()).optional(),
    entryIds: z.array(z.string()).optional(),
})
    .optional();
const moduleFactSchema = z.object({
    kind: z.string(),
    title: z.string(),
    summary: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    refs: moduleFactRefsSchema,
    tags: z.array(z.string()).optional(),
});
server.registerTool("set-module-details", {
    title: "Set Module Details",
    description: "Creates or updates one vertical module (files, dependencies, dataFlow sync). IMPORTANT: Slices (api, domain, persistence) are built from entries, not from module text. When adding or updating a module, also add entries this module owns: pass facts[] (http-endpoint, entity, glossary, …) in this call (max 50 per call), or call set-entry / set-entries in 50-entry batches with refs.moduleName=<module name>. " +
        BULK_BATCH_GUIDANCE +
        " Without entries, get-slice will be empty for this module. After edits call validate to verify links. Does not replace other modules. Prefer over set-project-architecture for single-module edits.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        name: z.string().describe("Module name"),
        description: z.string().describe("Detailed description of the module"),
        inputs: z.string().describe("What the module accepts as input"),
        outputs: z.string().describe("What the module produces as output"),
        dependencies: z.array(z.string()).optional().describe("List of module dependencies"),
        files: z
            .array(z.string())
            .optional()
            .describe("Files belonging to this module; add matching entry kinds per Controller/Repository"),
        facts: z
            .array(moduleFactSchema)
            .max(MAX_BULK_ENTRIES)
            .optional()
            .describe(`Horizontal facts for this module (APIs, entities, terms). Max ${MAX_BULK_ENTRIES} per call; use set-entries for more. Each becomes an entry with refs.moduleName set automatically.`),
        usageExamples: z.array(z.object({
            title: z.string().describe("Example title"),
            description: z.string().optional().describe("Description of the example"),
            command: z.string().optional().describe("Command or code snippet"),
            input: z.string().optional().describe("Input data"),
            output: z.string().optional().describe("Expected output"),
            notes: z.string().optional().describe("Additional notes about this example")
        })).optional().describe("Usage examples for this module"),
        notes: z.string().optional().describe("Additional notes or comments"),
    },
    outputSchema: {
        moduleId: z.string(),
        message: z.string(),
        entriesCreated: z.number().optional(),
        entriesUpdated: z.number().optional(),
        entryIds: z.array(z.string()).optional(),
        reminder: z.string().optional(),
        suggestedKinds: z.array(z.string()).optional(),
    },
}, async ({ name, description, inputs, outputs, dependencies, files, usageExamples, notes, facts, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const now = new Date().toISOString();
    const architecture = await readArchitecture(projectId);
    let moduleId;
    let existingDetails = null;
    if (architecture) {
        const existingModule = architecture.modules.find((m) => m.name === name);
        moduleId = existingModule ? existingModule.id : uuidv4();
        existingDetails = await readModule(projectId, moduleId);
        if (existingModule) {
            existingModule.description = description;
            existingModule.inputs = inputs;
            existingModule.outputs = outputs;
            existingModule.updatedAt = now;
        }
        else {
            architecture.modules.push({
                id: moduleId,
                name,
                description,
                inputs,
                outputs,
                createdAt: now,
                updatedAt: now,
            });
        }
        if (dependencies !== undefined) {
            architecture.dataFlow = syncModuleDependsOn(architecture.dataFlow ?? {}, name, dependencies, architecture.modules.map((m) => m.name));
        }
        architecture.updatedAt = now;
        await writeArchitecture(projectId, architecture);
    }
    else {
        moduleId = uuidv4();
    }
    const moduleDetails = {
        moduleId,
        name,
        description,
        inputs,
        outputs,
        dependencies: dependencies ?? existingDetails?.dependencies ?? [],
        files: files ?? existingDetails?.files ?? [],
        usageExamples: usageExamples ?? existingDetails?.usageExamples ?? [],
        notes: notes ?? existingDetails?.notes ?? "",
        createdAt: existingDetails?.createdAt ?? now,
        updatedAt: now,
    };
    await writeModule(projectId, moduleDetails);
    let entriesCreated = 0;
    let entriesUpdated = 0;
    let entryIds = [];
    if (facts?.length) {
        const upsert = await upsertFacts(projectId, facts, name);
        entriesCreated = upsert.entriesCreated;
        entriesUpdated = upsert.entriesUpdated;
        entryIds = upsert.entryIds;
    }
    const moduleFiles = moduleDetails.files ?? [];
    const suggestedKinds = suggestKindsFromFiles(moduleFiles);
    const needsReminder = entriesCreated + entriesUpdated === 0;
    const structuredContent = {
        moduleId,
        message: `Module '${name}' saved successfully`,
        entriesCreated,
        entriesUpdated,
        entryIds,
    };
    if (needsReminder) {
        structuredContent.reminder = MODULE_ENTRIES_REMINDER;
        if (suggestedKinds.length > 0) {
            structuredContent.suggestedKinds = suggestedKinds;
        }
    }
    else {
        structuredContent.message = `Module '${name}' saved with ${entriesCreated + entriesUpdated} linked entries`;
    }
    const textParts = [`Module details saved: ${name}`];
    if (entriesCreated + entriesUpdated > 0) {
        textParts.push(`Entries: ${entriesCreated} created, ${entriesUpdated} updated`);
    }
    if (needsReminder) {
        textParts.push(MODULE_ENTRIES_REMINDER);
        if (suggestedKinds.length > 0) {
            textParts.push(`Suggested kinds: ${suggestedKinds.join(", ")}`);
        }
    }
    return {
        content: [{ type: "text", text: textParts.join("\n") }],
        structuredContent,
    };
});
/**
 * Tool: Get module details
 */
server.registerTool("get-module-details", {
    title: "Get Module Details",
    description: "Returns one module's full detail (files, dependencies, examples). Use when you know the module name from get-project-architecture or list-modules. If module has files but get-slice is empty, add entries with refs.moduleName=this module. For cross-cutting API/domain lists use get-slice. moduleName must match architecture exactly.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        moduleName: z.string().describe("Name of the module to retrieve"),
    },
    outputSchema: {
        module: z.any(),
    },
}, async ({ moduleName, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [
                {
                    type: "text",
                    text: `No architecture found for project: ${projectId}`,
                },
            ],
            structuredContent: {
                module: null,
            },
        };
    }
    const module = architecture.modules.find((m) => m.name === moduleName);
    if (!module) {
        return {
            content: [
                {
                    type: "text",
                    text: `Module '${moduleName}' not found`,
                },
            ],
            structuredContent: {
                module: null,
            },
        };
    }
    const moduleDetails = await readModule(projectId, module.id);
    if (!moduleDetails) {
        return {
            content: [
                {
                    type: "text",
                    text: `No details found for module: ${moduleName}`,
                },
            ],
            structuredContent: {
                module: { ...module, details: null },
            },
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(moduleDetails, null, 2),
            },
        ],
        structuredContent: {
            module: moduleDetails,
        },
    };
});
/**
 * Tool: List all modules
 */
server.registerTool("list-modules", {
    title: "List All Modules",
    description: "Lists module summaries from architecture (name, description)—vertical structure only. For horizontal facts (endpoints, tables, terms) use list-slices then get-slice. After edits run validate. Use module names in set-entry refs.moduleName.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        modules: z.array(z.any()),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [
                {
                    type: "text",
                    text: `No architecture found for project: ${projectId}`,
                },
            ],
            structuredContent: {
                modules: [],
            },
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(architecture.modules, null, 2),
            },
        ],
        structuredContent: {
            modules: architecture.modules,
        },
    };
});
server.registerTool("set-module-data-flow", {
    title: "Set Module Data Flow",
    description: "Patches dataFlow for one module (dependsOn is canonical; providesTo is recomputed). Syncs module file dependencies. Prefer over set-project-architecture for single-module graph edits.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        moduleName: z.string().describe("Module name"),
        dependsOn: z.array(z.string()).optional().describe("Modules this module depends on"),
        dataTransformation: z.string().optional().describe("How data is transformed between modules"),
        syncInverse: z.boolean().optional().describe("Recompute providesTo from dependsOn (default true)"),
    },
    outputSchema: {
        moduleName: z.string(),
        message: z.string(),
    },
}, async ({ moduleName, dependsOn, dataTransformation, syncInverse, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [{ type: "text", text: `No architecture found for project: ${projectId}` }],
            structuredContent: { moduleName, message: `Architecture not found for project: ${projectId}` },
        };
    }
    const mod = architecture.modules.find((m) => m.name === moduleName);
    if (!mod) {
        return {
            content: [{ type: "text", text: `Module '${moduleName}' not found` }],
            structuredContent: { moduleName, message: `Module '${moduleName}' not found` },
        };
    }
    const moduleNames = architecture.modules.map((m) => m.name);
    const flow = { ...(architecture.dataFlow ?? {}) };
    const entry = { ...(flow[moduleName] ?? {}) };
    if (dependsOn !== undefined) {
        entry.dependsOn = dependsOn;
    }
    if (dataTransformation !== undefined) {
        entry.dataTransformation = dataTransformation;
    }
    flow[moduleName] = entry;
    architecture.dataFlow =
        syncInverse ?? true
            ? recomputeProvidesTo(flow, moduleNames)
            : flow;
    architecture.updatedAt = new Date().toISOString();
    await writeArchitecture(projectId, architecture);
    if (dependsOn !== undefined) {
        const existingDetails = await readModule(projectId, mod.id);
        const now = new Date().toISOString();
        await writeModule(projectId, {
            moduleId: mod.id,
            name: moduleName,
            description: existingDetails?.description ?? mod.description,
            inputs: existingDetails?.inputs ?? mod.inputs ?? "",
            outputs: existingDetails?.outputs ?? mod.outputs ?? "",
            dependencies: dependsOn,
            files: existingDetails?.files ?? [],
            usageExamples: existingDetails?.usageExamples ?? [],
            notes: existingDetails?.notes ?? "",
            createdAt: existingDetails?.createdAt ?? now,
            updatedAt: now,
        });
    }
    return {
        content: [{ type: "text", text: `Data flow updated for module: ${moduleName}` }],
        structuredContent: { moduleName, message: `Data flow updated for module '${moduleName}'` },
    };
});
server.registerTool("rebuild-data-flow", {
    title: "Rebuild Data Flow",
    description: "Rebuilds dataFlow for all modules from module file dependencies or existing dependsOn edges. Recomputes providesTo and optionally syncs module files. Use instead of editing architecture.json directly.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        source: z
            .enum(["module-dependencies", "dataFlow-dependsOn"])
            .optional()
            .describe("Source for dependsOn edges (default module-dependencies)"),
        syncInverse: z.boolean().optional().describe("Recompute providesTo (default true)"),
        pruneOrphans: z.boolean().optional().describe("Remove invalid module references (default true)"),
    },
    outputSchema: {
        edgesAdded: z.number(),
        edgesRemoved: z.number(),
        modulesUpdated: z.number(),
        message: z.string(),
    },
}, async ({ source, syncInverse, pruneOrphans, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [{ type: "text", text: `No architecture found for project: ${projectId}` }],
            structuredContent: {
                edgesAdded: 0,
                edgesRemoved: 0,
                modulesUpdated: 0,
                message: `Architecture not found for project: ${projectId}`,
            },
        };
    }
    const moduleNames = architecture.modules.map((m) => m.name);
    const moduleDetailsMap = await loadModuleDetailsMap(projectId, architecture);
    const beforeFlow = architecture.dataFlow;
    let rebuilt;
    if ((source ?? "module-dependencies") === "module-dependencies") {
        rebuilt = buildDataFlowFromModules(architecture.modules, moduleDetailsMap);
    }
    else {
        rebuilt = buildDataFlowFromDependsOn(architecture.dataFlow ?? {}, moduleNames);
    }
    if (pruneOrphans ?? true) {
        rebuilt = pruneDataFlow(rebuilt, moduleNames);
    }
    else if (syncInverse ?? true) {
        rebuilt = recomputeProvidesTo(rebuilt, moduleNames);
    }
    const { edgesAdded, edgesRemoved } = diffFlowEdges(beforeFlow, rebuilt);
    architecture.dataFlow = Object.keys(rebuilt).length > 0 ? rebuilt : undefined;
    architecture.updatedAt = new Date().toISOString();
    await writeArchitecture(projectId, architecture);
    let modulesUpdated = 0;
    const now = new Date().toISOString();
    for (const mod of architecture.modules) {
        const dependsOn = rebuilt[mod.name]?.dependsOn ?? [];
        const existing = moduleDetailsMap.get(mod.name);
        const existingDeps = [...(existing?.dependencies ?? [])].sort();
        const nextDeps = [...dependsOn].sort();
        const same = nextDeps.length === existingDeps.length &&
            nextDeps.every((d, i) => d === existingDeps[i]);
        if (same) {
            continue;
        }
        await writeModule(projectId, {
            moduleId: mod.id,
            name: mod.name,
            description: existing?.description ?? mod.description,
            inputs: existing?.inputs ?? mod.inputs ?? "",
            outputs: existing?.outputs ?? mod.outputs ?? "",
            dependencies: dependsOn,
            files: existing?.files ?? [],
            usageExamples: existing?.usageExamples ?? [],
            notes: existing?.notes ?? "",
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        modulesUpdated++;
    }
    const message = `Rebuilt dataFlow: +${edgesAdded} -${edgesRemoved} edges, ${modulesUpdated} module files synced`;
    return {
        content: [{ type: "text", text: message }],
        structuredContent: { edgesAdded, edgesRemoved, modulesUpdated, message },
    };
});
const validationIssueSchema = z.object({
    kind: z.string(),
    module: z.string(),
    detail: z.string(),
});
const validationOutputSchema = {
    projectId: z.string(),
    valid: z.boolean(),
    issueCount: z.number(),
    summary: z.string(),
    stats: z.object({
        moduleCount: z.number(),
        entryCount: z.number(),
        entryFilesOnDisk: z.number(),
        indexItemCount: z.number(),
    }),
    issuesByKind: z.record(z.string(), z.number()),
    issues: z.array(validationIssueSchema),
    coverage: z
        .object({
        modulesWithoutEntries: z.number(),
        entriesUnlinked: z.number(),
        entriesOrphanModule: z.number(),
        entriesWithoutModules: z.number(),
        entriesSliceOrphan: z.number(),
        modulesTooManyEntries: z.number(),
        modulesTooFewEntries: z.number(),
    })
        .optional(),
    checksRun: z.array(z.string()),
};
const validationInputSchema = {
    projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    checkInverse: z.boolean().optional().describe("Check providesTo vs dependsOn inverse (default true)"),
    checkModuleDeps: z.boolean().optional().describe("Check module.dependencies vs dataFlow.dependsOn (default true)"),
    checkEntryCoverage: z.boolean().optional().describe("Check modules vs entries linkage (default true)"),
    checkStorage: z
        .boolean()
        .optional()
        .describe("Check module files on disk and entry index drift (default true)"),
    checkEmptySlices: z
        .boolean()
        .optional()
        .describe("Warn when api/domain/persistence slices have zero entries but modules exist (default true)"),
    checkSliceCoverage: z
        .boolean()
        .optional()
        .describe("Check entries match at least one built-in or custom slice (default true)"),
    checkModuleEntryCounts: z
        .boolean()
        .optional()
        .describe("Check module-too-few-entries when moduleEntryMin is set (default true)"),
    moduleEntryMin: z
        .number()
        .optional()
        .describe("Min entries per module when count > 0; omit to disable module-too-few-entries"),
};
async function runValidationTool(params) {
    const projectId = resolveProjectId(params.projectId);
    const result = await runProjectValidation(projectId, {
        checkInverse: params.checkInverse,
        checkModuleDeps: params.checkModuleDeps,
        checkEntryCoverage: params.checkEntryCoverage,
        checkStorage: params.checkStorage,
        checkEmptySlices: params.checkEmptySlices,
        checkSliceCoverage: params.checkSliceCoverage,
        checkModuleEntryCounts: params.checkModuleEntryCounts,
        moduleEntryMin: params.moduleEntryMin,
    });
    const text = `${result.summary}\n\n${JSON.stringify(result, null, 2)}`;
    return {
        content: [{ type: "text", text }],
        structuredContent: { ...result },
    };
}
server.registerTool("validate", {
    title: "Validate Project",
    description: "Run after set-project-architecture, set-module-details, set-entry, or set-entries. Returns a compact report (summary, stats, issues by kind)—no need to load the full project in the agent. Checks only known rules: dataFlow consistency, module↔entry links, module detail files, entry index drift, empty api/domain/persistence slices, entry slice coverage, optional module-too-few-entries when moduleEntryMin is set. Fix issues[] then call validate again.",
    inputSchema: validationInputSchema,
    outputSchema: validationOutputSchema,
}, async (params) => runValidationTool(params));
server.registerTool("validate-architecture", {
    title: "Validate Architecture",
    description: "Alias for validate with the same checks. Prefer validate after edits. Legacy name kept for compatibility.",
    inputSchema: validationInputSchema,
    outputSchema: validationOutputSchema,
}, async (params) => runValidationTool(params));
server.registerTool("rebuild-entry-index", {
    title: "Rebuild Entry Index",
    description: "Rebuilds entries/index.json from entry files on disk. Use when list-entries or get-slice miss entries that exist as files (index drift). Does not modify entry bodies.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        itemCount: z.number(),
        message: z.string(),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const index = await rebuildEntryIndex(projectId);
    return {
        content: [
            {
                type: "text",
                text: `Entry index rebuilt: ${index.items.length} items`,
            },
        ],
        structuredContent: {
            itemCount: index.items.length,
            message: `Rebuilt index with ${index.items.length} entries`,
        },
    };
});
/**
 * Tool: Delete module
 */
server.registerTool("delete-module", {
    title: "Delete Module",
    description: "Deletes one module from architecture and its module detail file. Does not delete entries—remove those with delete-entry if needed. Does not delete custom slices.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        moduleName: z.string().describe("Name of the module to delete"),
    },
    outputSchema: {
        message: z.string(),
    },
}, async ({ moduleName, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    const architecture = await readArchitecture(projectId);
    if (!architecture) {
        return {
            content: [
                {
                    type: "text",
                    text: `No architecture found for project: ${projectId}`,
                },
            ],
            structuredContent: {
                message: `Architecture not found for project: ${projectId}`,
            },
        };
    }
    const module = architecture.modules.find((m) => m.name === moduleName);
    if (!module) {
        return {
            content: [
                {
                    type: "text",
                    text: `Module '${moduleName}' not found`,
                },
            ],
            structuredContent: {
                message: `Module '${moduleName}' not found`,
            },
        };
    }
    // Delete module details file
    await deleteModule(projectId, module.id);
    architecture.modules = architecture.modules.filter((m) => m.id !== module.id);
    const moduleNames = architecture.modules.map((m) => m.name);
    architecture.dataFlow = removeModuleFromDataFlow(architecture.dataFlow, moduleName);
    if (architecture.dataFlow && moduleNames.length > 0) {
        architecture.dataFlow = recomputeProvidesTo(architecture.dataFlow, moduleNames);
    }
    architecture.updatedAt = new Date().toISOString();
    await writeArchitecture(projectId, architecture);
    return {
        content: [
            {
                type: "text",
                text: `Module '${moduleName}' deleted successfully`,
            },
        ],
        structuredContent: {
            message: `Module '${moduleName}' deleted successfully`,
        },
    };
});
/**
 * Resource: Project architecture
 */
server.registerResource("architecture", new ResourceTemplate("arch://{projectId}", { list: undefined }), {
    title: "Project Architecture",
    description: "Resource URI arch://{projectId} — same JSON as get-project-architecture. Prefer tools for agent workflows.",
}, async (uri, { projectId }) => {
    const architecture = await readArchitecture(String(projectId));
    if (!architecture) {
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/plain",
                    text: `No architecture found for project: ${String(projectId)}`,
                },
            ],
        };
    }
    return {
        contents: [
            {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(architecture, null, 2),
            },
        ],
    };
});
/**
 * Resource: Module details
 */
server.registerResource("module", new ResourceTemplate("module://{projectId}/{moduleId}", { list: undefined }), {
    title: "Module Details",
    description: "Resource URI module://{projectId}/{moduleId} — same as get-module-details when you have module uuid. Prefer get-module-details with moduleName for agents.",
}, async (uri, { projectId, moduleId }) => {
    const moduleDetails = await readModule(String(projectId), String(moduleId));
    if (!moduleDetails) {
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/plain",
                    text: `No details found for module: ${String(moduleId)}`,
                },
            ],
        };
    }
    return {
        contents: [
            {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(moduleDetails, null, 2),
            },
        ],
    };
});
registerEntriesAndSlicesTools(server, resolveProjectId);
/**
 * Main function to start the MCP server
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Write to stderr so it doesn't interfere with MCP communication on stdout
    console.error("MCP Architector server started on stdin/stdout");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map