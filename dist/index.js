#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { readArchitecture, writeArchitecture, readModule, writeModule, deleteModule, readScript, writeScript, listScripts, normalizeProjectId, } from "./storage.js";
/**
 * MCP Architector Server
 * A Model Context Protocol server for architecture and system design
 */
const server = new McpServer({
    name: "mcp-architector",
    version: "1.0.0"
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
    description: "Creates or updates the overall architecture for a project",
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
    // Get project ID from parameter, global context, or use default
    const projectId = providedProjectId || globalProjectId || "default-project";
    const moduleSummaries = modules.map((module) => ({
        id: uuidv4(),
        name: module.name,
        description: module.description,
        inputs: module.inputs,
        outputs: module.outputs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));
    const architecture = {
        projectId,
        description,
        modules: moduleSummaries,
        dataFlow: dataFlow,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    description: "Retrieves the overall architecture of the project",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        architecture: z.any(),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
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
/**
 * Tool: Set module details
 */
server.registerTool("set-module-details", {
    title: "Set Module Details",
    description: "Creates or updates detailed information about a module",
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
    const projectId = providedProjectId || globalProjectId || "default-project";
    // Get or generate module ID
    const architecture = await readArchitecture(projectId);
    let moduleId;
    if (architecture) {
        const existingModule = architecture.modules.find((m) => m.name === name);
        moduleId = existingModule ? existingModule.id : uuidv4();
        // Update or add module to architecture
        if (existingModule) {
            existingModule.description = description;
            existingModule.updatedAt = new Date().toISOString();
        }
        else {
            architecture.modules.push({
                id: moduleId,
                name,
                description,
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
    description: "Retrieves detailed information about a specific module",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        moduleName: z.string().describe("Name of the module to retrieve"),
    },
    outputSchema: {
        module: z.any(),
    },
}, async ({ moduleName, projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
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
    description: "Lists all modules in the project architecture",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        modules: z.array(z.any()),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
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
    description: "Deletes a module from the project architecture",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        moduleName: z.string().describe("Name of the module to delete"),
    },
    outputSchema: {
        message: z.string(),
    },
}, async ({ moduleName, projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
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
    description: "Provides access to project architecture",
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
    description: "Provides access to module details",
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
/**
 * Tool: Set script documentation
 */
server.registerTool("set-script-documentation", {
    title: "Set Script Documentation",
    description: "Creates or updates documentation for a script or command",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        scriptName: z.string().describe("Name of the script"),
        description: z.string().describe("Description of what the script does"),
        usage: z.string().describe("Usage command or syntax"),
        examples: z.array(z.string()).describe("Usage examples"),
        parameters: z.record(z.string(), z.string()).describe("Parameters and their descriptions"),
        notes: z.string().optional().describe("Additional notes"),
    },
    outputSchema: {
        scriptId: z.string(),
        message: z.string(),
    },
}, async ({ scriptName, description, usage, examples, parameters, notes, projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
    const scriptId = uuidv4();
    const scriptDoc = {
        scriptId,
        scriptName,
        description,
        usage,
        examples,
        parameters,
        notes: notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await writeScript(projectId, scriptDoc);
    return {
        content: [
            {
                type: "text",
                text: `Script documentation saved: ${scriptName}`,
            },
        ],
        structuredContent: {
            scriptId,
            message: `Script '${scriptName}' saved successfully`,
        },
    };
});
/**
 * Tool: Get script documentation
 */
server.registerTool("get-script-documentation", {
    title: "Get Script Documentation",
    description: "Retrieves documentation for a specific script",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
        scriptName: z.string().describe("Name of the script to retrieve"),
    },
    outputSchema: {
        script: z.any(),
    },
}, async ({ scriptName, projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
    const scripts = await listScripts(projectId);
    let scriptDoc = null;
    // Find script by name
    for (const scriptId of scripts) {
        const script = await readScript(projectId, scriptId);
        if (script && script.scriptName === scriptName) {
            scriptDoc = script;
            break;
        }
    }
    if (!scriptDoc) {
        return {
            content: [
                {
                    type: "text",
                    text: `Script '${scriptName}' not found`,
                },
            ],
            structuredContent: {
                script: null,
            },
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(scriptDoc, null, 2),
            },
        ],
        structuredContent: {
            script: scriptDoc,
        },
    };
});
/**
 * Tool: List all scripts
 */
server.registerTool("list-scripts", {
    title: "List All Scripts",
    description: "Lists all documented scripts in the project",
    inputSchema: {
        projectId: z.string().optional().describe("Project ID (defaults to normalized workdir)"),
    },
    outputSchema: {
        scripts: z.array(z.any()),
    },
}, async ({ projectId: providedProjectId }) => {
    const projectId = providedProjectId || globalProjectId || "default-project";
    const scriptIds = await listScripts(projectId);
    const scripts = await Promise.all(scriptIds.map(id => readScript(projectId, id)));
    const validScripts = scripts.filter((s) => s !== null);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(validScripts, null, 2),
            },
        ],
        structuredContent: {
            scripts: validScripts,
        },
    };
});
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