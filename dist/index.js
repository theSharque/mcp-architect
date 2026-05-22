#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { readArchitecture, writeArchitecture, readModule, writeModule, deleteModule, listProjects, normalizeProjectId, } from "./storage.js";
import { registerEntriesAndSlicesTools } from "./tools-entries-slices.js";
function resolveProjectId(provided) {
    return provided || globalProjectId || "default-project";
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
    description: "Creates or replaces vertical module structure (components and dataFlow)—not horizontal facts. Overwrites the full modules list and dataFlow on each call; pass every module you want to keep. For one module use set-module-details. For APIs, domain terms, scripts use set-entry + get-slice—not this tool. If projectId is wrong, call list-projects first. Do not duplicate entry text in module descriptions.",
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
        })).optional().describe("Data flow between modules"),
    },
    outputSchema: {
        projectId: z.string(),
        message: z.string(),
    },
}, async ({ description, modules, dataFlow, projectId: providedProjectId }) => {
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
    const architecture = {
        projectId,
        description,
        modules: moduleSummaries,
        dataFlow: dataFlow,
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
            message: `Architecture updated with ${modules.length} modules`,
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
server.registerTool("set-module-details", {
    title: "Set Module Details",
    description: "Creates or updates one vertical module (component): files, dependencies, usage examples, synced to architecture summary. Use for structural ownership—not for listing every API (use set-entry). Does not replace other modules. Prefer over set-project-architecture for single-module edits. Link entries via refs.moduleName; do not paste the same text into entries.",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        name: z.string().describe("Module name"),
        description: z.string().describe("Detailed description of the module"),
        inputs: z.string().describe("What the module accepts as input"),
        outputs: z.string().describe("What the module produces as output"),
        dependencies: z.array(z.string()).optional().describe("List of module dependencies"),
        files: z.array(z.string()).optional().describe("List of files belonging to this module"),
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
    },
}, async ({ name, description, inputs, outputs, dependencies, files, usageExamples, notes, projectId: providedProjectId }) => {
    const projectId = resolveProjectId(providedProjectId);
    // Get or generate module ID
    const architecture = await readArchitecture(projectId);
    let moduleId;
    if (architecture) {
        const existingModule = architecture.modules.find((m) => m.name === name);
        moduleId = existingModule ? existingModule.id : uuidv4();
        // Update or add module to architecture
        if (existingModule) {
            existingModule.description = description;
            existingModule.inputs = inputs;
            existingModule.outputs = outputs;
            existingModule.updatedAt = new Date().toISOString();
        }
        else {
            architecture.modules.push({
                id: moduleId,
                name,
                description,
                inputs,
                outputs,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
        architecture.updatedAt = new Date().toISOString();
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
        dependencies: dependencies || [],
        files: files || [],
        usageExamples: usageExamples || [],
        notes: notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await writeModule(projectId, moduleDetails);
    return {
        content: [
            {
                type: "text",
                text: `Module details saved: ${name}`,
            },
        ],
        structuredContent: {
            moduleId,
            message: `Module '${name}' saved successfully`,
        },
    };
});
/**
 * Tool: Get module details
 */
server.registerTool("get-module-details", {
    title: "Get Module Details",
    description: "Returns one module's full detail (files, dependencies, examples). Use when you know the module name from get-project-architecture or list-modules. For cross-cutting API/domain lists use get-slice. moduleName must match architecture exactly.",
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
    description: "Lists module summaries from architecture (name, description)—vertical structure only. For horizontal facts (endpoints, tables, terms) use list-slices then get-slice. Use module names in set-entry refs.moduleName.",
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
    // Remove from architecture
    architecture.modules = architecture.modules.filter(m => m.id !== module.id);
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