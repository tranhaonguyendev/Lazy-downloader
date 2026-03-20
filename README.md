# Dự án lazy Downloader 1.0.0

[![npm](https://img.shields.io/npm/v/lazy-downloader.svg)](https://www.npmjs.com/package/lazy-downloader)
[![Node](https://img.shields.io/node/v/lazy-downloader.svg)](https://www.npmjs.com/package/lazy-downloader)
[![License](https://img.shields.io/npm/l/lazy-downloader.svg)](https://www.npmjs.com/package/lazy-downloader)

`lazy-downloader` là CLI Node.js để parse URL và tải media trực tiếp từ nhiều nền tảng.

## Install

```bash
npm install -g lazy-downloader
npx playwright install chromium
```

## CLI

```bash
lazy-down "URL" -P downloads --all -o "%(title)s_%(idx)s.%(ext)s"
```

### Options (tóm tắt)

- `-P, --paths`: thư mục lưu
- `-o, --outtmpl`: output template
- `--all`: tải tất cả media
- `--headful`: mở browser UI
- `--no-unlock`: tắt unlock
- `--timeout`: timeout giây
- `--write-json`: ghi JSON cạnh file
- `--quiet`: tắt progress

## Library (Node.js)

```js
import { DownloadWorker } from "lazy-downloader";

const w = new DownloadWorker({ allMedias: true, outtmpl: "%(title)s_%(idx)s.%(ext)s" });
const res = await w.download("URL", "downloads");
console.log(res.paths);
```

## Progress Hooks

Hook nhận object trạng thái.

```js
import { DownloadWorker } from "lazy-downloader";

const hook = (d) => {
  if (d.status === "downloading") {
    console.log(d.filename, d.downloaded_bytes, d.total_bytes);
  } else if (d.status === "finished") {
    console.log("done", d.filename);
  }
};

const w = new DownloadWorker({ progressHooks: [hook] });
await w.download("URL", "downloads");
```

## Docs

- [CLI](docs/cli.md)
- [Output Template](docs/template.md)
- [JSON Response](docs/response.md)
- [Library API](docs/library.md)
- [Publish](docs/publish.md)

## License

MIT
