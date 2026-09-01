export interface JsonDocument<T> {
    value: T;
    extraBytes: number;
}
export declare function parseJsonDocument<T>(content: string): JsonDocument<T>;
export declare function writeJsonAtomic(filePath: string, value: unknown): Promise<void>;
export declare function readJsonFile<T>(filePath: string): Promise<T>;
//# sourceMappingURL=json-store.d.ts.map