/**
 * Production URL map for Sybeez Flow workspace modules.
 * Path is the source of truth (shareable links, back/forward, refresh).
 */

import type { AppView } from "@/components/AppSidebar";

export const APP_PATHS = {
  home: "/",
  finance: "/finance",
  planner: "/planner",
  diary: "/diary",
  gmail: "/gmail",
  documents: "/documents",
  settings: "/settings",
} as const;

export type FinanceTabSlug =
  | "dashboard"
  | "daily-inout"
  | "net-worth"
  | "bills"
  | "charts"
  | "investments"
  | "savings"
  | "reports"
  | "currency";

/** Internal Finance tab ids used by FinancialAssistant */
export type FinanceTabId =
  | "dashboard"
  | "daily_inout"
  | "networth"
  | "bills"
  | "charts"
  | "investments"
  | "savings"
  | "reports"
  | "currency";

export const FINANCE_TAB_TO_SLUG: Record<FinanceTabId, FinanceTabSlug> = {
  dashboard: "dashboard",
  daily_inout: "daily-inout",
  networth: "net-worth",
  bills: "bills",
  charts: "charts",
  investments: "investments",
  savings: "savings",
  reports: "reports",
  currency: "currency",
};

export const FINANCE_SLUG_TO_TAB: Record<FinanceTabSlug, FinanceTabId> = {
  dashboard: "dashboard",
  "daily-inout": "daily_inout",
  "net-worth": "networth",
  bills: "bills",
  charts: "charts",
  investments: "investments",
  savings: "savings",
  reports: "reports",
  currency: "currency",
};

export const PLANNER_TABS = [
  "schedule",
  "habits",
  "focus",
  "goals",
  "calendar",
  "mood",
  "journal",
  "stats",
  "review",
  "sync",
] as const;

export type PlannerTabId = (typeof PLANNER_TABS)[number];

export const VIEW_TITLES: Record<AppView, string> = {
  home: "Sybeez Flow",
  finance: "Finance Manager · Sybeez Flow",
  planner: "Life Planner · Sybeez Flow",
  diary: "Life Diary · Sybeez Flow",
  gmail: "Gmail Manager · Sybeez Flow",
  documents: "Documents · Sybeez Flow",
  settings: "Account · Sybeez Flow",
};

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function viewFromPath(pathname: string): AppView | null {
  const p = normalizePath(pathname);
  if (p === "/") return "home";
  if (p === "/finance" || p.startsWith("/finance/")) return "finance";
  if (p === "/planner" || p.startsWith("/planner/")) return "planner";
  if (p === "/diary") return "diary";
  if (p === "/gmail") return "gmail";
  if (p === "/documents") return "documents";
  if (p === "/settings" || p.startsWith("/settings/")) return "settings";
  return null;
}

export function pathForView(view: AppView): string {
  return APP_PATHS[view] || "/";
}

export function financeTabFromPath(pathname: string): FinanceTabId {
  const p = normalizePath(pathname);
  if (!p.startsWith("/finance")) return "dashboard";
  const rest = p.slice("/finance".length).replace(/^\//, "");
  if (!rest) return "dashboard";
  const slug = rest.split("/")[0] as FinanceTabSlug;
  return FINANCE_SLUG_TO_TAB[slug] || "dashboard";
}

export function pathForFinanceTab(tab: FinanceTabId): string {
  const slug = FINANCE_TAB_TO_SLUG[tab] || "dashboard";
  return slug === "dashboard" ? "/finance" : `/finance/${slug}`;
}

export function plannerTabFromPath(pathname: string): PlannerTabId {
  const p = normalizePath(pathname);
  if (!p.startsWith("/planner")) return "schedule";
  const rest = p.slice("/planner".length).replace(/^\//, "");
  if (!rest) return "schedule";
  const tab = rest.split("/")[0] as PlannerTabId;
  return (PLANNER_TABS as readonly string[]).includes(tab)
    ? tab
    : "schedule";
}

export function pathForPlannerTab(tab: PlannerTabId): string {
  return tab === "schedule" ? "/planner" : `/planner/${tab}`;
}

export function settingsSectionFromPath(_pathname: string): string {
  // Settings is a single Account/profile page — no sub-sections
  return "account";
}

export function pathForSettingsSection(_section?: string): string {
  return "/settings";
}

export function isAppPath(pathname: string): boolean {
  return viewFromPath(pathname) != null;
}
