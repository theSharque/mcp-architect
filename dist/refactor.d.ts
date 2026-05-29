import type { Entry, ModuleDetails, RefactorChange, RefactorDraftState, RefactorRequest, RefactorResult, RefactorScanHit, RefactorStats } from './types.js';
export declare const MAX_REFACTOR_OPERATIONS = 10;
export declare const DEFAULT_REFACTOR_CHANGE_LIMIT = 15;
export declare const MAX_REFACTOR_CHANGE_LIMIT = 50;
export declare const MAX_REFACTOR_WARNINGS = 5;
export declare function createDraftState(entries: Entry[], modules: ModuleDetails[]): RefactorDraftState;
export declare function assertRefactorOperationLimit(count: number): void;
export declare function clampRefactorLimit(limit?: number): number;
export declare function clampRefactorOffset(offset?: number): number;
export declare function executeRefactorDraft(state: RefactorDraftState, request: RefactorRequest): {
    hits?: RefactorScanHit[];
    changes: RefactorChange[];
    warnings: string[];
    stats: RefactorStats;
    deletedIds: string[];
};
export declare function paginateRefactorResult(dryRun: boolean, hits: RefactorScanHit[] | undefined, changes: RefactorChange[], warnings: string[], stats: RefactorStats, limit?: number, offset?: number): RefactorResult;
export declare function runRefactorArchitecture(projectId: string, request: RefactorRequest): Promise<RefactorResult>;
//# sourceMappingURL=refactor.d.ts.map