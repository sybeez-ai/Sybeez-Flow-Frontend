/**
 * Central API base URL for production-safe backend calls.
 */

const RAW =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
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

export const API_BASE = (() => {
  try {
    return getApiBase();
  } catch {
    return "http://localhost:8000";
  }
})();
