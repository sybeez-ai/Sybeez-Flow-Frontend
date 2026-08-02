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
  "productivity_habits",
  "productivity_goals",
  "pomodoro_sessions",
  "pomodoro_settings",
  "daily_stats",
  "productivity_last_backup",
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

/** True if some other account already has a scoped copy of this key. */
function otherUserHasScopedKey(baseKey: string): boolean {
  const mine = userScopedKey(baseKey);
  const suffix = `:${baseKey}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === mine) continue;
      if (k.startsWith("u:") && k.endsWith(suffix)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Read user-scoped value; carefully migrate legacy global keys once. */
export function usGetItem(baseKey: string): string | null {
  try {
    const scoped = userScopedKey(baseKey);
    const existing = localStorage.getItem(scoped);
    if (existing != null) return existing;

    const uid = currentUserId();
    if (!uid) return null;

    const legacy = localStorage.getItem(baseKey);
    if (legacy == null) return null;

    // Never let a new account inherit leftover global data when another
    // user on this browser already has a scoped copy.
    if (otherUserHasScopedKey(baseKey)) {
      try {
        localStorage.removeItem(baseKey);
      } catch {
        /* ignore */
      }
      return null;
    }

    // First authenticated user on this browser after upgrade claims legacy once
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

/**
 * Wipe every local key owned by this user (scoped + tour flags).
 * Call after account deletion or when re-login is a brand-new account.
 */
export function clearAllUserLocalData(userId: string): void {
  const uid = (userId || "").trim();
  if (!uid) return;
  const prefix = `u:${uid}:`;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(prefix)) toRemove.push(k);
      if (k === `sybeez_tour_done:${uid}`) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
    // Known base keys (covers any missed patterns)
    for (const base of USER_DATA_BASE_KEYS) {
      localStorage.removeItem(userScopedKey(base, uid));
      localStorage.removeItem(base);
    }
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
