export declare class TemplateEngine {
    private readonly outtmpl;
    private readonly maxLen;
    constructor(outtmpl?: string, maxLen?: number);
    private norm;
    private safeBase;
    private apply;
    resolve(info: Record<string, unknown>): string;
    ensureExt(filePath: string, ext: string): string;
}
