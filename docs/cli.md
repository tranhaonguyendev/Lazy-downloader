# CLI

## Install

```bash
npm install -g Lazy-downloader
npx playwright install chromium
```

## Usage

```bash
lazy-down "URL" -P downloads --all -o "%(title)s_%(idx)s.%(ext)s"
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
type urls.txt | lazy-down --stdin -P downloads --all
```

## Auth Flow

J2Download hiện không còn dùng flow `csrf_token` / `api_token` cũ. CLI sẽ tự:

1. mở `https://j2download.com/` bằng Playwright để lấy `window.__BOOTSTRAP__`
2. giải PoW nếu có
3. `POST /api/auth/issue` để lấy bearer token ngắn hạn
4. `POST /api/autolink` với `Authorization: Bearer ...`

Nếu site yêu cầu challenge tương tác như Turnstile thì CLI hiện chưa tự vượt challenge đó.
