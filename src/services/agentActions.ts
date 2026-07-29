/**
 * Apply LangGraph agent CRUD actions into localStorage so Finance / Planner UIs update.
 */

import { usGetItem, usRemoveItem, usSetItem } from "@/services/userStorage";
import { LifeManagementService } from "@/services/lifeManagement";
import type { Transaction } from "@/types/lifeManagement";
import {
  DATA_CHANGED_EVENT,
  scheduleFinancePersist,
  schedulePlannerPersist,
} from "@/services/persistSync";
import { toast } from "sonner";

const EXT_KEY = "sybeez_extended_life_data";
export { DATA_CHANGED_EVENT };

export type AgentAction = {
  type: string;
  ok?: boolean;
  error?: string;
  id?: string;
  ids?: string[];
  match?: string;
  updates?: Record<string, unknown>;
  transaction?: Transaction;
  tasks?: Array<Record<string, unknown>>;
  habit?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  deleted?: Array<Record<string, unknown>>;
  clear_all?: boolean;
  count?: number;
  matches?: Array<Record<string, unknown>>;
  refresh_inbox?: boolean;
  notify_events?: boolean;
  rule?: Record<string, unknown>;
  label?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  message_id?: string;
  account_email?: string;
  draft_text?: string;
  reply_text?: string;
  to?: string;
  subject?: string;
  fill_reply_box?: boolean;
  clear_draft?: boolean;
};

function notifyChanged(detail: { domains: string[] }) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }));
  try {
    localStorage.setItem("sybeez_data_rev", String(Date.now()));
  } catch {
    /* ignore */
  }
}

