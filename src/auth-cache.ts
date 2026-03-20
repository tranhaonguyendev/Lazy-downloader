import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface HostState {
  bearer?: { token: string; exp: number };
  cookie_tokens?: { csrf: string; api: string; exp: number };
  session_cookie?: { value: string; exp: number };
}

interface CacheState {
  hosts: Record<string, HostState>;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export class AuthCacheStore {
  private readonly filePath: string;
  private state: CacheState = { hosts: {} };
  private loaded = false;

  constructor(filePath?: string | null) {
    const env = (process.env.AIO_DOWN_AUTH_CACHE || "").trim();
    this.filePath = filePath || env || path.join(os.homedir(), ".cache", "lazy-downloader", "auth-cache.json");
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const obj = JSON.parse(raw) as CacheState;
      if (obj && typeof obj === "object" && obj.hosts && typeof obj.hosts === "object") {
        this.state = obj;
      }
    } catch {
      this.state = { hosts: {} };
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  private host(base: string): HostState {
    this.load();
    if (!this.state.hosts[base]) this.state.hosts[base] = {};
    return this.state.hosts[base];
  }

  getBearer(base: string): string {
    const b = this.host(base).bearer;
    if (!b) return "";
    if (!b.token || b.exp <= nowSec() + 10) return "";
    return b.token;
  }

  setBearer(base: string, token: string, expiresInSec: number): void {
    const t = String(token || "").trim();
    if (!t) return;
    this.host(base).bearer = { token: t, exp: nowSec() + Math.max(1, Number(expiresInSec) || 0) };
    this.save();
  }

  clearBearer(base: string): void {
    const h = this.host(base);
    if (h.bearer) {
      delete h.bearer;
      this.save();
    }
  }

  getCookieTokens(base: string): { csrf: string; api: string } {
    const c = this.host(base).cookie_tokens;
    if (!c) return { csrf: "", api: "" };
    if (!c.csrf || !c.api || c.exp <= nowSec() + 10) return { csrf: "", api: "" };
    return { csrf: c.csrf, api: c.api };
  }

  setCookieTokens(base: string, csrf: string, api: string, ttlSec = 86400): void {
    const x = String(csrf || "").trim();
    const y = String(api || "").trim();
    if (!x || !y) return;
    this.host(base).cookie_tokens = { csrf: x, api: y, exp: nowSec() + Math.max(60, Number(ttlSec) || 86400) };
    this.save();
  }

  getSessionCookie(base: string): string {
    const s = this.host(base).session_cookie;
    if (!s) return "";
    if (!s.value || s.exp <= nowSec() + 10) return "";
    return s.value;
  }

  setSessionCookie(base: string, value: string, ttlSec = 86400): void {
    const v = String(value || "").trim();
    if (!v) return;
    this.host(base).session_cookie = { value: v, exp: nowSec() + Math.max(60, Number(ttlSec) || 86400) };
    this.save();
  }
}
