import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import type { ResolvedDownloadOptions } from "./options.js";
import { ensureDir, nowMs, uniquePath } from "./fs-utils.js";

export class TransferManager {
  constructor(
    private readonly config: ResolvedDownloadOptions,
    private readonly log: (level: string, message: string) => void,
    private readonly hook: (payload: any) => void
  ) {}

  async downloadStream(mediaUrl: string, outPath: string, info: any): Promise<{ path: string; contentType: string; size: number }> {
    await ensureDir(path.dirname(outPath));
    const finalOut = await uniquePath(outPath);
    const startedAt = nowMs();
    const response = await fetch(mediaUrl, { headers: { "user-agent": this.config.userAgent, accept: "*/*" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(await response.text().catch(() => "")).slice(0, 300)}`);

    const contentType = response.headers.get("content-type") || "";
    const total = Number(response.headers.get("content-length") || 0) || null;
    const writer = fs.createWriteStream(finalOut, { flags: "w" });
    let downloaded = 0;
    let lastEmit = 0;
    this.log("info", `GET ${response.status} ct=${contentType} len=${response.headers.get("content-length") || ""}`);
    this.hook({ status: "downloading", filename: finalOut, downloaded_bytes: 0, total_bytes: total, elapsed: 0, eta: null, speed: null, info_dict: info });

    for await (const chunk of Readable.fromWeb(response.body as any)) {
      writer.write(chunk);
      downloaded += chunk.length;
      const now = nowMs();
      if (now - lastEmit >= 250) {
        const elapsed = Math.max(0.001, (now - startedAt) / 1000);
        const speed = downloaded / elapsed;
        const eta = total && speed > 0 ? Math.floor((total - downloaded) / speed) : null;
        this.hook({ status: "downloading", filename: finalOut, downloaded_bytes: downloaded, total_bytes: total, elapsed, eta, speed, info_dict: info });
        lastEmit = now;
      }
    }

    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on("error", reject);
    });
    const stat = await fsp.stat(finalOut);
    if (!stat.size) {
      await fsp.rm(finalOut, { force: true }).catch(() => {});
      throw new Error("Downloaded file is empty");
    }

    const elapsed = Math.max(0.001, (nowMs() - startedAt) / 1000);
    this.log("info", `SAVED -> ${finalOut} bytes=${stat.size}`);
    this.hook({ status: "finished", filename: finalOut, downloaded_bytes: stat.size, total_bytes: total, elapsed, eta: 0, speed: stat.size / elapsed, info_dict: info });
    return { path: finalOut, contentType, size: stat.size };
  }

  async uploadFile(localPath: string): Promise<string> {
    const bytes = await fsp.readFile(localPath);
    const form = new FormData();
    form.append(this.config.uploadField || "file", new Blob([bytes]), path.basename(localPath));
    const headers: Record<string, string> = {};
    if (this.config.uploadToken) headers.Authorization = `Bearer ${this.config.uploadToken}`;
    const response = await fetch(this.config.uploadUrl, { method: "POST", headers, body: form });
    const text = await response.text();
    if (!response.ok) throw new Error(`Upload HTTP ${response.status}: ${text.slice(0, 300)}`);
    const body = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })();
    return this.extractUploadedUrl(body);
  }

  private extractUploadedUrl(body: any): string {
    if (!body) return "";
    if (typeof body === "string") return /^https?:\/\//i.test(body.trim()) ? body.trim() : "";
    for (const key of ["url", "fileUrl", "link", "location", "secure_url", "download_url"]) {
      const value = body?.[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
    }
    for (const key of ["data", "result", "payload", "file"]) {
      const nested = this.extractUploadedUrl(body?.[key]);
      if (nested) return nested;
    }
    throw new Error("Upload succeeded but cannot find URL in response");
  }
}
