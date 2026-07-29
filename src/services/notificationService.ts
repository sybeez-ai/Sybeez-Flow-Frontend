import { LifeManagementService } from "@/services/lifeManagement";
import { usGetItem, usSetItem } from "@/services/userStorage";

export type NotificationModule = "finance" | "planner" | "gmail" | "diary" | "focus" | "system";
export type NotificationTarget =
  | "home"
  | "finance"
  | "planner"
  | "diary"
  | "gmail"
  | "documents"
  | "settings";

export interface AppNotification {
  id: string;
  sourceKey: string;
  module: NotificationModule;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  target?: NotificationTarget;
  severity: "info" | "warning" | "urgent";
}

export interface NotificationPrefs {
  inApp: boolean;
  push: boolean;
  finance: boolean;
  planner: boolean;
  gmail: boolean;
  diary: boolean;
  focus: boolean;
}

const STORE_KEY = "sybeez_notifications";
const TOASTED_KEY = "sybeez_notifications_toasted";
export const NOTIFICATIONS_CHANGED = "sybeez:notifications-changed";

const DEFAULT_PREFS: NotificationPrefs = {
  inApp: true,
  push: true,
  finance: true,
  planner: true,
  gmail: true,
  diary: true,
  focus: true,
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = usGetItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emitChange() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function getNotificationPrefs(): NotificationPrefs {
  const settings = readJSON<Record<string, unknown>>("sybeez_settings", {});
  const n = (settings.notifications || {}) as Record<string, unknown>;

  // Support both new module keys and legacy shopping keys
  return {
    inApp: typeof n.inApp === "boolean" ? n.inApp : true,
    push: typeof n.push === "boolean" ? n.push : true,
    finance: typeof n.finance === "boolean" ? n.finance : Boolean(n.orderUpdates ?? true),
    planner: typeof n.planner === "boolean" ? n.planner : Boolean(n.priceDrops ?? true),
    gmail: typeof n.gmail === "boolean" ? n.gmail : Boolean(n.recommendations ?? true),
    diary: typeof n.diary === "boolean" ? n.diary : Boolean(n.newArrivals ?? true),
    focus: typeof n.focus === "boolean" ? n.focus : true,
  };
}

export function isModuleEnabled(module: NotificationModule, prefs = getNotificationPrefs()): boolean {
  if (module === "system") return prefs.inApp;
  if (module === "finance") return prefs.finance;
  if (module === "planner") return prefs.planner;
  if (module === "gmail") return prefs.gmail;
  if (module === "diary") return prefs.diary;
  if (module === "focus") return prefs.focus;
  return true;
}

export function listNotifications(): AppNotification[] {
  const items = readJSON<AppNotification[]>(STORE_KEY, []);
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function unreadCount(): number {
  return listNotifications().filter((n) => !n.read).length;
}

function saveNotifications(items: AppNotification[]) {
  // Cap store size
  const trimmed = items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);
  usSetItem(STORE_KEY, JSON.stringify(trimmed));
  emitChange();
}

function getToastedKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(TOASTED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markToasted(sourceKey: string) {
  const keys = getToastedKeys();
  keys.add(sourceKey);
  sessionStorage.setItem(TOASTED_KEY, JSON.stringify([...keys].slice(-200)));
}

export async function ensureBrowserPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

function showBrowserNotification(title: string, body: string, opts?: { force?: boolean }) {
  const prefs = getNotificationPrefs();
  if (!prefs.push) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  // Avoid spam for background scans; focus/timer alerts always surface.
  if (!opts?.force && typeof document !== "undefined" && !document.hidden) return;
  try {
    new Notification(title, { body, icon: "/logo.png" });
  } catch {
    /* ignore */
  }
}

export type UpsertInput = {
  sourceKey: string;
  module: NotificationModule;
  title: string;
  body: string;
  target?: NotificationTarget;
  severity?: "info" | "warning" | "urgent";
  /** Also fire sonner toast once per session for this sourceKey */
  toastOnce?: boolean;
  toastFn?: (title: string, opts?: { description?: string }) => void;
};

export function upsertNotification(input: UpsertInput): AppNotification | null {
  const prefs = getNotificationPrefs();
  if (!prefs.inApp && input.module !== "system") return null;
  if (!isModuleEnabled(input.module, prefs)) return null;

  const items = listNotifications();
  const existing = items.find((n) => n.sourceKey === input.sourceKey);
  if (existing) {
    // Refresh body/title but keep read state + id
    const updated: AppNotification = {
      ...existing,
      title: input.title,
      body: input.body,
      severity: input.severity || existing.severity,
      target: input.target ?? existing.target,
    };
    saveNotifications(items.map((n) => (n.id === existing.id ? updated : n)));
    return updated;
  }

  const created: AppNotification = {
    id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    sourceKey: input.sourceKey,
    module: input.module,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
    target: input.target,
    severity: input.severity || "info",
  };

  saveNotifications([created, ...items]);

  if (input.toastOnce && input.toastFn && !getToastedKeys().has(input.sourceKey)) {
    input.toastFn(input.title, { description: input.body });
    markToasted(input.sourceKey);
  }

  showBrowserNotification(input.title, input.body, { force: input.module === "focus" });
  return created;
}

export function markNotificationRead(id: string) {
  const items = listNotifications().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(items);
}

export function markAllNotificationsRead() {
  saveNotifications(listNotifications().map((n) => ({ ...n, read: true })));
}

export function clearReadNotifications() {
  saveNotifications(listNotifications().filter((n) => !n.read));
}

export function clearAllNotifications() {
  saveNotifications([]);
}

export function removeNotification(id: string) {
  saveNotifications(listNotifications().filter((n) => n.id !== id));
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** Scan product modules and upsert alerts. */
export function scanAndEmitNotifications(opts?: {
  toastFn?: (title: string, opts?: { description?: string }) => void;
}): number {
  const prefs = getNotificationPrefs();
  let created = 0;
  const toastFn = opts?.toastFn;
  const today = todayISO();

  // ── Finance ────────────────────────────────────────────────────────────
  if (prefs.finance) {
    try {
      const upcoming = LifeManagementService.getUpcomingPayments(7);
      upcoming.forEach((p: { type: string; name: string; amount: number; date: string }) => {
        const days = daysUntil(p.date);
        const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        const before = upsertNotification({
          sourceKey: `finance:${p.type}:${p.name}:${p.date}`,
          module: "finance",
          title: `${p.type} due ${when}`,
          body: `${p.name} · ${typeof p.amount === "number" ? p.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.amount}`,
          target: "finance",
          severity: days <= 1 ? "urgent" : "warning",
          toastOnce: true,
          toastFn,
        });
        if (before && !listNotifications().find((n) => n.sourceKey === before.sourceKey && n.read)) {
          /* counted via upsert new vs update — track by checking toasted */
        }
      });

      // Budget overspend
      const data = LifeManagementService.getData();
      (data.budgets || []).forEach((b) => {
        if (b.spent != null && b.monthlyLimit != null && b.spent > b.monthlyLimit) {
          upsertNotification({
            sourceKey: `finance:budget:${b.id || b.category}:${today}`,
            module: "finance",
            title: "Budget exceeded",
            body: `${b.category || "Category"} is over limit ($${Number(b.spent).toLocaleString()} / $${Number(b.monthlyLimit).toLocaleString()})`,
            target: "finance",
            severity: "urgent",
            toastOnce: true,
            toastFn,
          });
          created += 1;
        }
      });
    } catch {
      /* ignore */
    }
  }

  // ── Planner ────────────────────────────────────────────────────────────
  if (prefs.planner) {
    try {
      const ext = readJSON<{
        dailySchedule?: { id: string; title: string; startTime: string; endTime: string; isCompleted: boolean }[];
        habits?: { id: string; name: string; completedDates?: string[]; reminderTime?: string }[];
        calendarEvents?: { id: string; title: string; start?: string; date?: string }[];
      }>("sybeez_extended_life_data", {});

      const incomplete = (ext.dailySchedule || []).filter((b) => !b.isCompleted);
      if (incomplete.length > 0) {
        upsertNotification({
          sourceKey: `planner:incomplete:${today}`,
          module: "planner",
          title: `${incomplete.length} task${incomplete.length > 1 ? "s" : ""} left today`,
          body: incomplete
            .slice(0, 3)
            .map((b) => b.title)
            .join(" · "),
          target: "planner",
          severity: incomplete.length >= 5 ? "warning" : "info",
          toastOnce: true,
          toastFn,
        });
        created += 1;
      }

      // Habits not completed today
      const missedHabits = (ext.habits || []).filter(
        (h) => !(h.completedDates || []).includes(today),
      );
      if (missedHabits.length > 0 && (ext.habits || []).length > 0) {
        upsertNotification({
          sourceKey: `planner:habits:${today}`,
          module: "planner",
          title: "Habits waiting",
          body: `${missedHabits.length} habit${missedHabits.length > 1 ? "s" : ""} not done yet today`,
          target: "planner",
          severity: "info",
          toastOnce: true,
          toastFn,
        });
        created += 1;
      }

      // Life management tasks due
      const lm = LifeManagementService.getData();
      (lm.tasks || [])
        .filter((t) => t.dueDate && !t.isCompleted && daysUntil(t.dueDate) <= 1)
        .forEach((t) => {
          upsertNotification({
            sourceKey: `planner:task:${t.id}:${t.dueDate}`,
            module: "planner",
            title: daysUntil(t.dueDate!) <= 0 ? "Task overdue" : "Task due tomorrow",
            body: t.title || "Untitled task",
            target: "planner",
            severity: daysUntil(t.dueDate!) <= 0 ? "urgent" : "warning",
            toastOnce: true,
            toastFn,
          });
          created += 1;
        });
    } catch {
      /* ignore */
    }
  }

  // ── Gmail ──────────────────────────────────────────────────────────────
  if (prefs.gmail) {
    try {
      const gmail = readJSON<{
        emails?: { id: string; subject: string; important?: boolean; isRead?: boolean; from?: string }[];
        settings?: { notificationsEnabled?: boolean };
      }>("sybeez_gmail_data_v2", {});

      if (gmail.settings?.notificationsEnabled !== false) {
        const important = (gmail.emails || []).filter((e) => e.important && !e.isRead);
        if (important.length > 0) {
          upsertNotification({
            sourceKey: `gmail:important:${today}:${important.map((e) => e.id).sort().join(",")}`,
            module: "gmail",
            title: `${important.length} important email${important.length > 1 ? "s" : ""}`,
            body: important
              .slice(0, 2)
              .map((e) => e.subject || "No subject")
              .join(" · "),
            target: "gmail",
            severity: "urgent",
            toastOnce: true,
            toastFn,
          });
          created += 1;
        }

        const unread = (gmail.emails || []).filter((e) => !e.isRead).length;
        if (unread >= 5) {
          upsertNotification({
            sourceKey: `gmail:unread:${today}`,
            module: "gmail",
            title: `${unread} unread emails`,
            body: "Your inbox needs a quick clean-up",
            target: "gmail",
            severity: "info",
            toastOnce: true,
            toastFn,
          });
          created += 1;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // ── Diary ──────────────────────────────────────────────────────────────
  if (prefs.diary) {
    try {
      const diary = readJSON<{ entries?: { date: string }[] }>("sybeez_life_diary", {});
      const dates = new Set((diary.entries || []).map((e) => e.date));
      if (!dates.has(today)) {
        upsertNotification({
          sourceKey: `diary:write:${today}`,
          module: "diary",
          title: "Capture today",
          body: "You haven’t written in Life Diary yet today",
          target: "diary",
          severity: "info",
          toastOnce: true,
          toastFn,
        });
        created += 1;
      }
    } catch {
      /* ignore */
    }
  }

  return created;
}

export { DEFAULT_PREFS };
