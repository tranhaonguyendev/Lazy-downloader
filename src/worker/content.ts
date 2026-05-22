import { nowMs } from "./fs-utils.js";

export function safeFileName(name: string): string {
  let s = String(name || "download").replace(/\x00/g, "");
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/[^a-z0-9._-]+/g, "").replace(/[.]{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "");
  s = s.slice(0, 240);
  return s || "download";
}

export function pickMedias(payload: any): any[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.medias)) return payload.medias.filter((m: any) => m && typeof m === "object" && m.url);
  if (payload.data && Array.isArray(payload.data.medias)) {
    return payload.data.medias.filter((m: any) => m && typeof m === "object" && m.url);
  }
  return [];
}

export function pickApiMessage(payload: any): string {
  const candidates = [payload?.message, payload?.error?.message, payload?.data?.message, payload?.data?.error?.message];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text.replace(/\s+/g, " ");
  }
  return "";
}

export function pickId(payload: any): string {
  const raw = payload?.id || payload?.pk || payload?.url || String(nowMs());
  return String(raw).replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 64) || String(nowMs());
}

export function pickSource(payload: any): string {
  const source = String(payload?.source || "media").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
  return source.slice(0, 24) || "media";
}

export function pickTitle(payload: any): string {
  const title = String(payload?.title || payload?.data?.title || "").trim();
  return title || pickId(payload);
}

export function pickAuthor(payload: any): string {
  for (const key of ["author", "unique_id", "username", "user", "owner"]) {
    const value = payload?.[key] ?? payload?.data?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function pickDuration(payload: any): number {
  const value = payload?.duration ?? payload?.data?.duration;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (/^\d+$/.test(String(value || ""))) return Number(value);
  return 0;
}

export function pickExtFromUrl(mediaUrl: string): string {
  try {
    const parsed = new URL(mediaUrl);
    const match = parsed.pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
    return match ? match[1].toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
  } catch {
    return "";
  }
}

export function pickExtFromContentType(contentType: string): string {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (value.endsWith("jpeg")) return "jpg";
  if (value.endsWith("png")) return "png";
  if (value.endsWith("webp")) return "webp";
  if (value.endsWith("gif")) return "gif";
  if (value.endsWith("mp4")) return "mp4";
  if (value.endsWith("mpeg")) return "mp3";
  if (value.endsWith("aac")) return "aac";
  if (value.endsWith("ogg")) return "ogg";
  if (value.endsWith("audio/mp4")) return "m4a";
  return "";
}

export function pickExt(media: any, mediaUrl: string, contentType = ""): string {
  const fromMedia = String(media?.extension || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (fromMedia) return fromMedia;
  return pickExtFromUrl(mediaUrl) || pickExtFromContentType(contentType) || "bin";
}
