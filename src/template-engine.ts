import path from "node:path";

export class TemplateEngine {
  private readonly outtmpl: string;
  private readonly maxLen: number;

  constructor(outtmpl = "%(title)s.%(ext)s", maxLen = 240) {
    this.outtmpl = outtmpl || "%(id)s.%(ext)s";
    this.maxLen = Math.max(32, Number(maxLen) || 240);
  }

  private norm(s: string): string {
    return String(s || "")
      .replace(/\x00/g, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .trim()
      .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  private safeBase(s: string): string {
    let x = this.norm(s).replace(/^[ ._]+|[ ._]+$/g, "");
    x = x.replace(/\s+\./g, ".");
    if (!x) x = "download";
    if (x.length > this.maxLen) x = x.slice(0, this.maxLen).replace(/[ ._]+$/g, "");
    return x || "download";
  }

  private apply(tmpl: string, info: Record<string, unknown>): string {
    return tmpl.replace(/%\(([^)]+)\)s/g, (_m, k: string) => {
      const v = info?.[k];
      return v == null ? "" : String(v);
    });
  }

  resolve(info: Record<string, unknown>): string {
    const applied = this.apply(this.outtmpl, info);
    const unified = applied.split("/").join(path.sep).split("\\").join(path.sep);
    const parts = unified.split(path.sep).filter((p) => p && p !== "." && p !== "..");
    if (!parts.length) parts.push("download");
    parts[parts.length - 1] = this.safeBase(parts[parts.length - 1]);
    return path.join(...parts);
  }

  ensureExt(filePath: string, ext: string): string {
    const cleanExt = String(ext || "bin").replace(/^\.+/, "");
    const parsed = path.parse(filePath);
    const current = parsed.ext.replace(/^\./, "");
    if (current.toLowerCase() === cleanExt.toLowerCase()) return filePath;
    return path.join(parsed.dir, `${parsed.name}.${cleanExt}`);
  }
}
