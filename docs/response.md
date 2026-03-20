# JSON Response

Response dùng để tích hợp automation.

## Full

```json
{
  "json": {},
  "medias": [],
  "parsed": [],
  "paths": [],
  "timeMs": 0
}
```

## Top-level

| Field | Type | Ý nghĩa |
|---|---|---|
| `json` | object | Metadata tổng hợp |
| `medias` | array | Media gốc |
| `parsed` | array | Media đã tải |
| `paths` | array[string] | File local |
| `timeMs` | number | ms |

## `json`

| Field | Type | Ý nghĩa |
|---|---|---|
| `url` | string | URL đầu vào |
| `source` | string | nguồn |
| `type` | string | `single`/`multiple` |
| `error` | boolean | lỗi |
| `title` | string | tiêu đề |
| `author` | string | tác giả |
| `thumbnail` | string | thumbnail |
| `id` | string | id |
| `pk` | string | threads pk |
| `unique_id` | string | tiktok username |
| `duration` | number | thời lượng |
| `like_count` | string/number | like |
| `time_end` | number | nội bộ |
| `medias` | array | media list |

## `medias[]`

| Field | Type | Ý nghĩa |
|---|---|---|
| `type` | string | image/video/audio |
| `url` | string | direct |
| `extension` | string | ext |
| `quality` | string | quality |
| `width` | number | w |
| `height` | number | h |
| `resolution` | string | WxH |
| `caption` | string | caption |
| `data_size` | number | bytes |
| `format_id` | string | format |
| `duration` | number | duration |
| `title` | string | tiêu đề tổng hợp |
| `author` | string | tác giả/owner |
| `source` | string | nguồn |
| `id` | string | media/post id |
| `unique_id` | string/null | username (nếu có) |
| `thumbnail` | string/null | thumbnail URL |
| `webpage_url` | string | URL đầu vào |

## `parsed[]`

| Field | Type | Ý nghĩa |
|---|---|---|
| `idx` | number | 1-based |
| `type` | string | type |
| `quality` | string | quality |
| `extension` | string | ext |
| `url` | string | direct |
| `savedPath` | string | local |
| `contentType` | string | mime |
| `width` | number/null | w |
| `height` | number/null | h |
| `resolution` | string/null | WxH |

## Compact

```json
{
  "paths": ["assets/cache/..."],
  "timeMs": 980
}
```

## Error (recommended)

```json
{
  "json": { "error": true, "message": "No medias in response" },
  "medias": [],
  "parsed": [],
  "paths": []
}
```
