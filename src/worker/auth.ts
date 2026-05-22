import { BASE, Endpoints } from "../endpoints.js";
import { AuthCacheStore } from "../auth-cache.js";
import type { ResolvedDownloadOptions } from "./options.js";
import { parseBootstrap, solvePow } from "./pow.js";
import { ChallengeBridge } from "./challenge-bridge.js";

const SESSION_ERRORS = /(session_required|bootstrap_expired|page_nonce_invalid|pow_context_invalid|session_expired)/i;
const CHALLENGE_ERRORS = /(challenge_required|challenge_invalid|challenge_verify_failed)/i;

export class AuthManager {
  constructor(
    private readonly config: ResolvedDownloadOptions,
    private readonly authCache: AuthCacheStore,
    private readonly bridge: ChallengeBridge
  ) {}

  private async refreshHomeState(context: any): Promise<any> {
    const page = await context.newPage();
    try {
      await page.goto(Endpoints.home(), { waitUntil: "domcontentloaded", timeout: this.config.timeoutSec * 1000 });
      await page.waitForTimeout(500);
      const bootstrap = parseBootstrap(await page.evaluate(() => (window as any).__BOOTSTRAP__ || null));
      if (!bootstrap) throw new Error("bootstrap_missing");
      const cookies = await context.cookies();
      const session = cookies.find((c: any) => c?.name === "session")?.value || "";
      if (session) this.authCache.setSessionCookie(BASE, session);
      return bootstrap;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async issueBearer(context: any, bootstrap: any, targetUrl: string): Promise<string> {
    const solution = await solvePow(bootstrap.powChallenge, bootstrap.nonce, bootstrap.powDifficulty, bootstrap.challengeType || "classic");
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Origin: BASE,
      Referer: Endpoints.home(),
      "User-Agent": this.config.userAgent,
      "X-Page-Nonce": bootstrap.nonce
    };
    if (solution) headers["X-Pow-Solution"] = solution;

    const response = await context.request.post(Endpoints.authIssue(), { headers, timeout: this.config.timeoutSec * 1000 });
    const text = await response.text();
    if (response.status() !== 200) {
      if (CHALLENGE_ERRORS.test(text) && (await this.bridge.tryResolve(context, targetUrl))) {
        return this.authCache.getBearer(BASE);
      }
      throw new Error(`Auth issue HTTP ${response.status()}: ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text || "{}");
    const token = String(json?.accessToken || json?.token || json?.data?.accessToken || "").trim();
    const expiresInSec = Number(json?.expiresIn || json?.data?.expiresIn || 180) || 180;
    if (!token) throw new Error("access_token_issue_failed");
    this.authCache.setBearer(BASE, token, expiresInSec);
    return token;
  }

  private async postAutolink(context: any, targetUrl: string, token: string): Promise<{ status: number; text: string }> {
    const response = await context.request.post(Endpoints.autolink(), {
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
    const text = await response.text();
    if (response.status() === 401) this.authCache.clearBearer(BASE);
    return { status: response.status(), text };
  }

  async autolink(context: any, targetUrl: string, skipHome = false): Promise<any> {
    const session = this.authCache.getSessionCookie(BASE);
    if (session) {
      await context.addCookies([{ name: "session", value: session, domain: "j2download.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    }

    const run = async (): Promise<{ status: number; text: string }> => {
      const cached = this.authCache.getBearer(BASE);
      if (cached) {
        const result = await this.postAutolink(context, targetUrl, cached);
        if (result.status === 200) return result;
      }
      const bootstrap = await this.refreshHomeState(context);
      const token = await this.issueBearer(context, bootstrap, targetUrl);
      return this.postAutolink(context, targetUrl, token);
    };

    let result = await run();
    if (result.status === 200) {
      const json = JSON.parse(result.text || "{}");
      const challengeError = `${json?.error || ""} ${json?.data?.error || ""}`;
      if (CHALLENGE_ERRORS.test(challengeError) && (await this.bridge.tryResolve(context, targetUrl))) {
        const token = this.authCache.getBearer(BASE);
        if (token) result = await this.postAutolink(context, targetUrl, token);
      }
    } else if (result.status === 401 && SESSION_ERRORS.test(result.text) && !skipHome) {
      result = await run();
    }

    if (result.status !== 200) throw new Error(`Autolink HTTP ${result.status}: ${result.text.slice(0, 300)}`);
    return JSON.parse(result.text || "{}");
  }
}
