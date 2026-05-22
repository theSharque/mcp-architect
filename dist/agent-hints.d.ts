export declare const MODULE_ENTRIES_REMINDER: string;
export declare const ENTRIES_MODULE_REMINDER: string;
export declare function suggestKindsFromFiles(files: string[]): string[];
export interface EntryLinkHints {
    reminder?: string;
    warning?: string;
    suggestedModuleNames?: string[];
}
export declare function buildEntryLinkHints(moduleNames: string[], refsModuleName?: string): EntryLinkHints;
//# sourceMappingURL=agent-hints.d.ts.map