import { usGetItem, usSetItem } from "@/services/userStorage";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppSidebar, { AppView } from "@/components/AppSidebar";
import AppOnboardingTour from "@/components/AppOnboardingTour";
import HomeDashboard from "@/components/HomeDashboard";
import FinancialAssistant from "@/components/FinancialAssistant";
import AssistantPanel from "@/components/AssistantPanel";
import DailyLifePlanner from "@/components/DailyLifePlannerEnhanced";
import LifeDiaryEnhanced from "@/components/LifeDiaryEnhanced";
import GmailIntegrationSidebar from "@/components/GmailIntegrationSidebar";
import DocumentStorage from "@/components/DocumentStorage";
import SettingsPanel from "@/components/SettingsPanel";
import { BrowserProvider } from "@/contexts/BrowserContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { buildFinanceAssistantContextAsync } from "@/services/financeAssistantContext";
import { buildDiaryAssistantContext } from "@/services/diaryAssistantContext";
import { goalSnapshotForAI } from "@/services/goalProgressService";
import { buildPlannerReportsContext } from "@/services/plannerReportsService";
import type { DailyScheduleBlock, DailyStats, Goal, Habit } from "@/types/dailyLife";
import {
  financeTabFromPath,
  pathForFinanceTab,
  pathForPlannerTab,
  pathForDiaryTab,
  pathForGmailTab,
  pathForSettingsSection,
  pathForView,
  plannerTabFromPath,
  diaryTabFromPath,
  gmailTabFromPath,
  settingsSectionFromPath,
  VIEW_TITLES,
  viewFromPath,
  type FinanceTabId,
  type PlannerTabId,
  type DiaryTabId,
  type GmailTabId,
} from "@/appRoutes";
import {
  OPEN_CHAT_SESSION_EVENT,
  viewForSessionId,
  type OpenChatSessionDetail,
} from "@/services/chatSessionStore";

const readJSON = (key: string): unknown => {
  try {
    return JSON.parse(usGetItem(key) || "null");
  } catch {
    return null;
  }
};

const FINANCE_SYSTEM =
  "You are Sybeez Flow — Finance Manager. Act — do not only advise. " +
  "SCOPE: Only personal finance — spending, bills, net worth, investments, savings, cashflow. " +
  "If the user asks anything unrelated (tech, AWS, weather, coding, trivia, other apps), do NOT answer it. " +
  "Politely say: you are the Finance Assistant and can only help with their money — then suggest 2–3 finance questions. " +
  "COMPLETE ANSWERS: always finish every section; never stop mid-sentence. " +
  "Never mention Tavily, SerpAPI, or other search-provider brand names. " +
  "You see the user's current finance page/tab AND live Investments (Finnhub + Yahoo) plus Savings/bills/cashflow. " +
  "When they ask about investments while on Savings (or the reverse), the app navigates for them — confirm it. " +
  "When they ask to log/add/update/delete spend or income, DO IT via actions and confirm. " +
  "For investments: explain LIVE analytics, PAST reports, company details/news, web research, and EDUCATIONAL outlooks with charts. " +
  "Use ## headings, bold key numbers, clear bullets, emojis when helpful, and a mindmap for overviews. " +
  "Always suggest clear follow-up questions. Teach beginners in plain English. Never invent balances. " +
  "Never output JSON. Forward outlook is educational only — not financial advice.";

const PLANNER_SYSTEM =
  "You are Sybeez Flow — Productivity Coach. Act on requests. " +
  "SCOPE: Only planning & productivity — schedule, habits, goals, focus, weekly reviews, reports. " +
  "If the user asks anything unrelated, do NOT answer it. Politely say you are the Productivity Coach " +
  "and can only help with their plan/habits/goals — then suggest 2–3 planner questions. " +
  "CREATE/READ/UPDATE/DELETE plan tasks, habits, and goal progress from chat. " +
  "Examples: make a plan, show my plan, mark gym done, delete a task, clear my plan, log goal progress. " +
  "Goals: use goalProgress only — never invent numbers. " +
  "Goal plans: date-wise plan + add_plan_tasks with goalId. " +
  "Weekly review: use scheduleReview + goalProgress facts only. Always finish every section (Summary, Grade, Highlights, Improvements, Recommendations, Focus) — never stop mid-sentence. " +
  "Productivity reports: use context.reports (selectedPeriod + periodScores). Explain completed, missed, running, scores, and concrete improvements — never invent tasks. Always complete the full answer. " +
  "Reply with ## headings, bold key points, spaced bullets, and a mindmap for day/week overviews. Keep reviews concise but complete. " +
  "Confirm every change you made. Be clear, respectful, and practical.";

