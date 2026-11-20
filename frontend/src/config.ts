const DEFAULT_API_BASE_URL = "https://codelit-z5gy.onrender.com";

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export const GITHUB_APP_SLUG: string =
  import.meta.env.VITE_GITHUB_APP_SLUG?.trim() || "codelitlabs";

export const GITHUB_APP_ID: string =
  import.meta.env.VITE_GITHUB_APP_ID?.trim() || "5523137";

export const GITHUB_APP_INSTALL_URL: string = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;

export const WEBHOOK_ENDPOINT_URL: string = `${API_BASE_URL}/api/webhook/github`;

export function getWebSocketUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL.startsWith("https://")) {
    return `wss://${API_BASE_URL.slice("https://".length)}${normalizedPath}`;
  }
  if (API_BASE_URL.startsWith("http://")) {
    return `ws://${API_BASE_URL.slice("http://".length)}${normalizedPath}`;
  }
  return `wss://${API_BASE_URL}${normalizedPath}`;
}
