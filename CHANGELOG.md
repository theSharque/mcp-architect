# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.0] - 2026-11-24

### Security

- Upgrade Zod from 3.25.76 to 4.6.7 so constrained collections (`array` / `record` / `set` / `map` with `.max()`) no longer allocate unbounded memory ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). MCP tool schemas are unchanged; `@modelcontextprotocol/sdk` already accepts `zod@^4`.

## [1.11.1] - 2026-09-27

### Security

- Pin transitive audit overrides (`ajv`, `qs`, `hono`, `ip-address`, `@hono/node-server`, `body-parser`, `fast-uri`, `esbuild`) without downgrading the MCP SDK.

## [1.11.0] - 2026-09-01

### Added

- `fix-data` tool: scan a project catalog, repair leftover JSON after the first object, remove stale `.tmp` files, and rebuild the entry index (`dryRun` supported).
- Atomic catalog writes (`tmp` + flush + rename) and extra-data recovery on read.

### Fixed

- Concurrent in-place `architecture.json` writes could leave leftover bytes and make `list-modules`, `get-module-details`, and `validate` fail with broken JSON.

## [1.10.0] - 2026-08-20

### Changed

- `projectId` is required on every tool except `list-projects`. `default-project` and unsubstituted `workspaceFolder` ids are rejected.

## [1.9.0] - 2026-05-29

### Added

- `refactor-architecture` tool for in-catalog post-refactor sync (scan, path/text mutations, dry-run, pagination).

## [1.8.1] - 2026-05-24

### Changed

- Cap bulk imports at 50 entries per call.
- Drop `module-too-many-entries` from validate.

## [1.8.0] - 2026-05-24

### Added

- Bulk catalog import tools: `import-entries`, `validate-import`, `get-import-stats`, `replace-entries`, `delete-entries`.

## [1.7.0] - 2026-05-23

### Added

- Semantic `validate` report, compact `search-entries`, and the Cursor onboarding rule.

## [1.6.1] - 2026-05-22

### Fixed

- `validate` `outputSchema` `projectId` field.

## [1.6.0] - 2026-05-22

### Added

- Unified module facts, `validate` tool, and entry coverage checks.

## [1.5.0] - 2026-05-22

### Added

- Entries, slices, and stricter local storage layout.

[1.12.0]: https://github.com/theSharque/mcp-architect/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/theSharque/mcp-architect/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/theSharque/mcp-architect/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/theSharque/mcp-architect/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/theSharque/mcp-architect/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/theSharque/mcp-architect/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/theSharque/mcp-architect/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/theSharque/mcp-architect/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/theSharque/mcp-architect/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/theSharque/mcp-architect/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/theSharque/mcp-architect/releases/tag/v1.5.0