const FINANCE_SUGGESTIONS = [
  "Explain my investments with live analytics and charts",
  "Full past performance report of my portfolio",
  "What could my portfolio look like in 6 months?",
  "How is my portfolio doing today?",
];

const PLANNER_SUGGESTIONS = [
  "Explain my productivity report and where I should improve",
  "What did I miss yesterday and how do I fix it?",
  "Give me today's daily goal report",
  "Generate my weekly review",
];

function isoLocalDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildPlannerAssistantContext(): Record<string, unknown> {
  const planner = readJSON("sybeez_extended_life_data") as {
    dailySchedule?: Array<{
      id?: string;
      title?: string;
      startTime?: string;
      endTime?: string;
      isCompleted?: boolean;
      completedAt?: string;
      goalId?: string;
      date?: string;
    }>;
    habits?: unknown[];
    goals?: Goal[];
    analytics?: unknown[];
  } | null;
  const schedule = Array.isArray(planner?.dailySchedule) ? planner!.dailySchedule! : [];
  const goals = Array.isArray(planner?.goals) ? planner!.goals! : [];
  const habits = Array.isArray(planner?.habits) ? planner!.habits! : [];
  const analytics = Array.isArray(planner?.analytics) ? planner!.analytics! : [];
  const today = isoLocalDay();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = isoLocalDay(y);
  const weekStart = (() => {
    const now = new Date();
    const dow = now.getDay();
    const diff = dow === 0 ? 6 : dow - 1;
    const s = new Date(now);
    s.setDate(now.getDate() - diff);
    return isoLocalDay(s);
  })();

  const done = schedule.filter((b) => b.isCompleted);
  const fmt = (blocks: typeof done) =>
    blocks.length
      ? blocks.map((b) => `• ${b.title} (${b.startTime || "?"}–${b.endTime || "?"})`).join("\n")
      : "• (none)";
  const byDay = (day: string) =>
    done.filter((b) => (b.completedAt || (b.isCompleted ? today : "")) === day);
  const weekDone = done.filter((b) => {
    const d = b.completedAt || today;
    return d >= weekStart && d <= today;
  });
  const goalProgress = goalSnapshotForAI(goals);
  const goalLinkedToday = schedule.filter(
    (b) => b.goalId && (!b.date || b.date === today),
  );

  let reports: Record<string, unknown> = {};
  try {
    reports = buildPlannerReportsContext({
      schedule: schedule as DailyScheduleBlock[],
      habits: habits as Habit[],
      goals,
      analytics: analytics as DailyStats[],
    });
  } catch {
    reports = {};
  }

  return {
    feature: "planner",
    life: readJSON("life_management_data"),
    planner,
    goalProgress,
    goalScheduleToday: goalLinkedToday.map((b) => ({
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      goalId: b.goalId,
      isCompleted: b.isCompleted,
    })),
    scheduleReview: {
      today,
      yesterday,
      weekStart,
      todayDone: fmt(byDay(today)),
      yesterdayDone: fmt(byDay(yesterday)),
      weekDone: fmt(weekDone),
      todayCount: byDay(today).length,
      yesterdayCount: byDay(yesterday).length,
      weekCount: weekDone.length,
      allScheduleCount: schedule.length,
      completedCount: done.length,
    },
    reports,
  };
}

