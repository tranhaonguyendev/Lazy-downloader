import type { ResolvedDownloadOptions } from "./options.js";

export function needsMetaEnrich(title: string, author: string, sid: string, source: string): boolean {
  const src = String(source || "").toLowerCase();
  const text = String(title || "").trim().toLowerCase();
  if (!["facebook", "threads", "instagram", "tiktok"].includes(src)) return false;
  if (!author || !text) return true;
  if (sid && text === String(sid).toLowerCase()) return true;
  return text.startsWith("http") || text.length < 4 || text === "tiktok";
}

export async function fetchMetaFromWebpage(
  context: any,
  webpageUrl: string,
  source: string,
  config: ResolvedDownloadOptions
): Promise<{ title: string; author: string }> {
  const headers = { "user-agent": config.userAgent };
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

  let title = "";
  let author = "";
  try {
    const response = await fetch(webpageUrl, { headers, redirect: "follow" });
    if (response.ok) {
      const parsed = parseHtml(await response.text());
      title = parsed.title;
      author = parsed.author;
    }
  } catch {}

  if (source === "tiktok" || (title && author)) return { title, author };

  let page: any;
  try {
    page = await context.newPage();
    await page.goto(webpageUrl, { waitUntil: "domcontentloaded", timeout: Math.min(20000, config.timeoutSec * 1000) });
    await page.waitForTimeout(600);
    if (!title) title = String(await page.title()).trim();
    if (!author) {
      const el = await page.$("meta[name='author']");
      if (el) author = String(await el.evaluate((x: any) => x.getAttribute("content") || "")).trim();
    }
    if (!author && title.includes("|")) author = title.split("|")[0].trim();
  } catch {} finally {
    if (page) await page.close().catch(() => {});
  }
  return { title, author };
}
