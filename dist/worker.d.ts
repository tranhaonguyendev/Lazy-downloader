export interface DownloadOptions {
    headful?: boolean;
    allMedias?: boolean;
    unlock?: boolean;
    timeoutSec?: number;
    maxRetries?: number;
    outputFile?: string;
    writeJson?: boolean;
    jsonPretty?: boolean;
    printJson?: boolean;
    outtmpl?: string;
    progressHooks?: Array<(d: any) => void>;
    userAgent?: string;
}
export declare class DownloadWorker {
    private readonly config;
    private readonly templater;
    private readonly authCache;
    constructor(options?: DownloadOptions);
    private log;
    private hook;
    private safeFileName;
    private pickMedias;
    private pickId;
    private pickSource;
    private pickTitle;
    private pickAuthor;
    private pickDuration;
    private pickExtFromUrl;
    private pickExtFromContentType;
    private pickExt;
    private ensureDir;
    private uniquePath;
    private needsMetaEnrich;
    private fetchMetaFromWebpage;
    private j2h;
    private solvePow;
    private autolinkWithCookie;
    private autolinkWithBearer;
    private autolinkAuthFlow;
    private autolink;
    private downloadStream;
    download(url: string, outDir: string, reuseBrowser?: boolean): Promise<any>;
}