const DIARY_SYSTEM =
  "You are Sybeez Flow — Life Companion. " +
  "SCOPE: Only Life Diary — Today entries, Thoughts, Memories, Achievements, Gratitude, reflections. " +
  "If the user asks anything unrelated, do NOT answer it. Politely say you are the Life Companion " +
  "and can only help with their diary — then suggest 2–3 diary prompts. " +
  "You can ADD and EDIT diary data: Today entries, Thoughts, Memories, Achievements, Gratitude. " +
  "Day stories → diary entry. Grateful phrases → gratitude. Ideas/dreams → thoughts. " +
  "Wins/milestones → achievement. Lasting moments → memory. " +
  "When the user asks to edit/update/delete something, do it using their saved diary data. " +
  "When they ask about anything in their diary, answer from the real diarySnapshot — never invent. " +
  "Use ## headings, bold important feelings/facts, spaced bullets, emojis when warm, and a mindmap for day/week reflections. " +
  "Confirm what you saved and where it went. Keep replies warm, respectful, and clear.";

const DIARY_SUGGESTIONS = [
  "Today I felt stressed at work but proud I finished my tasks",
  "Save this thought: I want to start a small creative side project",
  "What did I write in my diary recently?",
  "Edit my latest diary entry to sound clearer",
];

const GMAIL_SYSTEM =
  "You are Sybeez Flow — Email Assistant with LIVE Gmail access. Act on requests. " +
  "SCOPE: Only email — inbox, labels, rules, drafts, replies, organize. " +
  "If the user asks anything unrelated, do NOT answer it. Politely say you are the Email Assistant " +
  "and can only help with Gmail — then suggest 2–3 email tasks. " +
  "Always use active_account / account_email and the selected email's accountId. " +
  "You can search mail, create labels, auto-filing rules, draft replies, and send replies. " +
  "Reply drafts first — send only when the user confirms. " +
  "Use ## headings, bold key senders/subjects, clear bullets, and a mindmap when summarizing inbox themes. " +
  "Surface renewals/meetings. Confirm which account you used.";

const GMAIL_SUGGESTIONS = [
  "Show my unread emails",
  "Move promotions to Promotions",
  "If mail from stripe.com move to Bills",
  "Organize my mail",
];

const VIEW_KEY = "sybeez_active_view";

function applyDocumentTitle(view: AppView) {
  const title = VIEW_TITLES[view] || "Sybeez Flow";
  if (document.title !== title) document.title = title;
}

