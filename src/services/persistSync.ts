/**
 * Persist Finance / Planner dashboard data to localStorage + backend feature store.
 * LocalStorage remains the live source of truth; backend is durable backup.
 * All sync requires a signed-in user — data is stored per user on the server.
 */

import { LifeManagementService } from "@/services/lifeManagement";
import { authHeaders, currentUserId, usGetJSON, usSetJSON } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const API_URL = getApiBase();
const EXT_KEY = "sybeez_extended_life_data";
const FINANCE_EXTRA_KEY = "finance_extra_features";

/** Same-tab refresh signal for Finance / Planner / Home Dashboard */
export const DATA_CHANGED_EVENT = "sybeez:data-changed";
/** Fired when the signed-in user changes — UI should reload user-scoped state. */
export const USER_SCOPE_CHANGED_EVENT = "sybeez:user-scope-changed";

let financeTimer: ReturnType<typeof setTimeout> | null = null;
let plannerTimer: ReturnType<typeof setTimeout> | null = null;

function hasMeaningfulFinance(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  const life = (data.life as Record<string, unknown>) || data;
  const txns = life.transactions;
  const subs = life.subscriptions;
  const extras = data.extras as Record<string, unknown> | undefined;
  return (
    (Array.isArray(txns) && txns.length > 0) ||
    (Array.isArray(subs) && subs.length > 0) ||
    (Array.isArray(life.emis) && (life.emis as unknown[]).length > 0) ||
    (Array.isArray(life.bills) && (life.bills as unknown[]).length > 0) ||
    (Array.isArray(life.savingsPlans) && (life.savingsPlans as unknown[]).length > 0) ||
    (Array.isArray(life.savingsItems) && (life.savingsItems as unknown[]).length > 0) ||
    (extras && Object.values(extras).some((v) => Array.isArray(v) && v.length > 0))
  );
}

function hasMeaningfulPlanner(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  return (
    (Array.isArray(data.dailySchedule) && data.dailySchedule.length > 0) ||
    (Array.isArray(data.habits) && data.habits.length > 0) ||
    (Array.isArray(data.goals) && data.goals.length > 0)
  );
}

async function postJSON(path: string, body: unknown): Promise<boolean> {
  if (!currentUserId()) return false;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getJSON<T>(path: string): Promise<T | null> {
  if (!currentUserId()) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function notifyDataChanged(domains: string[]) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { domains } }));
  try {
    localStorage.setItem("sybeez_data_rev", String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function notifyUserScopeChanged() {
  window.dispatchEvent(new CustomEvent(USER_SCOPE_CHANGED_EVENT));
  notifyDataChanged(["finance", "planner", "diary", "gmail", "home"]);
}

/** Build finance payload from current localStorage. */
export function buildFinancePayload(): Record<string, unknown> {
  const life = LifeManagementService.getData();
  const extras = usGetJSON(FINANCE_EXTRA_KEY, {});
  return {
    ...life,
    extras,
    updatedAt: new Date().toISOString(),
  };
}

/** Push finance local → backend (debounced). */
export function scheduleFinancePersist(delayMs = 400) {
  if (financeTimer) clearTimeout(financeTimer);
  financeTimer = setTimeout(() => {
    void pushFinance();
  }, delayMs);
}

export async function pushFinance(): Promise<boolean> {
  if (!currentUserId()) return false;
  const payload = buildFinancePayload();
  return postJSON("/api/features/finance/data", payload);
}

/** Push planner local → backend (debounced). */
export function schedulePlannerPersist(delayMs = 400) {
  if (plannerTimer) clearTimeout(plannerTimer);
  plannerTimer = setTimeout(() => {
    void pushPlanner();
  }, delayMs);
}

export async function pushPlanner(): Promise<boolean> {
  if (!currentUserId()) return false;
  const planner = usGetJSON<Record<string, unknown>>(EXT_KEY, {});
  return postJSON("/api/features/planner/data", {
    ...planner,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * On app boot / login: if local is empty but backend has this user's data, hydrate.
 * Never overwrite non-empty local with empty backend.
 * Never hydrates without a signed-in user (prevents cross-user bleed).
 */
export async function hydrateFromBackend(): Promise<void> {
  if (!currentUserId()) return;

  const localLife = LifeManagementService.getData();
  const localExtra = usGetJSON(FINANCE_EXTRA_KEY, null);
  const localFinanceEmpty =
    !(localLife.transactions?.length) &&
    !(localLife.subscriptions?.length) &&
    !(localLife.emis?.length) &&
    !(localLife.bills?.length) &&
    !(localLife.savingsPlans?.length) &&
    !(localLife.savingsItems?.length) &&
    !(localExtra && Object.values(localExtra as object).some((v) => Array.isArray(v) && v.length > 0));

  if (localFinanceEmpty) {
    const remote = await getJSON<Record<string, unknown>>("/api/features/finance/data");
    if (hasMeaningfulFinance(remote)) {
      const { extras, updatedAt: _u, ...lifeRest } = remote as Record<string, unknown> & {
        extras?: unknown;
        updatedAt?: string;
      };
      LifeManagementService.saveData({
        subscriptions: (lifeRest.subscriptions as never[]) || [],
        emis: (lifeRest.emis as never[]) || [],
        insurances: (lifeRest.insurances as never[]) || [],
        bills: (lifeRest.bills as never[]) || [],
        tasks: (lifeRest.tasks as never[]) || [],
        meetings: (lifeRest.meetings as never[]) || [],
        habits: (lifeRest.habits as never[]) || [],
        reminders: (lifeRest.reminders as never[]) || [],
        savingsPlans: (lifeRest.savingsPlans as never[]) || [],
        savingsItems: (lifeRest.savingsItems as never[]) || [],
        investments: (lifeRest.investments as never[]) || [],
        creditCards: (lifeRest.creditCards as never[]) || [],
        budgets: (lifeRest.budgets as never[]) || [],
        transactions: (lifeRest.transactions as never[]) || [],
      });
      if (extras && typeof extras === "object") {
        usSetJSON(FINANCE_EXTRA_KEY, extras);
      }
      notifyDataChanged(["finance"]);
    }
  } else {
    void pushFinance();
  }

  const localPlanner = usGetJSON<Record<string, unknown>>(EXT_KEY, {});
  if (!hasMeaningfulPlanner(localPlanner)) {
    const remote = await getJSON<Record<string, unknown>>("/api/features/planner/data");
    if (hasMeaningfulPlanner(remote)) {
      usSetJSON(EXT_KEY, remote);
      notifyDataChanged(["planner"]);
    }
  } else {
    void pushPlanner();
  }
}

/** Hook lifeManagement saves to also sync backend. */
export function patchLifeManagementPersist() {
  const original = LifeManagementService.saveData.bind(LifeManagementService);
  LifeManagementService.saveData = (data) => {
    original(data);
    notifyDataChanged(["finance"]);
    scheduleFinancePersist();
  };
}
