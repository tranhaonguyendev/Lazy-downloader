import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { chromium } from "playwright";

import { BASE, Endpoints } from "./endpoints.js";
import { TemplateEngine } from "./template-engine.js";
import { AuthCacheStore } from "./auth-cache.js";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs(): number {
  return Date.now();
}

export class DownloadWorker {
  private readonly config: Required<DownloadOptions>;
  private readonly templater: TemplateEngine;
  private readonly authCache: AuthCacheStore;

  constructor(options: DownloadOptions = {}) {
    this.config = {
      headful: false,
      allMedias: false,
      unlock: true,
      timeoutSec: 60,
      maxRetries: 3,
      outputFile: "AIO-Downloaded",
      writeJson: false,
      jsonPretty: true,
      printJson: true,
      outtmpl: "%(title)s.%(ext)s",
      progressHooks: [],
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      ...options
    };
    this.templater = new TemplateEngine(this.config.outtmpl);
    this.authCache = new AuthCacheStore();
  }

  private log(level: string, msg: string): void {
    const t = new Date().toTimeString().slice(0, 8);
    console.log(`${t} | ${level.toUpperCase()} | ${msg}`);
  }

  private hook(payload: any): void {
    for (const h of this.config.progressHooks || []) {
      try {
        h(payload);
      } catch {
        // ignore hook errors
      }
    }
  }

  private safeFileName(name: string): string {
    let s = String(name || "download").replace(/\x00/g, "");
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    s = s.replace(/[^a-z0-9._-]+/g, "").replace(/[.]{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "");
    s = s.slice(0, 240);
    return s || "download";
  }

  private pickMedias(j: any): any[] {
    if (!j || typeof j !== "object") return [];
    if (Array.isArray(j.medias)) return j.medias.filter((m: any) => m && typeof m === "object" && m.url);
    if (j.data && typeof j.data === "object" && Array.isArray(j.data.medias)) {
      return j.data.medias.filter((m: any) => m && typeof m === "object" && m.url);
    }
    return [];
  }

  private pickId(j: any): string {
    const raw = j?.id || j?.pk || j?.url || String(nowMs());
    return String(raw).replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 64) || String(nowMs());
  }

  private pickSource(j: any): string {
    const s = String(j?.source || "media").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
    return s.slice(0, 24) || "media";
  }

  private pickTitle(j: any): string {
    const t = String(j?.title || j?.data?.title || "").trim();
    return t || this.pickId(j);
  }

