import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import AppSidebar, { AppView } from "@/components/AppSidebar";
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

const readJSON = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const FINANCE_SYSTEM =
  "You are the Finance Manager AI inside Sybeez Flow with LIVE access to the user's complete finance data " +
  "AND their Investment Hub portfolio (live quotes). " +
  "For investments, stocks, markets, or portfolio questions: ground answers in the user's holdings first, " +
  "then use web search / scrape / RAG for latest prices and news. " +
  "FORMAT every reply in Markdown: **bold section headings**, blank line between sections, " +
  "and emoji bullets when helpful (e.g. 📈 portfolio, 💰 money, ⚠️ risks, ✅ tips, 🏦 savings). " +
  "Example: **Your portfolio** then a blank line then `- 📈 RELIANCE: …`. " +
  "For follow-up questions, continue from the prior conversation (same goal, amount, timeline) — do not restart. " +
  "Reply like ChatGPT: friendly, clear, well-spaced. Never output JSON or raw data dumps. " +
  "You can also log/update/delete income and expenses from chat when asked. " +
  "If data is missing, say so briefly.";

const PLANNER_SYSTEM =
  "You are an expert productivity and life coach inside the Sybeez Flow app. " +
  "You can CREATE, READ, UPDATE and DELETE plan tasks and habits from chat " +
  "(e.g. 'make a plan…', 'show my plan', 'mark gym as done', 'delete deep work', 'clear my plan'). " +
  "When the user asks to generate a weekly review / review my week / generate review: " +
  "use scheduleReview in context (completed today, yesterday, and this week). " +
  "Ground the review ONLY in those completed schedules — never invent fake wins. " +
  "Format with Markdown: **Summary**, **Grade** (A–F), **Highlights**, **Areas to improve**, **Recommendations**. " +
  "Be concise, encouraging and practical. Confirm what you changed.";

const FINANCE_SUGGESTIONS = [
  "How is my portfolio doing?",
  "How much is in my savings?",
  "Show this month's In and Out",
  "What should I know about my investments?",
];

const PLANNER_SUGGESTIONS = [
  "Generate my weekly review",
  "Show my plan",
  "Mark deep work as done",
  "Plan my day: deep work 9-11, gym 18-19",
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
    }>;
    habits?: unknown[];
    goals?: unknown[];
  } | null;
  const schedule = Array.isArray(planner?.dailySchedule) ? planner!.dailySchedule! : [];
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

  return {
    feature: "planner",
    life: readJSON("life_management_data"),
    planner,
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
  "You are a thoughtful personal life companion inside the Sybeez Flow app. " +
  "Help the user reflect on their life, process emotions, gain insights, and celebrate achievements. " +
  "Be empathetic, insightful and encouraging. Ask thoughtful questions when appropriate.";

const DIARY_SUGGESTIONS = [
  "Help me reflect on today",
  "What did I learn?",
  "How can I feel better?",
  "Celebrate my wins",
];

const GMAIL_SYSTEM =
  "You are the Email Assistant inside Sybeez Flow with LIVE Gmail access. " +
  "You can search the full mailbox, create labels, move mail, and save rules like " +
  "'if mail from X move to label Y'. Also surface renewals/meetings so nothing is missed. " +
  "Be concise and confirm what you changed.";

const GMAIL_SUGGESTIONS = [
  "Show my unread emails",
  "Create label Bills",
  "If mail from stripe.com move to Bills",
  "Remind me about renewals and meetings",
];

const VIEW_KEY = "sybeez_active_view";
const VALID_VIEWS: AppView[] = [
  "home",
  "finance",
  "planner",
  "diary",
  "gmail",
  "documents",
  "settings",
];

const Index = () => {
  const [view, setView] = useState<AppView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as AppView | null;
      if (saved && VALID_VIEWS.includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    return "home";
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("account");
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  useEffect(() => {
    document.title = "Sybeez Flow";
  }, []);

  // Persist active module (Finance Dashboard, Planner, …) across reloads
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Return from Gmail Google OAuth → open Gmail Manager
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected" || params.get("gmail") === "error") {
      setView("gmail");
      setIsAssistantOpen(true);
    }
  }, []);

  // Open the assistant automatically when entering Finance, Life Planner, Diary or Gmail.
  useEffect(() => {
    if (view === "finance" || view === "planner" || view === "diary" || view === "gmail") {
      setIsAssistantOpen(true);
    } else {
      setIsAssistantOpen(false);
    }
  }, [view]);

  const goHome = () => setView("home");

  const navigate = (next: AppView) => {
    setView(next);
    if (next === "settings") setSettingsSection("account");
  };

  // Diary always keeps Life Companion pinned on the right.
  const showAssistant =
    view === "diary" ||
    ((view === "finance" || view === "planner" || view === "gmail") && isAssistantOpen);

  return (
    <ChatProvider>
      <BrowserProvider>
        <div className="h-screen flex bg-background text-foreground overflow-hidden">
          {/* Persistent application sidebar */}
          <AppSidebar
            activeView={view}
            onNavigate={navigate}
            onNewChat={goHome}
            isHistoryOpen={isHistoryOpen}
            onToggleHistory={() => setIsHistoryOpen((v) => !v)}
          />

          {/* Main content area */}
          <main className="flex-1 overflow-hidden relative min-w-0">
            {view === "settings" ? (
              <SettingsPanel
                isOpen
                onClose={goHome}
                initialSection={settingsSection}
                inline
              />
            ) : view === "finance" ? (
              <FinancialAssistant
                onClose={goHome}
                onSwitchToPlanner={() => navigate("planner")}
              />
            ) : view === "planner" ? (
              <DailyLifePlanner
                onClose={goHome}
                onSwitchToFinance={() => navigate("finance")}
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

            {/* Floating button to reopen the assistant when it's closed */}
            {(view === "finance" || view === "planner" || view === "gmail") && !isAssistantOpen && (
              <button
                onClick={() => setIsAssistantOpen(true)}
                className="absolute bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-foreground text-background rounded-full shadow-xl hover:scale-105 transition-all duration-200 border border-border/30"
              >
                <Bot className="h-5 w-5" />
                <span className="text-sm font-medium">Ask AI</span>
              </button>
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
              emptyHint="Ask me anything about your life — reflect on your day, process emotions, or gain insights."
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
                    from?: string;
                    subject?: string;
                    isRead?: boolean;
                    preview?: string;
                  }>;
                  labels?: Array<{ id?: string; name?: string }>;
                } | null;
                const accountEmail =
                  gmail?.accounts?.find((a) => a.email)?.email ||
                  (Array.isArray(gmail?.accounts) && gmail?.accounts[0]?.email) ||
                  undefined;
                const emails = Array.isArray(gmail?.emails) ? gmail!.emails! : [];
                const unread = emails.filter((e) => !e.isRead).length;
                // Compact page snapshot so the bot can "see" the open inbox without oversized payloads
                const page = {
                  tab: "inbox",
                  unread_count: unread,
                  labels: (gmail?.labels || []).map((l) => l.name).filter(Boolean).slice(0, 40),
                  emails: emails.slice(0, 20).map((e) => ({
                    from: e.from,
                    subject: e.subject,
                    isRead: e.isRead,
                    preview: (e.preview || "").slice(0, 100),
                  })),
                };
                return {
                  feature: "gmail",
                  account_email: accountEmail,
                  page,
                  gmail: {
                    accounts: gmail?.accounts || [],
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
