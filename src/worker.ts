import { chromium } from "playwright";

import { AuthCacheStore } from "./auth-cache.js";
import { BASE, Endpoints } from "./endpoints.js";
import { TemplateEngine } from "./template-engine.js";
import { sleep } from "./worker/fs-utils.js";
import { DownloadJobRunner } from "./worker/job.js";
import { resolveOptions, type DownloadOptions, type ResolvedDownloadOptions } from "./worker/options.js";
import { TransferManager } from "./worker/transfer.js";
import { ChallengeBridge } from "./worker/challenge-bridge.js";
import { AuthManager } from "./worker/auth.js";

export type { DownloadOptions } from "./worker/options.js";

export class DownloadWorker {
  private readonly config: ResolvedDownloadOptions;
  private readonly authCache: AuthCacheStore;
  private readonly templater: TemplateEngine;
  private readonly transfer: TransferManager;
  private readonly auth: AuthManager;
  private readonly jobs: DownloadJobRunner;

  constructor(options: DownloadOptions = {}) {
    this.config = resolveOptions(options);
    this.authCache = new AuthCacheStore();
    this.templater = new TemplateEngine(this.config.outtmpl);
    this.transfer = new TransferManager(this.config, this.log.bind(this), this.hook.bind(this));
    this.auth = new AuthManager(this.config, this.authCache, new ChallengeBridge(this.config, this.authCache, this.log.bind(this)));
    this.jobs = new DownloadJobRunner(this.config, this.templater, this.transfer, this.log.bind(this));
  }

  private log(level: string, msg: string): void {
    const t = new Date().toTimeString().slice(0, 8);
    console.log(`${t} | ${level.toUpperCase()} | ${msg}`);
  }

  private hook(payload: any): void {
    for (const h of this.config.progressHooks || []) {
      try {
        h(payload);
      } catch {}
    }
  }

  private async warmHome(context: any, reuseBrowser: boolean): Promise<void> {
    let hasWarm = false;
    if (this.authCache.getBearer(BASE)) hasWarm = true;
    if (this.authCache.getSessionCookie(BASE)) hasWarm = true;
    if (hasWarm || !reuseBrowser) return;

    const page = await context.newPage();
    try {
      await page.goto(Endpoints.home(), { waitUntil: "networkidle", timeout: this.config.timeoutSec * 1000 });
      await page.waitForTimeout(500);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async download(url: string, outDir: string, reuseBrowser = true): Promise<any> {
    let lastErr: any;
    const browser = await chromium.launch({ headless: !this.config.headful });
    const context = await browser.newContext({ userAgent: this.config.userAgent });

    try {
      await this.warmHome(context, reuseBrowser);
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt += 1) {
        try {
          const startedAt = Date.now();
          const payload = await this.auth.autolink(context, url, attempt > 1);
          const timeMs = Date.now() - startedAt;
          this.log("info", `Autolink ok ms=${timeMs}`);
          return await this.jobs.execute(context, url, outDir, payload, timeMs);
        } catch (error: any) {
          lastErr = error;
          this.log("error", `Attempt ${attempt}/${this.config.maxRetries} failed: ${error?.message || error}`);
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
