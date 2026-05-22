import type { ModuleFactInput, UpsertFactsResult } from './types.js';
export declare const MAX_BULK_ENTRIES = 200;
export declare function upsertFacts(projectId: string, facts: ModuleFactInput[], moduleName?: string): Promise<UpsertFactsResult>;
//# sourceMappingURL=entry-sync.d.ts.map