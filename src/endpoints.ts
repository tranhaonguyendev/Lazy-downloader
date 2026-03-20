export const BASE = "https://j2download.com";

export const Endpoints = {
  home: (): string => `${BASE}/`,
  api: (): string => `${BASE}/api`,
  autolink: (): string => `${BASE}/api/autolink`,
  authBootstrap: (): string => `${BASE}/api/auth/bootstrap`,
  authIssue: (): string => `${BASE}/api/auth/issue`
};
