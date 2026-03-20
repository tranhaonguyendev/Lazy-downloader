export declare class AuthCacheStore {
    private readonly filePath;
    private state;
    private loaded;
    constructor(filePath?: string | null);
    private load;
    private save;
    private host;
    getBearer(base: string): string;
    setBearer(base: string, token: string, expiresInSec: number): void;
    clearBearer(base: string): void;
    getCookieTokens(base: string): {
        csrf: string;
        api: string;
    };
    setCookieTokens(base: string, csrf: string, api: string, ttlSec?: number): void;
    getSessionCookie(base: string): string;
    setSessionCookie(base: string, value: string, ttlSec?: number): void;
}