  private pickAuthor(j: any): string {
    for (const k of ["author", "unique_id", "username", "user", "owner"]) {
      const v = j?.[k] ?? j?.data?.[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  private pickDuration(j: any): number {
    const v = j?.duration ?? j?.data?.duration;
    if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
    if (/^\d+$/.test(String(v || ""))) return Number(v);
    return 0;
  }

  private pickExtFromUrl(mediaUrl: string): string {
    try {
      const p = new URL(mediaUrl);
      const m = p.pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
      if (!m) return "";
      return m[1].toLowerCase().replace(/[^a-z0-9]+/g, "");
    } catch {
      return "";
    }
  }

  private pickExtFromContentType(ct: string): string {
    const s = String(ct || "").split(";")[0].trim().toLowerCase();
    if (s.endsWith("jpeg")) return "jpg";
    if (s.endsWith("png")) return "png";
    if (s.endsWith("webp")) return "webp";
    if (s.endsWith("gif")) return "gif";
    if (s.endsWith("mp4")) return "mp4";
    if (s.endsWith("mpeg")) return "mp3";
    if (s.endsWith("aac")) return "aac";
    if (s.endsWith("ogg")) return "ogg";
    if (s.endsWith("audio/mp4")) return "m4a";
    return "";
  }

  private pickExt(media: any, mediaUrl: string, contentType = ""): string {
    const ext0 = String(media?.extension || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (ext0) return ext0;
    const ext1 = this.pickExtFromUrl(mediaUrl);
    if (ext1) return ext1;
    const ext2 = this.pickExtFromContentType(contentType);
    if (ext2) return ext2;
    return "bin";
  }

  private async ensureDir(dir: string): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
  }

  private async uniquePath(p: string): Promise<string> {
    try {
      await fsp.access(p);
    } catch {
      return p;
    }
    const d = path.dirname(p);
    const ext = path.extname(p);
    const base = path.basename(p, ext);
    for (let i = 1; i < 9999; i += 1) {
      const candidate = path.join(d, `${base}_${i}${ext}`);
      try {
        await fsp.access(candidate);
      } catch {
        return candidate;
      }
    }
    return path.join(d, `${base}_${Date.now()}${ext}`);
  }

  private needsMetaEnrich(title: string, author: string, sid: string, source: string): boolean {
    const src = String(source || "").toLowerCase();
    if (!["facebook", "threads", "instagram", "tiktok"].includes(src)) return false;
    const t = String(title || "").trim().toLowerCase();
    if (!author) return true;
    if (!t) return true;
    if (sid && t === String(sid).toLowerCase()) return true;
    return t.startsWith("http") || t.length < 4 || t === "tiktok";
  }

  private async fetchMetaFromWebpage(context: any, webpageUrl: string, source: string): Promise<{ title: string; author: string }> {
    const headers = { "user-agent": this.config.userAgent };
    let title = "";
    let author = "";

    const parseHtml = (html: string) => {
      const mTitle =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>(.*?)<\/title>/is);
      const mAuthor =
        html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
      return {
        title: (mTitle?.[1] || "").replace(/\s+/g, " ").trim(),
        author: (mAuthor?.[1] || "").replace(/\s+/g, " ").trim()
      };
    };

    try {
      const r = await fetch(webpageUrl, { headers, redirect: "follow" });
      if (r.ok) {
        const html = await r.text();
        const parsed = parseHtml(html);
        title = parsed.title;
        author = parsed.author;
      }
    } catch {
      // ignore
    }

    // For tiktok: avoid slow page navigation; prefer fast HTML meta.
    if (source === "tiktok") {
      return { title, author };
    }

    if (title && author) return { title, author };

    let page: any;
    try {
      page = await context.newPage();
      await page.goto(webpageUrl, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(20000, this.config.timeoutSec * 1000)
      });
      await page.waitForTimeout(600);
      if (!title) title = String(await page.title()).trim();
      if (!author) {
        const el = await page.$("meta[name='author']");
        if (el) author = String(await el.evaluate((x: any) => x.getAttribute("content") || "")).trim();
      }
      if (!author && title.includes("|")) author = title.split("|")[0].trim();
    } catch {
      // ignore
    } finally {
      if (page) await page.close().catch(() => {});
    }
    return { title, author };
  }

  private j2h(buf: Uint8Array, n: number): number {
    const imul = Math.imul;
    let a = (2783036115 + n) >>> 0;
    let h = (2134608921 ^ n) >>> 0;
    let i = (3572102818 + (n << 16)) >>> 0;
    for (let l = 0; l < n; l += 1) {
      a = (a ^ buf[l]) >>> 0;
      a = imul(a, 2654435769) >>> 0;
      a = ((a << 13) | (a >>> 19)) >>> 0;

      h = (h + a) >>> 0;
      h = imul(h, 1367130551) >>> 0;
      h = ((h << 17) | (h >>> 15)) >>> 0;

      i = (i ^ ((a + h) >>> 0)) >>> 0;
      i = imul(i, 1818371886) >>> 0;
      i = ((i << 11) | (i >>> 21)) >>> 0;

      a = (a + i) >>> 0;
    }
    a ^= a >>> 16;
    a = imul(a, 2246822507) >>> 0;
    a ^= a >>> 13;
    a = imul(a, 3266489909) >>> 0;
    a ^= a >>> 16;

    h ^= h >>> 16;
    h = imul(h, 3432918353) >>> 0;
    h ^= h >>> 13;
    h = imul(h, 461845907) >>> 0;
    h ^= h >>> 16;

    return (a ^ h ^ i) >>> 0;
  }

  private solvePow(challenge: string, difficulty: number): string {
    if (!challenge || !difficulty) return "";
    const shift = 32 - Number(difficulty) * 4;
    const prefix = new TextEncoder().encode(`${challenge}:`);
    for (let n = 0; n < 100000000; n += 1) {
      const suffix = new TextEncoder().encode(String(n));
      const buf = new Uint8Array(prefix.length + suffix.length);
      buf.set(prefix);
      buf.set(suffix, prefix.length);
      if ((this.j2h(buf, buf.length) >>> shift) === 0) return String(n);
    }
    return "";
  }

  private async autolinkWithCookie(context: any, url: string, csrf: string, apiToken: string): Promise<any | null> {
    const payload = { data: { url, unlock: Boolean(this.config.unlock) } };
    const resp = await context.request.post(Endpoints.autolink(), {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: BASE,
        Referer: Endpoints.home(),
        "User-Agent": this.config.userAgent,
        "x-csrf-token": csrf,
        Cookie: `api_token=${apiToken}; csrf_token=${csrf}`
      },
      data: payload,
      timeout: this.config.timeoutSec * 1000
    });
    if (resp.status() !== 200) return null;
    return await resp.json();
  }

