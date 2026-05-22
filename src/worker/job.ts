import fsp from "node:fs/promises";
import path from "node:path";

import { TemplateEngine } from "../template-engine.js";
import type { ResolvedDownloadOptions } from "./options.js";
import { ensureDir, uniquePath } from "./fs-utils.js";
import { fetchMetaFromWebpage, needsMetaEnrich } from "./meta.js";
import { pickApiMessage, pickAuthor, pickDuration, pickExt, pickId, pickMedias, pickSource, pickTitle, safeFileName } from "./content.js";
import { TransferManager } from "./transfer.js";

export class DownloadJobRunner {
  constructor(private readonly config: ResolvedDownloadOptions, private readonly templater: TemplateEngine, private readonly transfer: TransferManager, private readonly log: (level: string, message: string) => void) {}

  async execute(context: any, url: string, outDir: string, payload: any, timeMs: number): Promise<any> {
    const medias = pickMedias(payload);
    if (!medias.length) throw new Error(pickApiMessage(payload) || "No medias in response");
    const src = pickSource(payload);
    const sid = pickId(payload);
    let title = pickTitle(payload);
    let author = pickAuthor(payload);
    const duration = pickDuration(payload);
    const uniqueId = String(payload?.unique_id || "");
    const thumbnail = String(payload?.thumbnail || "");
    const jobs = this.config.allMedias ? medias : [medias[0]];

    if (needsMetaEnrich(title, author, sid, src)) {
      const meta = await fetchMetaFromWebpage(context, url, src, this.config);
      if (meta.title) title = meta.title;
      if (meta.author) author = meta.author;
    }
    if (src === "tiktok" && (!title || title.toLowerCase() === "tiktok")) {
      title = [author, uniqueId, sid].filter(Boolean)[0] || title || sid;
    }

    const resultPaths: string[] = [];
    const resultMedias: any[] = [];
    for (let i = 0; i < jobs.length; i += 1) {
      const media = jobs[i];
      const mediaUrl = String(media?.url || "").trim();
      if (!mediaUrl) continue;
      const info = this.buildInfo(payload, media, i, url, sid, src, title, author, uniqueId);
      const stored = await this.persistMedia(media, mediaUrl, outDir, info);
      resultPaths.push(stored.outputRef);
      resultMedias.push(this.buildMediaPayload(media, stored, i, title, author, src, sid, uniqueId, thumbnail, duration, url));
      this.log("info", `PICK [${i + 1}/${jobs.length}] type=${String(media?.type || "")} ext=${stored.ext} -> ${stored.outputRef}`);
    }
    return this.writePayload(outDir, resultPaths, resultMedias, payload, sid, src, title, author, uniqueId, thumbnail, duration, timeMs);
  }

  private buildInfo(payload: any, media: any, index: number, url: string, sid: string, src: string, title: string, author: string, uniqueId: string): any {
    const ext = String(media?.extension || "").toLowerCase().replace(/[^a-z0-9]+/g, "") || "bin";
    return { id: sid, pk: payload?.pk ?? null, source: src, title: index > 0 ? `${title}_${index + 1}` : title, author, unique_id: uniqueId || null, idx: index + 1, ext, url, webpage_url: url, media_url: String(media?.url || "").trim() };
  }

  private async persistMedia(media: any, mediaUrl: string, outDir: string, info: any): Promise<any> {
    let ext = pickExt(media, mediaUrl, "");
    let finalPath = mediaUrl;
    let outputRef = mediaUrl;
    let uploadedUrl: string | null = null;
    let contentType = "";
    let fileSize = Number(media?.data_size || 0) || 0;
    if (!this.config.onlyUrl) {
      await ensureDir(outDir);
      const rel = this.templater.resolve(info);
      const planned = path.isAbsolute(rel) ? this.templater.ensureExt(rel, info.ext) : path.join(outDir, this.templater.ensureExt(rel, info.ext));
      const saved = await this.transfer.downloadStream(mediaUrl, planned, info);
      ext = pickExt(media, mediaUrl, saved.contentType);
      finalPath = await this.maybeRenameByExt(saved.path, ext);
      outputRef = finalPath;
      contentType = saved.contentType;
      fileSize = saved.size;
      if (this.config.uploadUrl) {
        uploadedUrl = await this.transfer.uploadFile(finalPath);
        outputRef = uploadedUrl;
        if (this.config.removeLocalAfterUpload) await fsp.rm(finalPath, { force: true }).catch(() => {});
      }
    }
    return { ext, finalPath, outputRef, uploadedUrl, contentType, fileSize };
  }

  private async maybeRenameByExt(savedPath: string, ext: string): Promise<string> {
    const wanted = this.templater.ensureExt(savedPath, ext);
    if (wanted === savedPath) return savedPath;
    const uniqueWanted = await uniquePath(wanted);
    try {
      await fsp.rename(savedPath, uniqueWanted);
      return uniqueWanted;
    } catch {
      return savedPath;
    }
  }

  private buildMediaPayload(media: any, stored: any, index: number, title: string, author: string, src: string, sid: string, uniqueId: string, thumbnail: string, duration: number, url: string): any {
    return { idx: index + 1, type: String(media?.type || ""), quality: String(media?.quality || ""), extension: stored.ext, width: /^\d+$/.test(String(media?.width ?? "")) ? Number(media.width) : media?.width ?? null, height: /^\d+$/.test(String(media?.height ?? "")) ? Number(media.height) : media?.height ?? null, resolution: media?.resolution ?? null, url: String(media?.url || "").trim(), savedPath: stored.outputRef, localPath: this.config.uploadUrl && !this.config.onlyUrl ? stored.finalPath : null, uploadedUrl: this.config.onlyUrl ? String(media?.url || "").trim() : stored.uploadedUrl, contentType: stored.contentType, filesize: stored.fileSize, title, author, source: src, id: sid, unique_id: uniqueId || null, thumbnail: thumbnail || null, duration: media?.duration ?? duration, webpage_url: url };
  }

  private async writePayload(outDir: string, paths: string[], medias: any[], payload: any, sid: string, src: string, title: string, author: string, uniqueId: string, thumbnail: string, duration: number, timeMs: number): Promise<any> {
    const json = { id: payload?.id, pk: payload?.pk ?? null, source: src, title, author: author || null, unique_id: uniqueId || null, duration, thumbnail: thumbnail || null };
    const body = { paths, json, medias, timeMs };
    let jsonPath: string | null = null;
    if (this.config.writeJson) {
      const file = path.join(outDir, `${safeFileName(`${this.config.outputFile}_${src}_${sid}`)}.json`);
      jsonPath = await uniquePath(file);
      await fsp.writeFile(jsonPath, this.config.jsonPretty ? JSON.stringify(body, null, 2) : JSON.stringify(body));
    }
    if (this.config.printJson) console.log(JSON.stringify(body, null, 2));
    return { ...body, jsonPath };
  }
}
