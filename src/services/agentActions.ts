/**
 * Apply LangGraph agent CRUD actions into localStorage so Finance / Planner UIs update.
 */

import { usGetItem, usRemoveItem, usSetItem } from "@/services/userStorage";
import { LifeManagementService } from "@/services/lifeManagement";
import type { Transaction } from "@/types/lifeManagement";
import type { Goal } from "@/types/dailyLife";
import { appendProgressLog } from "@/services/goalProgressService";
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
  delta?: number;
  note?: string;
  goalId?: string;
  title?: string;
  entry?: Record<string, unknown>;
  gratitude?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  thought?: Record<string, unknown>;
  item?: Record<string, unknown>;
  deleted?: boolean;
  /** Investment analytics chart payload (UI-only) */
  portfolio_series?: Array<{ date: string; value: number }>;
  holdings?: unknown[];
  summary?: Record<string, unknown>;
  projections?: Record<string, unknown>;
  empty?: boolean;
  /** In-app navigation */
  path?: string;
  view?: string;
  tab?: string;
  label?: string;
  reason?: string;
  /** Suggested follow-up prompts */
  suggestions?: string[];
};

/** Fired when the agent asks the UI to change page/tab. */
export const NAVIGATE_EVENT = "sybeez:navigate";

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

    // UI-only investment charts — rendered by AssistantPanel, no persistence
    if (action.type === "show_investment_analytics") {
      continue;
    }
    if (action.type === "suggest_followups") {
      continue;
    }
    if (action.type === "navigate" && (action.path || action.tab)) {
      try {
        window.dispatchEvent(
          new CustomEvent(NAVIGATE_EVENT, {
            detail: {
              path: action.path,
              view: action.view || "finance",
              tab: action.tab,
              label: action.label,
            },
          }),
        );
        applied.push(`Open ${action.label || action.tab || action.path}`);
      } catch {
        /* ignore */
      }
      continue;
    }

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
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const task of action.tasks) {
        const t = task as Record<string, unknown>;
        schedule.push({ ...t, date: (t.date as string) || today });
      }
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
        const wasDone = Boolean(schedule[idx].isCompleted);
        schedule[idx] = { ...schedule[idx], ...updates };
        const nowDone = Boolean(schedule[idx].isCompleted);
        // Completing a goal-linked task logs +1 progress on that goal
        if (!wasDone && nowDone && schedule[idx].goalId) {
          const goals = Array.isArray(ext.goals)
            ? [...(ext.goals as Goal[])]
            : [];
          const gIdx = goals.findIndex(
            (g) => String(g.id) === String(schedule[idx].goalId),
          );
          if (gIdx >= 0) {
            goals[gIdx] = appendProgressLog(goals[gIdx], {
              delta: 1,
              note: `Completed: ${String(schedule[idx].title || "task")}`,
              source: "schedule",
              scheduleBlockId: String(schedule[idx].id || ""),
            });
            ext = { ...ext, goals };
          }
        }
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

    // ── Goal progress (AI / chat) ──────────────────────────────────
    if (action.type === "update_goal_progress" && action.ok !== false) {
      const goals = Array.isArray(ext.goals) ? [...(ext.goals as Goal[])] : [];
      const delta = Number(action.delta);
      if (!Number.isFinite(delta) || delta === 0) continue;
      const idx = goals.findIndex((g) => {
        if (action.id && String(g.id) === String(action.id)) return true;
        if (!action.match) return false;
        return String(g.title || "")
          .toLowerCase()
          .includes(String(action.match).toLowerCase());
      });
      if (idx >= 0) {
        goals[idx] = appendProgressLog(goals[idx], {
          delta,
          note: action.note ? String(action.note) : undefined,
          source: "ai",
        });
        ext = { ...ext, goals };
        extDirty = true;
        domains.add("planner");
        applied.push(
          `Goal progress: ${delta > 0 ? "+" : ""}${delta} on ${String(goals[idx].title || "goal")}`,
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
      continue;
    }

    // ── Life Diary writes / edits ──────────────────────────────────
    if (action.type === "diary_open_tab" && action.tab) {
      try {
        window.dispatchEvent(
          new CustomEvent("sybeez:diary-open-tab", {
            detail: { tab: action.tab },
          }),
        );
      } catch {
        /* ignore */
      }
      continue;
    }

    if (
      action.type === "add_diary_entry" ||
      action.type === "add_gratitude" ||
      action.type === "add_memory" ||
      action.type === "add_thought" ||
      action.type === "update_diary_entry" ||
      action.type === "update_gratitude" ||
      action.type === "update_memory" ||
      action.type === "update_thought" ||
      action.type === "delete_diary_entry" ||
      action.type === "delete_gratitude" ||
      action.type === "delete_memory" ||
      action.type === "delete_thought"
    ) {
      const diary = loadDiary();
      if (action.type === "add_diary_entry" && action.entry) {
        diary.entries = [action.entry as Record<string, unknown>, ...(diary.entries || [])];
        applied.push(`Diary: ${String((action.entry as { title?: string }).title || "Entry")}`);
      } else if (action.type === "update_diary_entry" && action.entry) {
        const id = String((action.entry as { id?: string }).id || action.id || "");
        diary.entries = (diary.entries || []).map((e) =>
          String((e as { id?: string }).id) === id ? (action.entry as Record<string, unknown>) : e,
        );
        applied.push("Diary entry updated");
      } else if (action.type === "delete_diary_entry" && (action.id || action.item)) {
        const id = String(action.id || (action.item as { id?: string })?.id || "");
        diary.entries = (diary.entries || []).filter(
          (e) => String((e as { id?: string }).id) !== id,
        );
        applied.push("Diary entry deleted");
      } else if (action.type === "add_gratitude" && action.gratitude) {
        diary.gratitude = [
          action.gratitude as Record<string, unknown>,
          ...(diary.gratitude || []),
        ];
        applied.push("Gratitude saved");
      } else if (action.type === "update_gratitude" && action.gratitude) {
        const id = String((action.gratitude as { id?: string }).id || action.id || "");
        diary.gratitude = (diary.gratitude || []).map((g) =>
          String((g as { id?: string }).id) === id
            ? (action.gratitude as Record<string, unknown>)
            : g,
        );
        applied.push("Gratitude updated");
      } else if (action.type === "delete_gratitude" && (action.id || action.item)) {
        const id = String(action.id || (action.item as { id?: string })?.id || "");
        diary.gratitude = (diary.gratitude || []).filter(
          (g) => String((g as { id?: string }).id) !== id,
        );
        applied.push("Gratitude deleted");
      } else if (action.type === "add_memory" && action.memory) {
        diary.memories = [action.memory as Record<string, unknown>, ...(diary.memories || [])];
        const cat = String((action.memory as { category?: string }).category || "memory");
        applied.push(
          cat === "achievement" || cat === "milestone"
            ? `Achievement: ${String((action.memory as { title?: string }).title || "")}`
            : `Memory: ${String((action.memory as { title?: string }).title || "")}`,
        );
      } else if (action.type === "update_memory" && action.memory) {
        const id = String((action.memory as { id?: string }).id || action.id || "");
        diary.memories = (diary.memories || []).map((m) =>
          String((m as { id?: string }).id) === id
            ? (action.memory as Record<string, unknown>)
            : m,
        );
        applied.push("Memory updated");
      } else if (action.type === "delete_memory" && (action.id || action.item)) {
        const id = String(action.id || (action.item as { id?: string })?.id || "");
        diary.memories = (diary.memories || []).filter(
          (m) => String((m as { id?: string }).id) !== id,
        );
        applied.push("Memory deleted");
      } else if (action.type === "add_thought" && action.thought) {
        diary.thoughts = [action.thought as Record<string, unknown>, ...(diary.thoughts || [])];
        applied.push("Thought saved");
      } else if (action.type === "update_thought" && action.thought) {
        const id = String((action.thought as { id?: string }).id || action.id || "");
        diary.thoughts = (diary.thoughts || []).map((t) =>
          String((t as { id?: string }).id) === id
            ? (action.thought as Record<string, unknown>)
            : t,
        );
        applied.push("Thought updated");
      } else if (action.type === "delete_thought" && (action.id || action.item)) {
        const id = String(action.id || (action.item as { id?: string })?.id || "");
        diary.thoughts = (diary.thoughts || []).filter(
          (t) => String((t as { id?: string }).id) !== id,
        );
        applied.push("Thought deleted");
      } else {
        continue;
      }
      saveDiary(diary);
      domains.add("diary");
      continue;
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
    if (domains.has("diary")) {
      window.dispatchEvent(
        new CustomEvent("sybeez:data-changed", { detail: { domains: ["diary"] } }),
      );
    }
    const summary = applied.join(" · ");
    if (summary) {
      toast.success(summary, { position: "top-center", duration: 3200 });
    }
  }

  return applied;
}

const DIARY_KEY = "sybeez_life_diary";

function loadDiary(): {
  entries: unknown[];
  memories: unknown[];
  thoughts: unknown[];
  gratitude: unknown[];
  growthMetrics: unknown[];
  weeklyReflections: unknown[];
} {
  try {
    const raw = usGetItem(DIARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        thoughts: Array.isArray(parsed.thoughts) ? parsed.thoughts : [],
        gratitude: Array.isArray(parsed.gratitude) ? parsed.gratitude : [],
        growthMetrics: Array.isArray(parsed.growthMetrics) ? parsed.growthMetrics : [],
        weeklyReflections: Array.isArray(parsed.weeklyReflections)
          ? parsed.weeklyReflections
          : [],
      };
    }
  } catch {
    /* fall through */
  }
  return {
    entries: [],
    memories: [],
    thoughts: [],
    gratitude: [],
    growthMetrics: [],
    weeklyReflections: [],
  };
}

function saveDiary(data: ReturnType<typeof loadDiary>) {
  usSetItem(DIARY_KEY, JSON.stringify(data));
  try {
    window.dispatchEvent(
      new CustomEvent("sybeez:data-changed", { detail: { key: DIARY_KEY, domains: ["diary"] } }),
    );
  } catch {
    /* ignore */
  }
  // Best-effort backend backup
  void import("@/services/backendApi")
    .then(({ diaryApi }) => diaryApi.saveData?.(data as never))
    .catch(() => undefined);
}
