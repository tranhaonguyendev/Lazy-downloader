# Library API

## DownloadWorker

Các option thường dùng:

- `allMedias`
- `headful`
- `unlock`
- `timeoutSec`
- `outtmpl`
- `progressHooks`
- `writeJson`
- `jsonPretty`
- `printJson`

## Basic

```js
import { DownloadWorker } from "Lazy-downloader";

const w = new DownloadWorker({
  allMedias: true,
  outtmpl: "%(title)s_%(idx)s.%(ext)s"
});
const res = await w.download("URL", "downloads");
console.log(res.paths);
```

## Progress Hook payload

- `status`: `downloading` | `finished` | `error`
- `filename`
- `downloaded_bytes`
- `total_bytes`
- `elapsed`
- `speed`
- `eta`
- `info_dict`
