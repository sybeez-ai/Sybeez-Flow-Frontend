/**
 * Per-user localStorage isolation.
 * Keys become `u:<userId>:<baseKey>` so User A and User B never share data.
 */

/** Product data keys that must be scoped to the logged-in user. */
export const USER_DATA_BASE_KEYS = [
  "life_management_data",
  "finance_extra_features",
  "sybeez_extended_life_data",
  "sybeez_life_diary",
  "sybeez_inout_month_folders",
  "stabee_networth",
  "nw_snapshots",
  "nw_vesting_events",
  "finance_watchlist",
  "sybeez_gmail_data_v2",
  "sybeez_gmail_selected_v1",
  "sybeez_gmail_draft_v1",
  "sybeez_gmail_active_account_v1",
  "sybeez_gmail_comprehensive_data",
  "sybeez_gmail_unified_data",
  "sybeez_notifications",
  "sybeez_feedback_submitted",
  "sybeez_settings",
  "sybeez_region_profile",
  "sybeez_legal_consent",
  "stabee_base_currency",
  "sybeez_active_view",
  "sybeez_planner_tab",
  "sybeez_finance_tab",
  "ai_coaching_history",
  "stabee_chat_history",
  "daily_tasks",
  "gym_workouts",
  "diet_plan",
  "water_intake",
  "calendar_events",
  "mood_entries",
  "journal_entries",
] as const;

const AUTH_USER_KEY = "sybeez_auth_user";
const AUTH_TOKEN_KEY = "sybeez_auth_token";

export function currentUserId(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: string };
    return user?.id || null;
  } catch {
    return null;
  }
}

export function userScopedKey(baseKey: string, userId?: string | null): string {
  const uid = (userId ?? currentUserId() ?? "anon").trim() || "anon";
  return `u:${uid}:${baseKey}`;
}

/** Read user-scoped value; one-time migrate from legacy global key if needed. */
export function usGetItem(baseKey: string): string | null {
  try {
    const scoped = userScopedKey(baseKey);
    const existing = localStorage.getItem(scoped);
    if (existing != null) return existing;

    const uid = currentUserId();
    if (!uid) return null;

    const legacy = localStorage.getItem(baseKey);
    if (legacy == null) return null;

    // Claim legacy data for the first authenticated user on this browser
    localStorage.setItem(scoped, legacy);
    localStorage.removeItem(baseKey);
    return legacy;
  } catch {
    return null;
  }
}

export function usSetItem(baseKey: string, value: string): void {
  localStorage.setItem(userScopedKey(baseKey), value);
}

export function usRemoveItem(baseKey: string): void {
  try {
    localStorage.removeItem(userScopedKey(baseKey));
    localStorage.removeItem(baseKey); // legacy
  } catch {
    /* ignore */
  }
}

export function usGetJSON<T>(baseKey: string, fallback: T): T {
  try {
    const raw = usGetItem(baseKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usSetJSON(baseKey: string, value: unknown): void {
  usSetItem(baseKey, JSON.stringify(value));
}

/** Auth header helpers for user-scoped API calls. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return headers;
}

export function userSessionId(baseSessionId: string): string {
  const uid = currentUserId() || "anon";
  if (baseSessionId.startsWith(`u:${uid}:`)) return baseSessionId;
  return `u:${uid}:${baseSessionId}`;
}

/** Strip `u:<userId>:` prefix for view routing. */
export function stripUserSessionPrefix(sessionId: string): string {
  const m = sessionId.match(/^u:[^:]+:(.+)$/);
  return m ? m[1] : sessionId;
}
