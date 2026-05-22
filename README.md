# MCP Architector

[![npm version](https://img.shields.io/npm/v/mcp-architector.svg)](https://www.npmjs.com/package/mcp-architector)
[![GitHub](https://img.shields.io/github/license/theSharque/mcp-architect)](https://github.com/theSharque/mcp-architect)

> Model Context Protocol (MCP) server for architecture and system design

**Local-first MCP server** that stores and manages project architecture information. All data is stored locally in `~/.mcp-architector` for maximum privacy and confidentiality.

📦 **Install**: `npm install -g mcp-architector` or use via npx
🌐 **npm**: https://www.npmjs.com/package/mcp-architector
🔗 **GitHub**: https://github.com/theSharque/mcp-architect

## How to connect to Claude Desktop / IDE

Add the server to your MCP config. Example for **claude_desktop_config.json**:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

For **Cursor IDE**: Settings → Features → Model Context Protocol → Edit Config, then add the same block inside `mcpServers`. See the [Integration](#integration) section for more options.

## Overview

Store and manage project architecture, modules, scripts, data flow, and usage examples - all locally with complete privacy.

## Features

- **Local Storage**: All data stored in `~/.mcp-architector` (privacy-first)
- **Project Architecture**: Store and retrieve overall project architecture
- **Module Details**: Detailed information about each module
- **Resources**: Access architecture data via resources

## Storage Structure

```
~/.mcp-architector/
└── {projectId}/
    ├── architecture.json      # Modules + dataFlow (vertical structure)
    ├── modules/
    │   ├── {moduleId}.json
    │   └── ...
    ├── entries/
    │   ├── index.json         # Catalog (no duplicate bodies)
    │   └── {entryId}.json     # Canonical facts (API, domain, flows, …)
    ├── slices/
    │   └── {sliceId}.json     # Custom filters only (no items)
```

## Data model

| Layer | Purpose | Tools |
|-------|---------|-------|
| **Modules** | Vertical structure: components, dependencies, dataFlow | `set-project-architecture`, `set-module-details`, `set-module-data-flow`, `rebuild-data-flow`, `validate-architecture` |
| **Entries** | Single source of truth for horizontal facts (one fact = one file) | `set-entry`, `set-entries`, `get-entry`, `list-entries` |
| **Slices** | Read-only views over entries (built-in or custom filters) | `list-slices`, `get-slice` |

**Anti-patterns (no duplication):** Do not copy `module.description` into `entry.summary`. Link with `refs.moduleName`. Slices never store item copies—only filters in `slices/*.json`.

**Do not edit `~/.mcp-architector` directly** — always use MCP tools so timestamps, merge semantics, and dataFlow inverse sync stay consistent.

## Agent workflow

1. `list-projects` — confirm `projectId` if data looks empty or wrong.
2. **Structure task** → `get-project-architecture` / `set-project-architecture`.
3. **Each module** → `set-module-details` with `files` + **`facts[]`** (endpoints, entities, glossary) in the same call, or `set-entries` / `set-entry` with `refs.moduleName`.
4. **Single module graph edge** → `set-module-data-flow`.
5. **Bulk rebuild flow (many modules)** → `rebuild-data-flow`.
6. **After edits, verify everything** → `validate` (summary + `issues[]`; no full project load).
7. **Need a category** (all APIs, all domain terms) → `list-slices` → `get-slice` with `format=compact` or `table`; use `offset` when `hasMore` is true.
8. **Find by name** → `search-entries` → `get-entry` for full payload.

| Scenario | Tool |
|----------|------|
| Update one module + its APIs/facts | `set-module-details` with `facts[]` |
| Bulk facts for a domain | `set-entries` with `moduleName` |
| Patch dataFlow for one module | `set-module-data-flow` |
| Rebuild all module edges | `rebuild-data-flow` |
| Diagnose graph + empty slices | `validate` (or `validate-architecture`) |
| Index out of sync | `rebuild-entry-index` |
| Create project from scratch | `set-project-architecture` with `replaceModules: true` |

**Full project picture:** modules alone do not populate slices — without `http-endpoint` (and other kinds) entries, slice `api` stays empty. New module → add `facts` or entries in the same step.

Example: `set-module-details` with `facts: [{ kind: "http-endpoint", title: "POST /orders", ... }]`, then `get-slice` `sliceId=api` `format=table`.

## Quick Start

### For Users (using npm package)

```bash
# No installation needed - use directly in Cursor/Claude Desktop
# Just configure it as described in Integration section below
```

### For Developers

1. Clone the repository:
```bash
git clone https://github.com/theSharque/mcp-architect.git
cd mcp-architect
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
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

## Integration

### Cursor IDE

1. Open Cursor Settings → Features → Model Context Protocol
2. Click "Edit Config" button
3. Add one of the configurations below

#### Option 1: Via npm (Recommended)

Installs from npm registry automatically:

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

#### Option 2: Via npm link (Development)

For local development with live changes:

```json
{
  "mcpServers": {
    "architector": {
      "command": "mcp-architector",
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

Requires: `cd /path/to/mcp-architector && npm link -g`

#### Option 3: Direct path

```json
{
  "mcpServers": {
    "architector": {
      "command": "node",
      "args": ["/path/to/mcp-architector/dist/index.js"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Continue.dev

Edit `.continue/config.json`:

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Using Project ID

When calling tools, you can:

1. **Use automatic project ID** (from `${workspaceFolder}` env var): Just omit the `projectId` parameter
2. **Override per call**: Pass `projectId` explicitly in the tool call
3. **Use default**: If neither is provided, uses "default-project"

## Tools

### set-project-architecture

Creates or updates the overall architecture for a project. **By default merges** modules and dataFlow by name; omit `dataFlow` to preserve existing flow. `dependsOn` is canonical; `providesTo` is recomputed on save.

**Input:**
- `projectId` (optional): Project ID (defaults to "default-project")
- `description`: Overall project description
- `modules`: Array of module objects with:
  - `name`: Module name
  - `description`: Brief description of the module
  - `inputs` (optional): What this module requires to work
  - `outputs` (optional): What this module produces or generates
- `dataFlow` (optional): Object describing data flow between modules (omit to keep existing):
  - Key: module name
  - Value: object with:
    - `dependsOn` (optional): Array of module names this module depends on
    - `providesTo` (optional): Derived on save from all `dependsOn` edges
    - `dataTransformation` (optional): How data is transformed between modules
- `replaceModules` (optional): Replace entire modules list (default `false` = merge by name)
- `replaceDataFlow` (optional): Replace entire dataFlow (default `false` = merge by module name)

**Output:**
- Project ID and success message

### get-project-architecture

Retrieves the overall architecture of the project.

**Input:**
- `projectId` (optional): Project ID (defaults to "default-project")

**Output:**
- Complete project architecture

### list-projects

Lists all projects in local storage (`~/.mcp-architector`). Use when the workspace may map to a different normalized `projectId`.

**Input:**
- `query` (optional): Filter by substring in projectId or description (case-insensitive)

**Output:**
- Array of project summaries: `projectId`, `description`, `moduleCount`, `updatedAt`, `isCurrent` (matches current `MCP_PROJECT_ID`)

### Entries and slices

| Tool | Purpose |
|------|---------|
| `set-entry` | Upsert one fact; response may include `reminder` if modules missing or unlinked |
| `set-entries` | Bulk upsert (max 200); optional `moduleName` sets `refs.moduleName` on all |
| `get-entry` | Full entry by `id` |
| `delete-entry` | Remove entry |
| `list-entries` | Catalog without payload; filter by `kind`, `tags`, `query` |
| `search-entries` | Text search in title, summary, kind, tags |
| `list-slices` | Built-in + custom slices with entry counts |
| `get-slice` | Filtered view: `sliceId`, `format`, `query`, `limit`, `offset`, `hasMore` |
| `set-slice` | Save custom filter (`kinds`, `tags`) — no items |
| `delete-slice` | Remove custom slice |
| `rebuild-entry-index` | Rebuild `entries/index.json` from entry files |

**Built-in `sliceId` values:** `api`, `persistence`, `events`, `domain`, `flows`, `integrations`, `config`, `runtime`, `decisions`, `scripts`.

**Recommended `kind` examples (any string allowed):**

| sliceId | kinds |
|---------|-------|
| api | `http-endpoint`, `grpc-method`, `mcp-tool`, `cli-command`, … |
| persistence | `db-table`, `entity`, `repository` |
| domain | `glossary`, `invariant`, `lifecycle` |
| scripts | `script` — use `set-entry` / `get-slice sliceId=scripts` |

### set-module-details

Creates or updates detailed information about a module. **Slices read entries, not module text** — pass `facts[]` to create linked entries in one call.

**Input:**
- `projectId` (optional): Project ID
- `name`: Module name
- `description`: Detailed description of the module
- `inputs`: What the module accepts as input
- `outputs`: What the module produces as output
- `dependencies` (optional): List of module dependencies (syncs to `dataFlow.dependsOn` when provided)
- `files` (optional): List of files belonging to this module
- `facts` (optional): Array of horizontal facts (`kind`, `title`, `summary`, …) — each upserted as entry with `refs.moduleName` = module name
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

### set-module-data-flow

Patches `dataFlow` for a single module without sending the full architecture.

**Input:**
- `projectId` (optional): Project ID
- `moduleName`: Module name
- `dependsOn` (optional): Modules this module depends on (canonical)
- `dataTransformation` (optional): How data is transformed
- `syncInverse` (optional): Recompute `providesTo` (default `true`)

**Output:**
- Module name and success message

### rebuild-data-flow

Rebuilds `dataFlow` for all modules from module file `dependencies` or existing `dependsOn` edges. Replaces bulk manual edits to `architecture.json`.

**Input:**
- `projectId` (optional): Project ID
- `source` (optional): `module-dependencies` (default) or `dataFlow-dependsOn`
- `syncInverse` (optional): Recompute `providesTo` (default `true`)
- `pruneOrphans` (optional): Remove invalid module references (default `true`)

**Output:**
- `edgesAdded`, `edgesRemoved`, `modulesUpdated`, message

### validate

**Primary post-edit check.** Read-only validation with a compact agent-friendly report. Does not modify data.

**Checks (only rules we can verify from stored JSON):**
- dataFlow: inverse drift, dangling `dependsOn`/`providesTo`, orphan flow keys
- `module.dependencies` vs `dataFlow.dependsOn`
- entries: `entries-without-modules`, `entry-unlinked`, `orphan-entry-module`, `module-no-entries`, `module-missing-api` / `module-missing-persistence`
- storage: missing `modules/{id}.json`, orphan module files, entry index drift
- slices: empty built-in `api` / `domain` / `persistence` when modules exist

**Input:** `projectId`, `checkInverse`, `checkModuleDeps`, `checkEntryCoverage`, `checkStorage`, `checkEmptySlices` (all default `true`)

**Output:** `valid`, `issueCount`, `summary`, `stats`, `issuesByKind`, `issues[]`, `coverage`, `checksRun`

### validate-architecture

Same as `validate` (legacy alias). Prefer `validate` after edits.

**Output:**
- `valid` (boolean), `issues` array

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

