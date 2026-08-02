import { usGetItem } from "@/services/userStorage";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Flame,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { LifeManagementService } from "@/services/lifeManagement";
import { netWorthService } from "@/services/netWorthService";
import { computeFinanceRollup } from "@/services/financeRollup";
import { currencyService } from "@/services/currencyService";
import { appCurrencyCode, formatAppMoney } from "@/services/regionService";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import MotivationQuote from "@/components/MotivationQuote";

interface HomeDashboardProps {
  onOpenFinance?: () => void;
  onOpenPlanner?: () => void;
  onOpenDiary?: () => void;
  onOpenGmail?: () => void;
  onOpenDocuments?: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const HomeDashboard = ({
  onOpenFinance,
  onOpenPlanner,
  onOpenDiary,
  onOpenGmail,
  onOpenDocuments,
}: HomeDashboardProps) => {
  const [tick, setTick] = useState(0);

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

    // ── Unified Finance picture (Bills loans, savings, NW, people money…) ──
    const rollup = computeFinanceRollup();
    const totalAssets = rollup.totalAssets;
    const totalLiabilities = rollup.totalLiabilities;
    const netWorth = rollup.netWorth;
    const liquidNetWorth =
      rollup.buckets.netWorthLedgerAssets +
      rollup.buckets.savings -
      rollup.totalLiabilities;
    let topCategory: { key: string; value: number; pct: number; color?: string } | null = null;
    try {
      topCategory = netWorthService.computeSummary().byCategory[0] ?? null;
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

    const savingsTotal = rollup.buckets.savings;
    const emiMonthly = rollup.buckets.emiMonthly;
    const unpaidBills = rollup.buckets.unpaidBills;

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
        const ext = JSON.parse(usGetItem("sybeez_extended_life_data") || "null");
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
        const diary = JSON.parse(usGetItem("sybeez_life_diary") || "null");
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


  return (
    <div className="w-full h-full flex bg-background text-foreground overflow-hidden">
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

            {/* Other modules — same URL routing as the sidebar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
              <button
                type="button"
                onClick={onOpenDiary}
                className="group text-left glass-card rounded-2xl p-4 transition-all hover:bg-white/[0.06]"
              >
                <p className="text-[14px] font-semibold">Life Diary</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">/diary</p>
              </button>
              <button
                type="button"
                onClick={onOpenGmail}
                className="group text-left glass-card rounded-2xl p-4 transition-all hover:bg-white/[0.06]"
              >
                <p className="text-[14px] font-semibold">Gmail Manager</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">/gmail</p>
              </button>
              <button
                type="button"
                onClick={onOpenDocuments}
                className="group text-left glass-card rounded-2xl p-4 transition-all hover:bg-white/[0.06]"
              >
                <p className="text-[14px] font-semibold">Documents</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">/documents</p>
              </button>
            </div>

          </div>
        </div>
      </div>
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
