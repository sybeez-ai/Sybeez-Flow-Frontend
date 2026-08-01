import { usGetItem, usSetItem } from "@/services/userStorage";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { SYBEEZ_LOGO_SRC } from "@/components/ChatAvatars";
import { BrowserProvider } from "@/contexts/BrowserContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { buildFinanceAssistantContextAsync } from "@/services/financeAssistantContext";
import { goalSnapshotForAI } from "@/services/goalProgressService";
import type { Goal } from "@/types/dailyLife";
import {
  financeTabFromPath,
  pathForFinanceTab,
  pathForPlannerTab,
  pathForSettingsSection,
  pathForView,
  plannerTabFromPath,
  settingsSectionFromPath,
  VIEW_TITLES,
  viewFromPath,
  type FinanceTabId,
  type PlannerTabId,
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
  "You are the Finance Manager agent inside Sybeez Flow. Act — do not only advise. " +
  "You have LIVE access to complete finance data AND Investment Hub portfolio. " +
  "When the user asks to log/add/update/delete spend or income, DO IT via actions and confirm. " +
  "For investments/markets: ground answers in holdings first, then web search/RAG. " +
  "FORMAT replies in Markdown with clear sections. Never invent balances. " +
  "Reply like ChatGPT: friendly, clear. Never output JSON to the user.";

const PLANNER_SYSTEM =
  "You are the Productivity Coach agent inside Sybeez Flow. Act on requests. " +
  "CREATE/READ/UPDATE/DELETE plan tasks, habits, and goal progress from chat. " +
  "Examples: make a plan, show my plan, mark gym done, delete a task, clear my plan, log goal progress. " +
  "Goals: use goalProgress only — never invent numbers. " +
  "Goal plans: date-wise plan + add_plan_tasks with goalId. " +
  "Weekly review: use scheduleReview + goalProgress facts only. " +
  "Confirm every change you made. Be concise and practical.";

const FINANCE_SUGGESTIONS = [
  "How is my portfolio doing?",
  "How much is in my savings?",
  "Show this month's In and Out",
  "What should I know about my investments?",
];

const PLANNER_SUGGESTIONS = [
  "Give me today's daily goal report",
  "How much progress on my goals?",
  "Create a plan for my active goals and add today's tasks",
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
  } | null;
  const schedule = Array.isArray(planner?.dailySchedule) ? planner!.dailySchedule! : [];
  const goals = Array.isArray(planner?.goals) ? planner!.goals! : [];
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
  };
}

const DIARY_SYSTEM =
  "You are the Life Diary companion agent inside Sybeez Flow. " +
  "When the user shares feelings, a day story, or asks to log/save/write to diary: " +
  "organize their words into a structured diary entry (title, content, mood, energy, " +
  "highlights, challenges, focusTomorrow) and SAVE it — then confirm. " +
  "Grateful phrases → gratitude. Lasting moments → memories. Ideas/dreams → thoughts. " +
  "For pure reflection questions with no content to save, coach empathetically. " +
  "Never invent past entries. Keep replies warm and short.";

const DIARY_SUGGESTIONS = [
  "Today I felt stressed at work but proud I finished my tasks",
  "I'm grateful for my health and my family",
  "Show my recent diary entries",
  "Help me reflect on today",
];

const GMAIL_SYSTEM =
  "You are the Email Assistant agent inside Sybeez Flow with LIVE Gmail access. Act on requests. " +
  "Always use active_account / account_email and the selected email's accountId. " +
  "You can search mail, create labels, auto-filing rules, draft replies, and send replies. " +
  "Reply drafts first — send only when the user confirms. " +
  "Surface renewals/meetings. Confirm which account you used.";

const GMAIL_SUGGESTIONS = [
  "Show my unread emails",
  "Move promotions to Promotions",
  "If mail from stripe.com move to Bills",
  "Organize my mail",
];

const VIEW_KEY = "sybeez_active_view";

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
  const settingsSection = useMemo(
    () => settingsSectionFromPath(location.pathname),
    [location.pathname],
  );

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  useEffect(() => {
    document.title = VIEW_TITLES[view] || "Sybeez Flow";
  }, [view]);

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
      setIsAssistantOpen(true);
    }
  }, [location.pathname, location.search, routerNavigate]);

  // Open the assistant automatically when entering Finance, Life Planner, Diary or Gmail.
  useEffect(() => {
    if (view === "finance" || view === "planner" || view === "diary" || view === "gmail") {
      setIsAssistantOpen(true);
    } else {
      setIsAssistantOpen(false);
    }
  }, [view]);

  // History / deep-links into a chat session → navigate to that module URL
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatSessionDetail>).detail;
      if (!detail?.sessionId) return;
      const target = viewForSessionId(detail.sessionId);
      routerNavigate(pathForView(target));
      setIsAssistantOpen(true);
    };
    window.addEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
  }, [routerNavigate]);

  const goHome = () => routerNavigate("/");

  const navigate = (next: AppView) => {
    routerNavigate(pathForView(next));
  };

  const setFinanceTab = (tab: FinanceTabId) => {
    routerNavigate(pathForFinanceTab(tab));
  };

  const setPlannerTab = (tab: PlannerTabId) => {
    routerNavigate(pathForPlannerTab(tab));
  };

  const setSettingsSection = (section: string) => {
    routerNavigate(pathForSettingsSection(section));
  };

  // Diary always keeps Life Companion pinned on the right.
  const showAssistant =
    view === "diary" ||
    ((view === "finance" || view === "planner" || view === "gmail") && isAssistantOpen);

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
                />
              ) : view === "gmail" ? (
                <GmailIntegrationSidebar
                  onClose={goHome}
                />
              ) : view === "documents" ? (
                <DocumentStorage
                  onClose={goHome}
                />
              ) : (
                <HomeDashboard
                  onOpenFinance={() => navigate("finance")}
                  onOpenPlanner={() => navigate("planner")}
                />
              )}
            </div>

            {/* Reserved dock — never overlays page content */}
            {(view === "finance" || view === "planner" || view === "gmail") && !isAssistantOpen && (
              <div
                className="flex-none flex items-center justify-end px-4 py-2.5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <button
                  onClick={() => setIsAssistantOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-border/50 bg-card/90 backdrop-blur-md text-foreground transition-all duration-200 hover:bg-white/[0.06] hover:scale-[1.02]"
                  title="ASK AI"
                >
                  <img
                    src={SYBEEZ_LOGO_SRC}
                    alt="Sybeez"
                    className="h-7 w-7 rounded-full object-contain"
                  />
                  <span className="text-sm font-semibold tracking-wide pr-1">ASK AI</span>
                </button>
              </div>
            )}
          </main>

          {/* Right-side AI assistant panel */}
          {showAssistant && view === "finance" && (
            <AssistantPanel
              title="Finance Assistant"
              subtitle="Finance Manager"
              system={FINANCE_SYSTEM}
              sessionId="finance-assistant"
              placeholder="Ask about money, investments, markets…"
              emptyHint="Ask about your portfolio, savings, bills, In & Out — or any investment / market question."
              suggestions={FINANCE_SUGGESTIONS}
              getContext={() => buildFinanceAssistantContextAsync()}
              useWebSearch
              onClose={() => setIsAssistantOpen(false)}
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
              onClose={() => setIsAssistantOpen(false)}
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
              getContext={() => ({
                feature: "diary",
                diary: readJSON("sybeez_life_diary"),
                life: readJSON("life_management_data"),
              })}
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
              onClose={() => setIsAssistantOpen(false)}
            />
          )}
        </div>
      </BrowserProvider>
    </ChatProvider>
  );
};

export default Index;
