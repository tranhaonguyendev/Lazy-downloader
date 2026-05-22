import fsp from "node:fs/promises";
import path from "node:path";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowMs(): number {
  return Date.now();
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function uniquePath(p: string): Promise<string> {
  try {
    await fsp.access(p);
  } catch {
    return p;
  }
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  for (let i = 1; i < 9999; i += 1) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${base}_${Date.now()}${ext}`);
}
