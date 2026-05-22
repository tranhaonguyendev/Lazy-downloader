export interface DownloadOptions {
  headful?: boolean;
  allMedias?: boolean;
  unlock?: boolean;
  timeoutSec?: number;
  maxRetries?: number;
  outputFile?: string;
  writeJson?: boolean;
  jsonPretty?: boolean;
  printJson?: boolean;
  outtmpl?: string;
  progressHooks?: Array<(d: any) => void>;
  userAgent?: string;
  uploadUrl?: string;
  uploadField?: string;
  uploadToken?: string;
  removeLocalAfterUpload?: boolean;
  onlyUrl?: boolean;
}

export type ResolvedDownloadOptions = Required<DownloadOptions>;

export function resolveOptions(options: DownloadOptions = {}): ResolvedDownloadOptions {
  return {
    headful: false,
    allMedias: false,
    unlock: true,
    timeoutSec: 60,
    maxRetries: 3,
    outputFile: "lazy-downloaded",
    writeJson: false,
    jsonPretty: true,
    printJson: true,
    outtmpl: "%(title)s.%(ext)s",
    progressHooks: [],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    uploadUrl: "",
    uploadField: "file",
    uploadToken: "",
    removeLocalAfterUpload: false,
    onlyUrl: false,
    ...options
  };
}