  private async autolinkWithBearer(context: any, url: string, token: string): Promise<any | null> {
    const payload = { data: { url, unlock: Boolean(this.config.unlock) } };
    const resp = await context.request.post(Endpoints.autolink(), {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: BASE,
        Referer: Endpoints.home(),
        "User-Agent": this.config.userAgent,
        Authorization: `Bearer ${token}`
      },
      data: payload,
      timeout: this.config.timeoutSec * 1000
    });
    const txt = await resp.text();
    if (resp.status() !== 200) {
      if (resp.status() === 401) this.authCache.clearBearer(BASE);
      return null;
    }
    return JSON.parse(txt);
  }

  private async autolinkAuthFlow(context: any, targetUrl: string, skipHome = false): Promise<any> {
    const runHttp = async (): Promise<{ status: number; phase: string; text: string }> => {
      const b = await context.request.get(Endpoints.authBootstrap(), {
        timeout: this.config.timeoutSec * 1000,
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: BASE,
          Referer: Endpoints.home(),
          "User-Agent": this.config.userAgent
        }
      });
      const btxt = await b.text();
      if (b.status() !== 200) return { status: b.status(), phase: "bootstrap", text: btxt };
      const bj = JSON.parse(btxt || "{}");
      const nonce = String(bj.nonce || "").trim();
      if (!nonce) return { status: 500, phase: "bootstrap", text: "nonce_missing" };
      const solution = this.solvePow(String(bj.powChallenge || ""), Number(bj.powDifficulty || 0));

      const issueHeaders: Record<string, string> = {
        "X-Page-Nonce": nonce,
        Origin: BASE,
        Referer: Endpoints.home(),
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*"
      };
      if (solution) issueHeaders["X-Pow-Solution"] = solution;

      const i = await context.request.post(Endpoints.authIssue(), {
        headers: issueHeaders,
        timeout: this.config.timeoutSec * 1000
      });
      const itxt = await i.text();
      if (i.status() !== 200) return { status: i.status(), phase: "issue", text: itxt };

      const ij = JSON.parse(itxt || "{}");
      const token = String(ij.accessToken || ij.token || ij?.data?.accessToken || "").trim();
      const expSec = Number(ij.expiresIn || ij?.data?.expiresIn || 180) || 180;
      if (!token) return { status: 500, phase: "issue", text: "token_missing" };
      this.authCache.setBearer(BASE, token, expSec);

      const r = await context.request.post(Endpoints.autolink(), {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Origin: BASE,
          Referer: Endpoints.home(),
          "User-Agent": this.config.userAgent,
          Authorization: `Bearer ${token}`
        },
        data: { data: { url: targetUrl, unlock: Boolean(this.config.unlock) } },
        timeout: this.config.timeoutSec * 1000
      });
      return { status: r.status(), phase: "autolink", text: await r.text() };
    };

    const session = this.authCache.getSessionCookie(BASE);
    if (session) {
      await context.addCookies([
        {
          name: "session",
          value: session,
          domain: "j2download.com",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax"
        }
      ]);
    }

    let result = await runHttp();
    if (result.status === 401 && /session_required/i.test(result.text || "") && !skipHome) {
      const page = await context.newPage();
      try {
        await page.goto(Endpoints.home(), {
          waitUntil: "domcontentloaded",
          timeout: this.config.timeoutSec * 1000
        });
        await page.waitForTimeout(300);
      } finally {
        await page.close().catch(() => {});
      }
      const cookies = await context.cookies();
      const s = cookies.find((c: any) => c?.name === "session")?.value || "";
      if (s) this.authCache.setSessionCookie(BASE, s);
      result = await runHttp();
    }

    if (result.status !== 200) {
      throw new Error(`Autolink HTTP ${result.status} phase=${result.phase}: ${(result.text || "").slice(0, 300)}`);
    }
    return JSON.parse(result.text || "{}");
  }

  private async autolink(context: any, url: string, skipHome = false): Promise<any> {
    const cookies = await context.cookies();
    const map = Object.fromEntries(cookies.filter((c: any) => c?.name).map((c: any) => [c.name, c.value]));
    const cachedTokens = this.authCache.getCookieTokens(BASE);
    const csrf = map.csrf_token || cachedTokens.csrf;
    const apiToken = map.api_token || cachedTokens.api;

    if (csrf && apiToken) {
      const j = await this.autolinkWithCookie(context, url, csrf, apiToken);
      if (j) {
        this.authCache.setCookieTokens(BASE, csrf, apiToken);
        return j;
      }
    }

    const bearer = this.authCache.getBearer(BASE);
    if (bearer) {
      const j = await this.autolinkWithBearer(context, url, bearer);
      if (j) return j;
    }

    return this.autolinkAuthFlow(context, url, skipHome);
  }

  private async downloadStream(mediaUrl: string, outPath: string, info: any): Promise<{ path: string; contentType: string; size: number }> {
    await this.ensureDir(path.dirname(outPath));
    const finalOut = await this.uniquePath(outPath);

    const t0 = nowMs();
    const resp = await fetch(mediaUrl, {
      headers: {
        "user-agent": this.config.userAgent,
        accept: "*/*"
      }
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${String(txt).slice(0, 300)}`);
    }

    const ct = resp.headers.get("content-type") || "";
    const total = Number(resp.headers.get("content-length") || 0) || null;
    this.log("info", `GET ${resp.status} ct=${ct} len=${resp.headers.get("content-length") || ""}`);

    const ws = fs.createWriteStream(finalOut, { flags: "w" });
    let downloaded = 0;
    let lastEmit = 0;

    this.hook({
      status: "downloading",
      filename: finalOut,
      downloaded_bytes: downloaded,
      total_bytes: total,
      elapsed: 0,
      eta: null,
      speed: null,
      info_dict: info
    });

    for await (const chunk of Readable.fromWeb(resp.body as any)) {
      ws.write(chunk);
      downloaded += chunk.length;
      const now = nowMs();
      if (now - lastEmit >= 250) {
        const elapsed = Math.max(0.001, (now - t0) / 1000);
        const speed = downloaded / elapsed;
        const eta = total && speed > 0 ? Math.floor((total - downloaded) / speed) : null;
        this.hook({
          status: "downloading",
          filename: finalOut,
          downloaded_bytes: downloaded,
          total_bytes: total,
          elapsed,
          eta,
          speed,
          info_dict: info
        });
        lastEmit = now;
      }
    }

    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.on("error", reject);
    });

    const st = await fsp.stat(finalOut);
    if (!st.size) {
      await fsp.rm(finalOut, { force: true }).catch(() => {});
      throw new Error("Downloaded file is empty");
    }

    const elapsed = Math.max(0.001, (nowMs() - t0) / 1000);
    this.log("info", `SAVED -> ${finalOut} bytes=${st.size}`);
    this.hook({
      status: "finished",
      filename: finalOut,
      downloaded_bytes: st.size,
      total_bytes: total,
      elapsed,
      eta: 0,
      speed: st.size / elapsed,
      info_dict: info
    });

    return { path: finalOut, contentType: ct, size: st.size };
  }

  async download(url: string, outDir: string, reuseBrowser = true): Promise<any> {
    await this.ensureDir(outDir);
    let lastErr: any;

    const browser = await chromium.launch({ headless: !this.config.headful });
    const context = await browser.newContext({ userAgent: this.config.userAgent });

    try {
      let hasWarm = false;
      const cookies = await context.cookies();
      const map = Object.fromEntries(cookies.filter((c: any) => c?.name).map((c: any) => [c.name, c.value]));
      if (map.csrf_token && map.api_token) hasWarm = true;
      if (this.authCache.getBearer(BASE)) hasWarm = true;
      if (this.authCache.getSessionCookie(BASE)) hasWarm = true;
      if (!hasWarm && reuseBrowser) {
        const p = await context.newPage();
        await p.goto(Endpoints.home(), { waitUntil: "networkidle", timeout: this.config.timeoutSec * 1000 });
        await p.waitForTimeout(500);
        await p.close();
      }

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt += 1) {
        try {
          const t0 = nowMs();
          const j = await this.autolink(context, url, attempt > 1);
          const dt = nowMs() - t0;

          const medias = this.pickMedias(j);
          if (!medias.length) throw new Error("No medias in response");

          this.log("info", `Autolink ok medias=${medias.length} ms=${dt}`);
          const jobs = this.config.allMedias ? medias : [medias[0]];

          const src = this.pickSource(j);
          const sid = this.pickId(j);
          let title = this.pickTitle(j);
          let author = this.pickAuthor(j);
          const duration = this.pickDuration(j);
          const uniqueId = String(j?.unique_id || "");
          const thumbnail = String(j?.thumbnail || "");

          if (this.needsMetaEnrich(title, author, sid, src)) {
            const m = await this.fetchMetaFromWebpage(context, url, src);
            if (m.title) title = m.title;
            if (m.author) author = m.author;
          }

          // Better tiktok title fallback when API returns generic title.
          if (src === "tiktok" && (!title || title.toLowerCase() === "tiktok")) {
            title = [author, uniqueId, sid].filter(Boolean)[0] || title || sid;
          }

          const paths: string[] = [];
          const parsed: any[] = [];

          for (let i = 0; i < jobs.length; i += 1) {
            const m = jobs[i];
            const mediaUrl = String(m?.url || "").trim();
            if (!mediaUrl) continue;

            const extPlan = String(m?.extension || "").toLowerCase().replace(/[^a-z0-9]+/g, "") || "bin";
            const titleForFile = jobs.length > 1 && i > 0 ? `${title}_${i + 1}` : title;

            const info = {
              id: sid,
              pk: j?.pk ?? null,
              source: src,
              title: titleForFile,
              author,
              unique_id: uniqueId || null,
              idx: i + 1,
              ext: extPlan,
              url,
              webpage_url: url,
              media_url: mediaUrl
            };

            const rel = this.templater.resolve(info);
            const outPath0 = path.isAbsolute(rel) ? this.templater.ensureExt(rel, extPlan) : path.join(outDir, this.templater.ensureExt(rel, extPlan));

            const saved = await this.downloadStream(mediaUrl, outPath0, info);
            const ext = this.pickExt(m, mediaUrl, saved.contentType);
            let finalPath = saved.path;
            const want = this.templater.ensureExt(saved.path, ext);
            if (want !== saved.path) {
              const uniqueWant = await this.uniquePath(want);
              try {
                await fsp.rename(saved.path, uniqueWant);
                finalPath = uniqueWant;
              } catch {
                finalPath = saved.path;
              }
            }

            paths.push(finalPath);
            parsed.push({
              idx: i + 1,
              type: String(m?.type || ""),
              quality: String(m?.quality || ""),
              extension: ext,
              width: /^\d+$/.test(String(m?.width ?? "")) ? Number(m.width) : m?.width ?? null,
              height: /^\d+$/.test(String(m?.height ?? "")) ? Number(m.height) : m?.height ?? null,
              resolution: m?.resolution ?? null,
              url: mediaUrl,
              savedPath: finalPath,
              contentType: saved.contentType,
              filesize: saved.size,
              title,
              author,
              source: src,
              id: sid,
              unique_id: uniqueId || null,
              thumbnail: thumbnail || null,
              duration: m?.duration ?? duration,
              webpage_url: url
            });

            this.log("info", `PICK [${i + 1}/${jobs.length}] type=${String(m?.type || "")} ext=${ext} -> ${finalPath}`);
          }

          const jMini = {
            id: j?.id,
            pk: j?.pk ?? null,
            source: src,
            title,
            author: author || null,
            unique_id: uniqueId || null,
            duration,
            thumbnail: thumbnail || null
          };

          const payload = { paths, json: jMini, medias: parsed, timeMs: dt };
          let jsonPath: string | null = null;

          if (this.config.writeJson) {
            const out = path.join(outDir, `${this.safeFileName(`${this.config.outputFile}_${src}_${sid}`)}.json`);
            const outUnique = await this.uniquePath(out);
            await fsp.writeFile(outUnique, this.config.jsonPretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload));
            jsonPath = outUnique;
          }

          if (this.config.printJson) {
            console.log(JSON.stringify(payload, null, 2));
          }

          return { ...payload, jsonPath };
        } catch (e: any) {
          lastErr = e;
          this.log("error", `Attempt ${attempt}/${this.config.maxRetries} failed: ${e?.message || e}`);
          if (attempt < this.config.maxRetries) await sleep(800 * attempt);
        }
      }
      throw lastErr || new Error("Download failed");
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }
}
