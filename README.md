# MCP Architector

Model Context Protocol (MCP) server for architecture and system design.

## Overview

A local-first MCP server that stores and manages project architecture information. All data is stored locally in `~/.mcp-architector` for maximum privacy and confidentiality.

## Features

- **Local Storage**: All data stored in `~/.mcp-architector` (privacy-first)
- **Project Architecture**: Store and retrieve overall project architecture
- **Module Details**: Detailed information about each module
- **Resources**: Access architecture data via resources

## Storage Structure

```
~/.mcp-architector/
└── {projectId}/
    ├── architecture.json      # Overall architecture
    ├── modules/
    │   ├── {moduleId}.json    # Module details
    │   └── ...
    └── scripts/
        ├── {scriptId}.json    # Script documentation
        └── ...
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

## Usage

### Development Mode

Run with hot reload:
```bash
npm run dev
```

### Production Mode

Start the server:
```bash
npm start
```

### MCP Inspector

Debug and test your server with the MCP Inspector:
```bash
npm run inspector
```

## Integration with Cursor

### Configuration

Add this server to your Cursor MCP configuration:

1. Open Cursor Settings → Features → Model Context Protocol
2. Click "Edit Config" button
3. Add the server configuration

#### Option 1: Automatic project ID from environment

```json
{
  "mcpServers": {
    "architector": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-architector/dist/index.js"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

**Note:** `${workspaceFolder}` will be automatically replaced by Cursor with the current workspace directory.

#### Option 2: Manually specify project ID

```json
{
  "mcpServers": {
    "architector": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-architector/dist/index.js"],
      "env": {
        "MCP_PROJECT_ID": "my-project-name"
      }
    }
  }
}
```

### Using Project ID in Tool Calls

When calling tools, you can:

1. **Use automatic project ID** (from environment): Just omit the `projectId` parameter
2. **Override per call**: Pass `projectId` explicitly in the tool call
3. **Use default**: If neither is provided, uses "default-project"

## Tools

### set-project-architecture

Creates or updates the overall architecture for a project.

**Input:**
- `projectId` (optional): Project ID (defaults to "default-project")
- `description`: Overall project description
- `modules`: Array of module objects with:
  - `name`: Module name
  - `description`: Brief description of the module
  - `inputs` (optional): What this module requires to work
  - `outputs` (optional): What this module produces or generates
- `dataFlow` (optional): Object describing data flow between modules:
  - Key: module name
  - Value: object with:
    - `dependsOn` (optional): Array of module names this module depends on
    - `providesTo` (optional): Array of module names that receive data from this module
    - `dataTransformation` (optional): How data is transformed between modules

**Output:**
- Project ID and success message

### get-project-architecture

Retrieves the overall architecture of the project.

**Input:**
- `projectId` (optional): Project ID (defaults to "default-project")

**Output:**
- Complete project architecture

### set-module-details

Creates or updates detailed information about a module.

**Input:**
- `projectId` (optional): Project ID
- `name`: Module name
- `description`: Detailed description of the module
- `inputs`: What the module accepts as input
- `outputs`: What the module produces as output
- `dependencies` (optional): List of module dependencies
- `files` (optional): List of files belonging to this module
- `usageExamples` (optional): Array of usage examples with fields:
  - `title`: Example title
  - `description` (optional): Description of the example
  - `command` (optional): Command or code snippet
  - `input` (optional): Input data
  - `output` (optional): Expected output
  - `notes` (optional): Additional notes about the example
- `notes` (optional): Additional notes

**Output:**
- Module ID and success message

### get-module-details

Retrieves detailed information about a specific module.

**Input:**
- `projectId` (optional): Project ID
- `moduleName`: Name of the module to retrieve

**Output:**
- Complete module details

### list-modules

Lists all modules in the project architecture.

**Input:**
- `projectId` (optional): Project ID

**Output:**
- Array of module summaries

### delete-module

Deletes a module from the project architecture.

**Input:**
- `projectId` (optional): Project ID
- `moduleName`: Name of the module to delete

**Output:**
- Success message

### set-script-documentation

Creates or updates documentation for a script or command.

**Input:**
- `projectId` (optional): Project ID
- `scriptName`: Name of the script
- `description`: Description of what the script does
- `usage`: Usage command or syntax
- `examples`: Array of usage examples
- `parameters`: Object mapping parameter names to descriptions
- `notes` (optional): Additional notes

**Output:**
- Script ID and success message

### get-script-documentation

Retrieves documentation for a specific script.

**Input:**
- `projectId` (optional): Project ID
- `scriptName`: Name of the script to retrieve

**Output:**
- Script documentation

### list-scripts

Lists all documented scripts in the project.

**Input:**
- `projectId` (optional): Project ID

**Output:**
- Array of script documentations

## Resources

### architecture

Provides access to project architecture as a resource.

**Usage:**
Access via URI: `arch://{projectId}`

### module

Provides access to module details as a resource.

**Usage:**
Access via URI: `module://{projectId}/{moduleId}`

## Development

### Project Structure

```
mcp-architector/
├── src/
│   ├── index.ts          # Main server implementation
│   ├── types.ts          # Type definitions
│   └── storage.ts        # Storage utilities
├── dist/                 # Compiled output (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Project ID and Workdir

The server uses `projectId` to organize data in separate directories. The priority for determining project ID is:

1. **Explicitly passed** in tool call parameters (highest priority)
2. **From environment variable** `MCP_PROJECT_ID` (set during initialization)
3. **Default fallback** "default-project" (lowest priority)

For Cursor integration, set `MCP_PROJECT_ID` to use the workspace directory automatically as the project ID.

### Extending the Server

To add new tools, resources, or prompts, edit `src/index.ts`:

```typescript
// Add a tool
server.registerTool(
  "tool-name",
  { /* tool config */ },
  async (params) => { /* handler */ }
);

// Add a resource
server.registerResource(
  "resource-name",
  new ResourceTemplate("uri-template", { /* options */ }),
  { /* resource config */ },
  async (uri, params) => { /* handler */ }
);

// Add a prompt
server.registerPrompt(
  "prompt-name",
  { /* prompt config */ },
  (args) => { /* handler */ }
);
```

## License

MIT