const Index = () => {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const view = useMemo<AppView>(
    () => viewFromPath(location.pathname) || "home",
    [location.pathname],
  );
  const financeTab = useMemo(
    () => financeTabFromPath(location.pathname),
    [location.pathname],
  );
  const plannerTab = useMemo(
    () => plannerTabFromPath(location.pathname),
    [location.pathname],
  );
  const diaryTab = useMemo(
    () => diaryTabFromPath(location.pathname),
    [location.pathname],
  );
  const gmailTab = useMemo(
    () => gmailTabFromPath(location.pathname),
    [location.pathname],
  );
  const settingsSection = useMemo(
    () => settingsSectionFromPath(location.pathname),
    [location.pathname],
  );

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Tab title must track the URL module (layout phase = no stale "Documents" flash)
  useLayoutEffect(() => {
    applyDocumentTitle(view);
  }, [view, location.pathname]);

  // Keep legacy local key in sync (other code may still read it)
  useEffect(() => {
    try {
      usSetItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Gmail OAuth may land on /?gmail=connected — canonicalize to /gmail
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gmail = params.get("gmail");
    if (gmail === "connected" || gmail === "error") {
      if (location.pathname !== "/gmail") {
        routerNavigate(`/gmail${location.search}`, { replace: true });
      }
    }
  }, [location.pathname, location.search, routerNavigate]);

  // History / deep-links into a chat session → navigate to that module URL
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatSessionDetail>).detail;
      if (!detail?.sessionId) return;
      const target = viewForSessionId(detail.sessionId);
      routerNavigate(pathForView(target));
    };
    window.addEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
  }, [routerNavigate]);

  // Agent asks to open Investments / Savings / etc. while chatting
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ path?: string; tab?: string; view?: string }>).detail;
      if (!detail) return;
      if (detail.path) {
        routerNavigate(detail.path);
        return;
      }
      if (detail.view === "finance" && detail.tab) {
        const tab = detail.tab.replace(/-/g, "_") as FinanceTabId;
        routerNavigate(pathForFinanceTab(tab));
      } else if (detail.view) {
        routerNavigate(pathForView(detail.view as AppView));
      }
    };
    window.addEventListener("sybeez:navigate", onNav);
    return () => window.removeEventListener("sybeez:navigate", onNav);
  }, [routerNavigate]);

  const goHome = () => {
    applyDocumentTitle("home");
    routerNavigate("/");
  };

  const navigate = (next: AppView) => {
    applyDocumentTitle(next);
    routerNavigate(pathForView(next));
  };

  const setFinanceTab = (tab: FinanceTabId) => {
    routerNavigate(pathForFinanceTab(tab));
  };

  const setPlannerTab = (tab: PlannerTabId) => {
    routerNavigate(pathForPlannerTab(tab));
  };

  const setDiaryTab = (tab: DiaryTabId) => {
    routerNavigate(pathForDiaryTab(tab));
  };

  const setGmailTab = (tab: GmailTabId) => {
    routerNavigate(pathForGmailTab(tab));
  };

  const setSettingsSection = (section: string) => {
    routerNavigate(pathForSettingsSection(section));
  };

  // Chat panel stays pinned on Finance / Planner / Diary / Gmail (not closable).
  const showAssistant =
    view === "diary" || view === "finance" || view === "planner" || view === "gmail";

  return (
    <ChatProvider>
      <BrowserProvider>
        <div className="h-screen flex bg-background text-foreground overflow-hidden">
          <AppOnboardingTour />
          {/* Persistent application sidebar */}
          <AppSidebar
            activeView={view}
            onNavigate={navigate}
            onNewChat={goHome}
            isHistoryOpen={isHistoryOpen}
            onToggleHistory={() => setIsHistoryOpen((v) => !v)}
          />

          {/* Main content area */}
          <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary key={view} fallbackTitle="This view failed to load">
              {view === "settings" ? (
                <SettingsPanel
                  isOpen
                  onClose={goHome}
                  initialSection={settingsSection}
                  onSectionChange={setSettingsSection}
                  inline
                />
              ) : view === "finance" ? (
                <FinancialAssistant
                  onClose={goHome}
                  onSwitchToPlanner={() => navigate("planner")}
                  activeTab={financeTab}
                  onTabChange={setFinanceTab}
                />
              ) : view === "planner" ? (
                <DailyLifePlanner
                  onClose={goHome}
                  onSwitchToFinance={() => navigate("finance")}
                  activeTab={plannerTab}
                  onTabChange={setPlannerTab}
                />
              ) : view === "diary" ? (
                <LifeDiaryEnhanced
                  onClose={goHome}
                  activeTab={diaryTab}
                  onTabChange={setDiaryTab}
                />
              ) : view === "gmail" ? (
                <GmailIntegrationSidebar
                  onClose={goHome}
                  activeTab={gmailTab}
                  onTabChange={setGmailTab}
                />
              ) : view === "documents" ? (
                <DocumentStorage
                  onClose={goHome}
                />
              ) : (
                <HomeDashboard
                  onOpenFinance={() => navigate("finance")}
                  onOpenPlanner={() => navigate("planner")}
                  onOpenDiary={() => navigate("diary")}
                  onOpenGmail={() => navigate("gmail")}
                  onOpenDocuments={() => navigate("documents")}
                />
              )}
              </ErrorBoundary>
            </div>
          </main>

          {/* Right-side AI assistant panel (always open on these views) */}
          {showAssistant && view === "finance" && (
            <AssistantPanel
              title="Finance Assistant"
              subtitle="Finance Manager"
              system={FINANCE_SYSTEM}
              sessionId="finance-assistant"
              placeholder="Ask about money, investments, markets…"
              emptyHint="Ask about your portfolio, savings, bills, In & Out — or any investment / market question."
              suggestions={FINANCE_SUGGESTIONS}
              getContext={() =>
                buildFinanceAssistantContextAsync({
                  currentTab: financeTab,
                  pathname: location.pathname,
                })
              }
              useWebSearch
            />
          )}

          {showAssistant && view === "planner" && (
            <AssistantPanel
              title="Productivity Coach"
              subtitle="Your daily life & habits coach"
              system={PLANNER_SYSTEM}
              sessionId="productivity-coach"
              placeholder="Ask your coach…"
              emptyHint="Ask about schedules, habits, goals — or tap Generate my weekly review."
              suggestions={PLANNER_SUGGESTIONS}
              getContext={() => buildPlannerAssistantContext()}
            />
          )}

          {showAssistant && view === "diary" && (
            <AssistantPanel
              title="Life Companion"
              subtitle="Your personal reflection advisor"
              system={DIARY_SYSTEM}
              sessionId="diary-assistant"
              placeholder="Share your thoughts…"
              emptyHint="Share a sentence about your day — I’ll organize it into your diary. Or ask for reflection."
              suggestions={DIARY_SUGGESTIONS}
              getContext={() => buildDiaryAssistantContext()}
            />
          )}

          {showAssistant && view === "gmail" && (
            <AssistantPanel
              title="Email Assistant"
              subtitle="Your inbox management advisor"
              system={GMAIL_SYSTEM}
              sessionId="gmail-assistant"
              placeholder="Ask about your emails…"
              emptyHint="Ask me anything about your emails — organization, productivity, or communication tips."
              suggestions={GMAIL_SUGGESTIONS}
              getContext={() => {
                const gmail = readJSON("sybeez_gmail_data_v2") as {
                  accounts?: { email?: string }[];
                  emails?: Array<{
                    id?: string;
                    from?: string;
                    subject?: string;
                    isRead?: boolean;
                    preview?: string;
                    accountId?: string;
                  }>;
                  labels?: Array<{ id?: string; name?: string }>;
                } | null;
                const selected = readJSON("sybeez_gmail_selected_v1") as {
                  id?: string;
                  accountId?: string;
                  from?: string;
                  subject?: string;
                  preview?: string;
                  body?: string;
                } | null;
                const draftReply = readJSON("sybeez_gmail_draft_v1") as {
                  messageId?: string;
                  accountEmail?: string;
                  draftText?: string;
                  from?: string;
                  subject?: string;
                } | null;
                let activeAccount = "all";
                try {
                  activeAccount = (
                    usGetItem("sybeez_gmail_active_account_v1") || "all"
                  ).toLowerCase();
                } catch {
                  /* ignore */
                }
                const accounts = Array.isArray(gmail?.accounts) ? gmail!.accounts! : [];
                const accountEmail =
                  (activeAccount !== "all" && activeAccount) ||
                  selected?.accountId ||
                  accounts.find((a) => a.email)?.email ||
                  accounts[0]?.email ||
                  undefined;
                const emails = Array.isArray(gmail?.emails) ? gmail!.emails! : [];
                const scopedEmails =
                  activeAccount === "all"
                    ? emails
                    : emails.filter(
                        (e) => (e.accountId || "").toLowerCase() === activeAccount,
                      );
                const unread = scopedEmails.filter((e) => !e.isRead).length;
                const page = {
                  tab: "inbox",
                  active_account: activeAccount,
                  unread_count: unread,
                  labels: (gmail?.labels || []).map((l) => l.name).filter(Boolean).slice(0, 40),
                  emails: scopedEmails.slice(0, 20).map((e) => ({
                    id: e.id,
                    from: e.from,
                    subject: e.subject,
                    isRead: e.isRead,
                    preview: (e.preview || "").slice(0, 100),
                    accountId: e.accountId,
                  })),
                };
                return {
                  feature: "gmail",
                  account_email: accountEmail,
                  active_account: activeAccount,
                  selected_email: selected || undefined,
                  draft_reply: draftReply || undefined,
                  page,
                  gmail: {
                    accounts: accounts,
                    labels: gmail?.labels || [],
                    emails: page.emails,
                  },
                };
              }}
            />
          )}
        </div>
      </BrowserProvider>
    </ChatProvider>
  );
};

export default Index;
