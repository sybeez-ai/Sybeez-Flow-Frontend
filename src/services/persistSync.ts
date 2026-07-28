/**
 * Persist Finance / Planner dashboard data to localStorage + backend feature store.
 * LocalStorage remains the live source of truth; backend is durable backup.
 */

import { LifeManagementService } from "@/services/lifeManagement";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const EXT_KEY = "sybeez_extended_life_data";
const FINANCE_EXTRA_KEY = "finance_extra_features";
const LIFE_KEY = "life_management_data";

/** Same-tab refresh signal for Finance / Planner / Home Dashboard */
export const DATA_CHANGED_EVENT = "sybeez:data-changed";

let financeTimer: ReturnType<typeof setTimeout> | null = null;
let plannerTimer: ReturnType<typeof setTimeout> | null = null;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
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

/** Build finance payload from current localStorage. */
export function buildFinancePayload(): Record<string, unknown> {
  const life = LifeManagementService.getData();
  const extras = readJSON(FINANCE_EXTRA_KEY, {});
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
  const planner = readJSON<Record<string, unknown>>(EXT_KEY, {});
  return postJSON("/api/features/planner/data", {
    ...planner,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * On app boot: if local is empty but backend has data, hydrate localStorage.
 * Never overwrite non-empty local with empty backend.
 */
export async function hydrateFromBackend(): Promise<void> {
  const localLife = LifeManagementService.getData();
  const localExtra = readJSON(FINANCE_EXTRA_KEY, null);
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
      localStorage.setItem(LIFE_KEY, JSON.stringify({
        subscriptions: lifeRest.subscriptions || [],
        emis: lifeRest.emis || [],
        insurances: lifeRest.insurances || [],
        bills: lifeRest.bills || [],
        tasks: lifeRest.tasks || [],
        meetings: lifeRest.meetings || [],
        habits: lifeRest.habits || [],
        reminders: lifeRest.reminders || [],
        savingsPlans: lifeRest.savingsPlans || [],
        savingsItems: lifeRest.savingsItems || [],
        investments: lifeRest.investments || [],
        creditCards: lifeRest.creditCards || [],
        budgets: lifeRest.budgets || [],
        transactions: lifeRest.transactions || [],
      }));
      if (extras && typeof extras === "object") {
        localStorage.setItem(FINANCE_EXTRA_KEY, JSON.stringify(extras));
      }
      notifyDataChanged(["finance"]);
    }
  } else {
    // Keep local authoritative — push up so backend stays in sync
    void pushFinance();
  }

  const localPlanner = readJSON<Record<string, unknown>>(EXT_KEY, {});
  if (!hasMeaningfulPlanner(localPlanner)) {
    const remote = await getJSON<Record<string, unknown>>("/api/features/planner/data");
    if (hasMeaningfulPlanner(remote)) {
      localStorage.setItem(EXT_KEY, JSON.stringify(remote));
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
