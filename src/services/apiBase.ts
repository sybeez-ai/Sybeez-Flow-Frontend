/**
 * Central API base URL for production-safe backend calls.
 */

const RAW =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "";

const RAW_WS =
  (import.meta.env.VITE_BACKEND_WS as string | undefined) ||
  "";

const IS_PROD = import.meta.env.PROD || import.meta.env.VITE_APP_ENV === "production";

function normalize(url: string): string {
  return url.replace(/\/$/, "");
}

/** Backend origin (no trailing slash). */
export function getApiBase(): string {
  if (RAW && RAW.trim()) return normalize(RAW.trim());
  if (IS_PROD) {
    throw new Error(
      "Missing VITE_API_URL / VITE_BACKEND_URL — required for production builds.",
    );
  }
  return "http://localhost:8000";
}

/** WebSocket origin derived from API base (or VITE_BACKEND_WS). */
export function getWsBase(): string {
  if (RAW_WS && RAW_WS.trim()) return normalize(RAW_WS.trim());
  const http = getApiBase();
  if (http.startsWith("https://")) return `wss://${http.slice("https://".length)}`;
  if (http.startsWith("http://")) return `ws://${http.slice("http://".length)}`;
  return http;
}

export const API_BASE = (() => {
  try {
    return getApiBase();
  } catch {
    return "http://localhost:8000";
  }
})();
