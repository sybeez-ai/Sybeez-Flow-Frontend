import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  CalendarDays,
  CheckCircle2,
  Flame,
  Loader2,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  User,
  X,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { askAI } from "@/services/aiService";
import { LifeManagementService } from "@/services/lifeManagement";
import { chatHistory } from "@/services/chatHistory";
import { netWorthService } from "@/services/netWorthService";
import { currencyService } from "@/services/currencyService";
import { appCurrencyCode, formatAppMoney } from "@/services/regionService";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import MotivationQuote from "@/components/MotivationQuote";
import {
  OPEN_CHAT_SESSION_EVENT,
  loadChatSession,
  persistChatSession,
  viewForSessionId,
  type OpenChatSessionDetail,
} from "@/services/chatSessionStore";

interface HomeDashboardProps {
  onOpenFinance?: () => void;
  onOpenPlanner?: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT =
  "You are Sybeez Flow, a friendly and capable personal assistant focused on two things: " +
  "personal finance and daily life planning / productivity. " +
  "Answer concisely and helpfully. When relevant, guide the user toward the Finance Manager " +
  "or Life Planner. Use short paragraphs and bullet points. Be warm and encouraging.";

const SUGGESTIONS = [
  "How can I save more money this month?",
  "Plan a productive morning routine",
  "Summarize my financial health",
  "Help me set a weekly goal",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const HomeDashboard = ({ onOpenFinance, onOpenPlanner }: HomeDashboardProps) => {
  const [input, setInput] = useState("");
  const [panelInput, setPanelInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [homeSessionId, setHomeSessionId] = useState("home-assistant");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelTextareaRef = useRef<HTMLTextAreaElement>(null);

  const resizePanelComposer = () => {
    const el = panelTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 160)}px`;
  };

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const unsubNW = netWorthService.subscribe(refresh);
    const unsubCcy = currencyService.subscribe(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener("sybeez:region-changed", refresh);
    return () => {
      unsubNW();
      unsubCcy();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("sybeez:region-changed", refresh);
    };
  }, []);

  const metrics = useMemo(() => {
    const life = LifeManagementService.getData();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currency = appCurrencyCode() || currencyService.getBaseCurrency() || "EUR";

    // ── Finance: Net Worth ledger ──────────────────────────────────
    let nwAssets = 0;
    let nwLiabilities = 0;
    let nwLiquid = 0;
    let topCategory: { key: string; value: number; pct: number; color?: string } | null = null;
    try {
      const s = netWorthService.computeSummary();
      nwAssets = s.totalAssets;
      nwLiabilities = s.totalLiabilities;
      nwLiquid = s.liquidNetWorth;
      topCategory = s.byCategory[0] ?? null;
    } catch {
      /* ignore */
    }

    // ── Finance: Daily In & Out (this month) ───────────────────────
    let monthIn = 0;
    let monthOut = 0;
    let monthTxnCount = 0;
    for (const t of life.transactions || []) {
      if (!(t.date || "").startsWith(currentMonth)) continue;
      const a = Number(t.amount) || 0;
      monthTxnCount += 1;
      if (t.type === "income") monthIn += a;
      else monthOut += a;
    }
    const monthBalance = monthIn - monthOut;

    // ── Finance: Savings (FD, bank, emergency, goals) ──────────────
    const savingsPlansTotal = (life.savingsPlans || []).reduce(
      (s, p) => s + (p.currentAmount || 0),
      0,
    );
    const savingsItems = life.savingsItems || [];
    const savingsItemsTotal = savingsItems.reduce((s, p) => s + (p.principal || 0), 0);
    const savingsTotal = savingsPlansTotal + savingsItemsTotal;
    const liquidSavings = savingsItems
      .filter((p) =>
        ["bank_account", "savings_account", "emergency_fund"].includes(p.kind),
      )
      .reduce((s, p) => s + (p.principal || 0), 0);

    // ── Finance: EMI remaining as liabilities ──────────────────────
    const emiLiability = (life.emis || []).reduce(
      (s, e) => s + (e.monthlyAmount || 0) * (e.remainingMonths || 0),
      0,
    );
    const emiMonthly = (life.emis || []).reduce((s, e) => s + (e.monthlyAmount || 0), 0);
    const unpaidBills = (life.bills || [])
      .filter((b) => !b.isPaid)
      .reduce((s, b) => s + (b.amount || 0), 0);

    // Combined picture across Finance Manager modules
    const totalAssets = nwAssets + savingsTotal;
    const totalLiabilities = nwLiabilities + emiLiability;
    const netWorth = totalAssets - totalLiabilities;
    const liquidNetWorth = nwLiquid + liquidSavings;

    // ── Productivity — Life Planner ────────────────────────────────
    let tasksTotal = 0;
    let tasksDone = 0;
    let pendingTasks: { id: string; title: string; priority: string }[] = [];
    let habitsTotal = 0;
    let habitsDoneToday = 0;
    let totalStreak = 0;
    let diaryEntries = 0;
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      let schedule: Array<{
        id?: string;
        title?: string;
        isCompleted?: boolean;
      }> = [];
      let habits: Array<{
        id?: string;
        name?: string;
        title?: string;
        currentStreak?: number;
        streak?: number;
        completedDates?: string[];
        lastCompleted?: string;
      }> = [];

      try {
        const ext = JSON.parse(localStorage.getItem("sybeez_extended_life_data") || "null");
        if (ext) {
          schedule = Array.isArray(ext.dailySchedule) ? ext.dailySchedule : [];
          habits = Array.isArray(ext.habits) ? ext.habits : [];
        }
      } catch {
        /* ignore */
      }

      if (!schedule.length && life.tasks?.length) {
        schedule = life.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          isCompleted: t.isCompleted,
        }));
      }
      if (!habits.length && life.habits?.length) {
        habits = life.habits.map((h) => ({
          id: h.id,
          name: h.name,
          currentStreak: h.streak,
          streak: h.streak,
          lastCompleted: h.lastCompleted,
          completedDates: [],
        }));
      }

      tasksTotal = schedule.length;
      tasksDone = schedule.filter((t) => t.isCompleted).length;
      pendingTasks = schedule
        .filter((t) => !t.isCompleted)
        .slice(0, 3)
        .map((t) => ({
          id: String(t.id || t.title || Math.random()),
          title: String(t.title || "Task"),
          priority: "medium",
        }));

      habitsTotal = habits.length;
      habitsDoneToday = habits.filter((h) => {
        if (Array.isArray(h.completedDates) && h.completedDates.includes(todayIso)) return true;
        if (h.lastCompleted && new Date(h.lastCompleted).toISOString().slice(0, 10) === todayIso) {
          return true;
        }
        return false;
      }).length;
      totalStreak = habits.reduce(
        (s, h) => s + (Number(h.currentStreak || h.streak) || 0),
        0,
      );

      try {
        const diary = JSON.parse(localStorage.getItem("sybeez_life_diary") || "null");
        if (Array.isArray(diary)) diaryEntries = diary.length;
        else if (Array.isArray(diary?.entries)) diaryEntries = diary.entries.length;
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }

    const taskRatio = tasksTotal ? tasksDone / tasksTotal : 0;
    const habitRatio = habitsTotal ? habitsDoneToday / habitsTotal : 0;
    const productivityScore =
      tasksTotal === 0 && habitsTotal === 0
        ? 0
        : Math.round((taskRatio * 0.6 + habitRatio * 0.4) * 100);

    return {
      currency,
      currentMonth,
      netWorth,
      totalAssets,
      totalLiabilities,
      liquidNetWorth,
      topCategory,
      monthIn,
      monthOut,
      monthBalance,
      monthTxnCount,
      savingsTotal,
      emiMonthly,
      unpaidBills,
      tasksTotal,
      tasksDone,
      pendingTasks,
      habitsTotal,
      habitsDoneToday,
      totalStreak,
      productivityScore,
      diaryEntries,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const fmt = (v: number) => formatAppMoney(v);
  const fullDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, chatOpen]);

  useEffect(() => {
    resizePanelComposer();
  }, [panelInput]);

  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent<string>).detail;
      if (typeof query === "string" && query.trim()) {
        setInput(query);
        setChatOpen(false);
      }
    };
    window.addEventListener("history-item-selected", handler);
    return () => window.removeEventListener("history-item-selected", handler);
  }, []);

  // Open a full home chat from History
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatSessionDetail>).detail;
      if (!detail?.sessionId) return;
      if (viewForSessionId(detail.sessionId) !== "home") return;
      setHomeSessionId(detail.sessionId);
      setChatOpen(true);
      void loadChatSession(detail.sessionId).then((stored) => {
        setMessages(stored);
      });
    };
    window.addEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
  }, []);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || isLoading) return;

    setChatOpen(true);
    const nextHistory = [...messages];
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setPanelInput("");
    setIsLoading(true);

    if (nextHistory.length === 0) {
      chatHistory.add(prompt, homeSessionId, "Home");
    }

    try {
      let context: Record<string, unknown> = {
        feature: "home",
        dashboard: {
          currency: metrics.currency,
          monthIn: metrics.monthIn,
          monthOut: metrics.monthOut,
          monthBalance: metrics.monthBalance,
          savingsTotal: metrics.savingsTotal,
          netWorth: metrics.netWorth,
          totalAssets: metrics.totalAssets,
          totalLiabilities: metrics.totalLiabilities,
          emiMonthly: metrics.emiMonthly,
          unpaidBills: metrics.unpaidBills,
          tasksDone: metrics.tasksDone,
          tasksTotal: metrics.tasksTotal,
          habitsDoneToday: metrics.habitsDoneToday,
          habitsTotal: metrics.habitsTotal,
          productivityScore: metrics.productivityScore,
        },
      };
      try {
        const data = LifeManagementService.getData?.();
        if (data) {
          context = {
            ...context,
            transactionsThisMonth: (data.transactions || [])
              .filter((t) => (t.date || "").startsWith(metrics.currentMonth))
              .slice(-20),
            savingsItems: data.savingsItems || [],
            emis: data.emis || [],
          };
        }
      } catch {
        /* ignore */
      }

      const reply = await askAI(prompt, {
        system: SYSTEM_PROMPT,
        sessionId: homeSessionId,
        history: nextHistory,
        context,
      });
      const withAssistant: ChatMessage[] = [
        ...nextHistory,
        { role: "user", content: prompt },
        { role: "assistant", content: reply },
      ];
      setMessages(withAssistant);
      void persistChatSession(homeSessionId, withAssistant, "Home").then(() => {
        window.dispatchEvent(new Event("sybeez-chat-saved"));
      });
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant just now. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setPanelInput("");
  };

  return (
    <div className="w-full h-full flex bg-background text-foreground overflow-hidden">
      {/* Main dashboard */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 w-full py-8">
            {/* Header */}
            <div className="mb-7">
              <p className="text-[13px] text-muted-foreground">{fullDate}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
                {greeting()}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Here's your finance &amp; productivity overview.
              </p>
            </div>

            {/* Daily Motivation Quote */}
            <MotivationQuote allowRefresh={true} />

            {/* KPI grid — live from Finance + Planner */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard
                icon={<Wallet className="h-4 w-4 text-emerald-400" />}
                label="This month balance"
                value={fmt(metrics.monthBalance)}
                sub={`In ${fmt(metrics.monthIn)} · Out ${fmt(metrics.monthOut)}`}
              />
              <KpiCard
                icon={<PiggyBank className="h-4 w-4 text-sky-400" />}
                label="Savings"
                value={fmt(metrics.savingsTotal)}
                sub={`Liquid ${fmt(metrics.liquidNetWorth)}`}
              />
              <KpiCard
                icon={<CheckCircle2 className="h-4 w-4 text-violet-400" />}
                label="Tasks Today"
                value={`${metrics.tasksDone}/${metrics.tasksTotal}`}
                sub={`${Math.max(metrics.tasksTotal - metrics.tasksDone, 0)} pending`}
              />
              <KpiCard
                icon={<Flame className="h-4 w-4 text-orange-400" />}
                label="Habit Streak"
                value={`${metrics.totalStreak}d`}
                sub={`${metrics.habitsDoneToday}/${metrics.habitsTotal} done today`}
              />
            </div>

            {/* Summary panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-7">
              {/* Finance — connected to In/Out, savings, NW, bills */}
              <button
                onClick={onOpenFinance}
                className="group text-left glass-card rounded-2xl p-5 transition-all duration-200 hover:bg-white/[0.06] hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                      <Wallet className="h-4.5 w-4.5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold">Finance Manager</h3>
                      <p className="text-[12px] text-muted-foreground">
                        In &amp; Out · savings · net worth · {metrics.currency}
                      </p>
                    </div>
                  </div>
                  <ArrowUp className="h-4 w-4 rotate-45 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </div>

                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  Net worth
                </p>
                <p className="text-2xl font-bold tabular-nums">{fmt(metrics.netWorth)}</p>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-emerald-400/80">In</p>
                    <p className="font-semibold text-emerald-400 tabular-nums text-[13px]">
                      {fmt(metrics.monthIn)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-rose-400/80">Out</p>
                    <p className="font-semibold text-rose-400 tabular-nums text-[13px]">
                      {fmt(metrics.monthOut)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-sky-500/10 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-sky-400/80">Savings</p>
                    <p className="font-semibold text-sky-400 tabular-nums text-[13px]">
                      {fmt(metrics.savingsTotal)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assets</p>
                    <p className="mt-0.5 font-medium text-emerald-500 tabular-nums">
                      {fmt(metrics.totalAssets)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Liabilities
                    </p>
                    <p className="mt-0.5 font-medium text-red-400 tabular-nums">
                      {fmt(metrics.totalLiabilities)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  {metrics.monthTxnCount} txn this month
                  {metrics.emiMonthly > 0 ? ` · EMI ${fmt(metrics.emiMonthly)}/mo` : ""}
                  {metrics.unpaidBills > 0 ? ` · Bills due ${fmt(metrics.unpaidBills)}` : ""}
                </p>

                {metrics.topCategory && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1">
                      <span>Top allocation · {metrics.topCategory.key}</span>
                      <span className="tabular-nums">{metrics.topCategory.pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(metrics.topCategory.pct, 100)}%`,
                          background: metrics.topCategory.color || "#10b981",
                        }}
                      />
                    </div>
                  </div>
                )}
              </button>

              {/* Productivity */}
              <button
                onClick={onOpenPlanner}
                className="group text-left glass-card rounded-2xl p-5 transition-all duration-200 hover:bg-white/[0.06] hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                      <CalendarDays className="h-4.5 w-4.5 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold">Life Planner</h3>
                      <p className="text-[12px] text-muted-foreground">Tasks, habits &amp; goals</p>
                    </div>
                  </div>
                  <ArrowUp className="h-4 w-4 rotate-45 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold tabular-nums">{metrics.productivityScore}%</p>
                  <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Productivity score
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-400"
                    style={{ width: `${Math.min(metrics.productivityScore, 100)}%` }}
                  />
                </div>
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Up next
                  </p>
                  {metrics.pendingTasks.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      All clear — no pending tasks. 🎉
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {metrics.pendingTasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-[13px]">
                          <Target className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                          <span className="truncate text-foreground">{t.title}</span>
                          <span className="ml-auto flex-none text-[10px] uppercase text-muted-foreground">
                            {t.priority}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Right-side chat panel */}
      {chatOpen && (
        <aside className="w-full max-w-[440px] flex-none flex flex-col" style={{background:'rgba(255,255,255,0.03)',backdropFilter:'blur(28px) saturate(180%)',WebkitBackdropFilter:'blur(28px) saturate(180%)',borderLeft:'1px solid rgba(255,255,255,0.07)'}}>
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 h-14" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}} >
            <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                  <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Sybeez Flow</p>
                <p className="text-[11px] text-muted-foreground">Finance &amp; life planning</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={newChat}
                title="New chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setChatOpen(false)}
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
            {messages.length === 0 && !isLoading && (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <Sparkles className="mb-3 h-6 w-6" />
                <p className="text-sm">Ask me anything about your money or your day.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-foreground">
                    <Bot className="h-3.5 w-3.5 text-background" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-foreground text-background"
                      : "border border-border bg-background text-foreground"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-muted ring-1 ring-border">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-foreground">
                  <Bot className="h-3.5 w-3.5 text-background" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Panel composer */}
          <div className="border-t p-3" style={{borderColor:'rgba(255,255,255,0.06)'}}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(panelInput);
              }}
              className="relative flex items-end gap-2 rounded-2xl px-3.5 py-2.5 transition-all focus-within:bg-white/[0.06]" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}
            >
              <Textarea
                ref={panelTextareaRef}
                value={panelInput}
                onChange={(e) => setPanelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(panelInput);
                  }
                }}
                placeholder="Reply to Sybeez Flow…"
                rows={1}
                className="min-h-[24px] max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-[13.5px] leading-relaxed"
              />
              <button
                type="submit"
                disabled={!panelInput.trim() || isLoading}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
                aria-label="Send"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            </form>
          </div>
        </aside>
      )}
    </div>
  );
};

export default HomeDashboard;

const KpiCard = ({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) => (
  <div className="glass-card rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/[0.08]">
        {icon}
      </div>
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
    </div>
    <p className="text-xl font-bold tabular-nums truncate text-white">{value}</p>
    <p className="mt-0.5 text-[12px] text-white/40 truncate">{sub}</p>
  </div>
);
