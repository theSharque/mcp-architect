import type { DataFlow, ModuleDetails, ModuleSummary, ProjectArchitecture, ValidationIssue } from "./types.js";
export declare function recomputeProvidesTo(dataFlow: DataFlow, moduleNames: string[]): DataFlow;
export declare function syncModuleDependsOn(dataFlow: DataFlow, moduleName: string, dependsOn: string[], moduleNames: string[]): DataFlow;
export declare function buildDataFlowFromModules(modules: ModuleSummary[], moduleDetailsMap: Map<string, ModuleDetails>): DataFlow;
export declare function buildDataFlowFromDependsOn(dataFlow: DataFlow, moduleNames: string[]): DataFlow;
export declare function pruneDataFlow(dataFlow: DataFlow, validNames: string[]): DataFlow;
export declare function removeModuleFromDataFlow(dataFlow: DataFlow | undefined, moduleName: string): DataFlow | undefined;
export declare function mergeModules(existing: ModuleSummary[] | undefined, incoming: ModuleSummary[], options: {
    replace: boolean;
}): ModuleSummary[];
export declare function mergeDataFlow(existing: DataFlow | undefined, incoming: DataFlow | undefined, options: {
    replace: boolean;
}): DataFlow | undefined;
export declare function validateDataFlow(architecture: ProjectArchitecture, moduleDetailsMap: Map<string, ModuleDetails>, options?: {
    checkInverse?: boolean;
    checkModuleDeps?: boolean;
}): ValidationIssue[];
export declare function diffFlowEdges(before: DataFlow | undefined, after: DataFlow | undefined): {
    edgesAdded: number;
    edgesRemoved: number;
};
//# sourceMappingURL=data-flow.d.ts.map