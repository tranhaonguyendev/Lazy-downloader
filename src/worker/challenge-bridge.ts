import { BASE } from "../endpoints.js";
import { AuthCacheStore } from "../auth-cache.js";
import { nowMs } from "./fs-utils.js";
import type { ResolvedDownloadOptions } from "./options.js";

export class ChallengeBridge {
  constructor(
    private readonly config: ResolvedDownloadOptions,
    private readonly authCache: AuthCacheStore,
    private readonly log: (level: string, message: string) => void
  ) {}

  private buildUrl(targetUrl: string): string {
    return `${BASE}/?url=${encodeURIComponent(targetUrl)}`;
  }

  private async readAccessToken(page: any): Promise<{ token: string; exp: number }> {
    return page.evaluate(() => {
      const token = window.sessionStorage.getItem("access_token") || "";
      const exp = Number(window.sessionStorage.getItem("access_token_expiry") || 0);
      return { token, exp };
    });
  }

  async tryResolve(context: any, targetUrl: string): Promise<boolean> {
    if (!this.config.headful) {
      this.log("warn", `Challenge requires website verification. Re-run with --headful or open ${this.buildUrl(targetUrl)}`);
      return false;
    }

    const page = await context.newPage();
    try {
      const url = this.buildUrl(targetUrl);
      this.log("warn", `Opening challenge bridge: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.config.timeoutSec * 1000 });
      const deadline = nowMs() + this.config.timeoutSec * 1000;
      while (nowMs() < deadline) {
        await page.waitForTimeout(1000);
        const access = await this.readAccessToken(page);
        if (access.token && access.exp > nowMs() + 10000) {
          const ttlSec = Math.ceil((access.exp - nowMs()) / 1000);
          this.authCache.setBearer(BASE, access.token, ttlSec);
          const cookies = await context.cookies();
          const session = cookies.find((c: any) => c?.name === "session")?.value || "";
          if (session) this.authCache.setSessionCookie(BASE, session);
          this.log("info", "Challenge bridge resolved access token from website");
          return true;
        }
      }
      this.log("warn", "Challenge bridge timed out before website produced access token");
      return false;
    } finally {
      await page.close().catch(() => {});
    }
  }
}
