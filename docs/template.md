# Output Template

Template tương tự `yt-dlp`:

```bash
-o "%(title)s_%(idx)s.%(ext)s"
```

## Keys

| Key | Ý nghĩa |
|---|---|
| `%(title)s` | Tiêu đề |
| `%(id)s` | ID nội dung |
| `%(source)s` | Nguồn (`tiktok`, `threads`, ...) |
| `%(idx)s` | Thứ tự media (1-based) |
| `%(ext)s` | Extension |
| `%(url)s` | URL đầu vào |
| `%(webpage_url)s` | URL trang |
| `%(media_url)s` | Direct media URL |

## Ví dụ

```bash
-o "%(source)s/%(title)s/%(idx)s.%(ext)s"
```

## Sanitize

- Loại ký tự không hợp lệ
- Giới hạn độ dài
- Tránh trùng tên bằng suffix `_1`, `_2`, ...
