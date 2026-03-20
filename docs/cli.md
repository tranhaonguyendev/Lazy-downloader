# CLI

## Install

```bash
npm install -g Lazy-downloader
npx playwright install chromium
```

## Usage

```bash
aio-down "URL" -P downloads --all -o "%(title)s_%(idx)s.%(ext)s"
```

## Flags

| Flag | Ý nghĩa |
|---|---|
| `-P, --paths` | Thư mục lưu |
| `-o, --outtmpl` | Output template |
| `--all` | Download tất cả media |
| `--headful` | Browser có UI |
| `--no-unlock` | Tắt unlock |
| `--timeout` | Timeout (giây) |
| `--write-json` | Ghi JSON ra file |
| `--quiet` | Tắt progress |
| `--stdin` | Đọc URL từ stdin |

## Batch from stdin

```bash
type urls.txt | aio-down --stdin -P downloads --all
```
