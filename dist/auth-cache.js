import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function nowSec() {
    return Math.floor(Date.now() / 1000);
}
export class AuthCacheStore {
    filePath;
    state = { hosts: {} };
    loaded = false;
    constructor(filePath) {
        const env = (process.env.AIO_DOWN_AUTH_CACHE || "").trim();
        this.filePath = filePath || env || path.join(os.homedir(), ".cache", "aio-downloader", "auth-cache.json");
    }
    load() {
        if (this.loaded)
            return;
        this.loaded = true;
        try {
            const raw = fs.readFileSync(this.filePath, "utf8");
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object" && obj.hosts && typeof obj.hosts === "object") {
                this.state = obj;
            }
        }
        catch {
            this.state = { hosts: {} };
        }
    }
    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
        fs.renameSync(tmp, this.filePath);
    }
    host(base) {
        this.load();
        if (!this.state.hosts[base])
            this.state.hosts[base] = {};
        return this.state.hosts[base];
    }
    getBearer(base) {
        const b = this.host(base).bearer;
        if (!b)
            return "";
        if (!b.token || b.exp <= nowSec() + 10)
            return "";
        return b.token;
    }
    setBearer(base, token, expiresInSec) {
        const t = String(token || "").trim();
        if (!t)
            return;
        this.host(base).bearer = { token: t, exp: nowSec() + Math.max(1, Number(expiresInSec) || 0) };
        this.save();
    }
    clearBearer(base) {
        const h = this.host(base);
        if (h.bearer) {
            delete h.bearer;
            this.save();
        }
    }
    getCookieTokens(base) {
        const c = this.host(base).cookie_tokens;
        if (!c)
            return { csrf: "", api: "" };
        if (!c.csrf || !c.api || c.exp <= nowSec() + 10)
            return { csrf: "", api: "" };
        return { csrf: c.csrf, api: c.api };
    }
    setCookieTokens(base, csrf, api, ttlSec = 86400) {
        const x = String(csrf || "").trim();
        const y = String(api || "").trim();
        if (!x || !y)
            return;
        this.host(base).cookie_tokens = { csrf: x, api: y, exp: nowSec() + Math.max(60, Number(ttlSec) || 86400) };
        this.save();
    }
    getSessionCookie(base) {
        const s = this.host(base).session_cookie;
        if (!s)
            return "";
        if (!s.value || s.exp <= nowSec() + 10)
            return "";
        return s.value;
    }
    setSessionCookie(base, value, ttlSec = 86400) {
        const v = String(value || "").trim();
        if (!v)
            return;
        this.host(base).session_cookie = { value: v, exp: nowSec() + Math.max(60, Number(ttlSec) || 86400) };
        this.save();
    }
}