function loadExt(): Record<string, unknown> {
  try {
    const raw = usGetItem(EXT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return {
    gymSchedules: [],
    hygieneRoutines: [],
    mealPlans: [],
    mentalHealthSchedules: [],
    workBlocks: [],
    dailySchedule: [],
    preferences: {},
    habits: [],
    goals: [],
    pomodoroHistory: [],
    calendarEvents: [],
    analytics: [],
    moodHistory: [],
    journal: [],
    aiCoachingHistory: [],
  };
}

function saveExt(data: Record<string, unknown>) {
  usSetItem(EXT_KEY, JSON.stringify(data));
}

function matchTxn(t: Transaction, match?: string, id?: string): boolean {
  if (id && t.id === id) return true;
  if (!match) return false;
  const q = match.toLowerCase();
  return (
    (t.description || "").toLowerCase().includes(q) ||
    (t.category || "").toLowerCase().includes(q) ||
    t.id.toLowerCase().includes(q)
  );
}

/**
 * Persist agent CRUD actions and return a short human summary.
 */
export function applyAgentActions(actions: AgentAction[] | undefined | null): string[] {
  if (!actions?.length) return [];

  const applied: string[] = [];
  const domains = new Set<string>();
  let ext = loadExt();
  let extDirty = false;

  for (const action of actions) {
    if (!action || action.ok === false) continue;

    // ── Finance create ─────────────────────────────────────────────
    if ((action.type === "add_expense" || action.type === "add_income") && action.transaction) {
      const data = LifeManagementService.getData();
      if (!data.transactions) data.transactions = [];
      data.transactions.push(action.transaction as Transaction);
      LifeManagementService.saveData(data);
      domains.add("finance");
      const label = action.type === "add_income" ? "Income" : "Expense";
      applied.push(
        `${label}: ${action.transaction.description} (€${Number(action.transaction.amount).toFixed(2)})`,
      );
      continue;
    }

    // ── Finance update ─────────────────────────────────────────────
    if (action.type === "update_transaction" && action.updates) {
      const data = LifeManagementService.getData();
      const txns = data.transactions || [];
      const idx = txns.findIndex((t) => matchTxn(t, action.match, action.id));
      if (idx >= 0) {
        data.transactions[idx] = { ...data.transactions[idx], ...action.updates } as Transaction;
        LifeManagementService.saveData(data);
        domains.add("finance");
        applied.push(`Updated: ${data.transactions[idx].description}`);
      }
      continue;
    }

    // ── Finance delete ─────────────────────────────────────────────
    if (action.type === "delete_transaction") {
      const data = LifeManagementService.getData();
      const before = data.transactions?.length || 0;
      const idSet = new Set((action.ids || (action.id ? [action.id] : [])).map(String));
      data.transactions = (data.transactions || []).filter((t) => {
        if (idSet.size) return !idSet.has(t.id);
        return !matchTxn(t, action.match, action.id);
      });
      const removed = before - data.transactions.length;
      if (removed > 0) {
        LifeManagementService.saveData(data);
        domains.add("finance");
        applied.push(`Deleted ${removed} transaction${removed === 1 ? "" : "s"}`);
      }
      continue;
    }

    // list_transactions — display-only (backend already put text in reply)
    if (action.type === "list_transactions") {
      continue;
    }

    // ── Gmail agent actions → refresh inbox + notify events ─────────
    if (typeof action.type === "string" && action.type.startsWith("gmail_")) {
      if (action.refresh_inbox || action.ok) {
        domains.add("gmail");
      }
      if (action.type === "gmail_upsert_rule" && action.ok) {
        applied.push("Gmail rule saved");
      }
      if (action.type === "gmail_create_label" && action.ok) {
        applied.push("Label created");
      }
      if (action.type === "gmail_draft_reply" && action.ok && action.draft_text) {
        try {
          const draft = {
            messageId: String(action.message_id || ""),
            accountEmail: action.account_email ? String(action.account_email) : undefined,
            draftText: String(action.draft_text),
            from: action.to ? String(action.to) : undefined,
            subject: action.subject ? String(action.subject) : undefined,
          };
          usSetItem("sybeez_gmail_draft_v1", JSON.stringify(draft));
          window.dispatchEvent(
            new CustomEvent("sybeez:gmail-draft-reply", { detail: draft }),
          );
        } catch {
          /* ignore */
        }
        applied.push("Reply draft ready");
      }
      if (action.type === "gmail_send_reply" && action.ok) {
        try {
          usRemoveItem("sybeez_gmail_draft_v1");
        } catch {
          /* ignore */
        }
        applied.push("Reply sent");
      }
      if (action.notify_events || action.type === "gmail_list_events") {
        domains.add("gmail");
      }
      continue;
    }

    // ── Planner create tasks ───────────────────────────────────────
    if (action.type === "add_plan_tasks" && Array.isArray(action.tasks) && action.tasks.length) {
      const schedule = Array.isArray(ext.dailySchedule) ? [...(ext.dailySchedule as unknown[])] : [];
      for (const task of action.tasks) schedule.push(task);
      ext = { ...ext, dailySchedule: schedule };
      extDirty = true;
      domains.add("planner");
      applied.push(`Plan: added ${action.tasks.length} task${action.tasks.length === 1 ? "" : "s"}`);
      continue;
    }

    // ── Planner update / complete task ─────────────────────────────
    if (
      (action.type === "update_plan_task" || action.type === "complete_plan_task") &&
      action.updates
    ) {
      const schedule = Array.isArray(ext.dailySchedule)
        ? [...(ext.dailySchedule as Array<Record<string, unknown>>)]
        : [];
      const idx = schedule.findIndex((t) => {
        if (action.id && String(t.id) === String(action.id)) return true;
        if (!action.match) return false;
        const q = action.match.toLowerCase();
        return String(t.title || "").toLowerCase().includes(q);
      });
      if (idx >= 0) {
        const updates = { ...(action.updates as Record<string, unknown>) };
        if (
          action.type === "complete_plan_task" ||
          updates.isCompleted === true
        ) {
          updates.isCompleted = true;
          if (!updates.completedAt) {
            const d = new Date();
            updates.completedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          }
        }
        if (updates.isCompleted === false) {
          updates.completedAt = undefined;
        }
        schedule[idx] = { ...schedule[idx], ...updates };
        ext = { ...ext, dailySchedule: schedule };
        extDirty = true;
        domains.add("planner");
        applied.push(
          action.type === "complete_plan_task"
            ? `Completed: ${String(schedule[idx].title || "task")}`
            : `Updated task: ${String(schedule[idx].title || "task")}`,
        );
      }
      continue;
    }

    // ── Planner delete task ────────────────────────────────────────
    if (action.type === "delete_plan_task") {
      if (action.clear_all) {
        ext = { ...ext, dailySchedule: [] };
        extDirty = true;
        domains.add("planner");
        applied.push("Cleared plan");
        continue;
      }
      const idSet = new Set((action.ids || (action.id ? [action.id] : [])).map(String));
      const schedule = Array.isArray(ext.dailySchedule)
        ? (ext.dailySchedule as Array<Record<string, unknown>>)
        : [];
      const next = schedule.filter((t) => {
        if (idSet.size) return !idSet.has(String(t.id));
        if (!action.match) return true;
        return !String(t.title || "").toLowerCase().includes(action.match.toLowerCase());
      });
      const removed = schedule.length - next.length;
      if (removed > 0) {
        ext = { ...ext, dailySchedule: next };
        extDirty = true;
        domains.add("planner");
        applied.push(`Removed ${removed} task${removed === 1 ? "" : "s"}`);
      }
      continue;
    }

    // ── Habits create ──────────────────────────────────────────────
    if (action.type === "add_habit" && action.habit) {
      const habits = Array.isArray(ext.habits) ? [...(ext.habits as unknown[])] : [];
      habits.push(action.habit);
      ext = { ...ext, habits };
      extDirty = true;
      domains.add("planner");
      applied.push(`Habit: ${String((action.habit as { name?: string }).name || "Habit")}`);
      continue;
    }

    // ── Habits update ──────────────────────────────────────────────
    if (action.type === "update_habit" && action.updates) {
      const habits = Array.isArray(ext.habits)
        ? [...(ext.habits as Array<Record<string, unknown>>)]
        : [];
      const idx = habits.findIndex((h) => {
        if (action.id && String(h.id) === String(action.id)) return true;
        if (!action.match) return false;
        return String(h.name || "").toLowerCase().includes(action.match.toLowerCase());
      });
      if (idx >= 0) {
        habits[idx] = { ...habits[idx], ...action.updates };
        ext = { ...ext, habits };
        extDirty = true;
        domains.add("planner");
        applied.push(`Updated habit: ${String(habits[idx].name || "")}`);
      }
      continue;
    }

    // ── Habits delete ──────────────────────────────────────────────
    if (action.type === "delete_habit") {
      const idSet = new Set((action.ids || (action.id ? [action.id] : [])).map(String));
      const habits = Array.isArray(ext.habits)
        ? (ext.habits as Array<Record<string, unknown>>)
        : [];
      const next = habits.filter((h) => {
        if (idSet.size) return !idSet.has(String(h.id));
        if (!action.match) return true;
        return !String(h.name || "").toLowerCase().includes(action.match.toLowerCase());
      });
      const removed = habits.length - next.length;
      if (removed > 0) {
        ext = { ...ext, habits: next };
        extDirty = true;
        domains.add("planner");
        applied.push(`Deleted ${removed} habit${removed === 1 ? "" : "s"}`);
      }
    }
  }

  if (extDirty) {
    saveExt(ext);
    schedulePlannerPersist();
  }
  if (domains.has("finance")) {
    scheduleFinancePersist();
  }
  if (domains.size) {
    notifyChanged({ domains: [...domains] });
    if (domains.has("gmail")) {
      window.dispatchEvent(new CustomEvent("sybeez:gmail-refresh"));
    }
    const summary = applied.join(" · ");
    if (summary) {
      toast.success(summary, { position: "top-center", duration: 3200 });
    }
  }

  return applied;
}
