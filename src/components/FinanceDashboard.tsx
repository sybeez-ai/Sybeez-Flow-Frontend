/**
 * Finance Manager — main dashboard overview.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Activity,
  PiggyBank,
  Receipt,
  Wallet,
  Folder,
  ChevronRight,
  TrendingUp,
  Building,
  Landmark,
  Briefcase,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LifeManagementService } from "@/services/lifeManagement";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import { formatAppMoney, appCurrencyCode } from "@/services/regionService";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { cn } from "@/lib/utils";

type FinanceTab =
  | "dashboard"
  | "daily_inout"
  | "networth"
  | "bills"
  | "charts"
  | "investments"
  | "savings"
  | "reports"
  | "currency";

type Props = {
  onNavigate: (tab: FinanceTab) => void;
  healthScore: number;
  healthLabel?: string;
  healthHint?: string;
  sideIncome: number;
};

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function money(n: number) {
  return formatAppMoney(n || 0);
}

export default function FinanceDashboard({
  onNavigate,
  healthScore,
  healthLabel,
  healthHint,
  sideIncome,
}: Props) {
  useAppCurrency();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { domains?: string[] } | undefined;
      if (!d?.domains || d.domains.includes("finance")) setTick((t) => t + 1);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, []);

  const data = useMemo(() => {
    void tick;
    return LifeManagementService.getData();
  }, [tick]);
  const currentMonth = ym();

  const monthStats = useMemo(() => {
    const txns = data.transactions || [];
    let income = 0;
    let expense = 0;
    const monthTxns = txns.filter((t) => (t.date || "").startsWith(currentMonth));
    for (const t of monthTxns) {
      const a = Number(t.amount) || 0;
      if (t.type === "income") income += a;
      else expense += a;
    }
    return {
      income,
      expense,
      balance: income - expense,
      count: monthTxns.length,
      recent: [...monthTxns]
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 6),
    };
  }, [data.transactions, currentMonth]);

  const savingsTotal = useMemo(() => {
    const plans = (data.savingsPlans || []).reduce(
      (s, p) => s + (p.currentAmount || 0),
      0,
    );
    const items = (data.savingsItems || []).reduce(
      (s, p) => s + (p.principal || 0),
      0,
    );
    return plans + items;
  }, [data.savingsPlans, data.savingsItems]);

  const savingsCount = (data.savingsItems || []).length + (data.savingsPlans || []).length;

  const billsDue = useMemo(() => {
    const unpaid = (data.bills || []).filter((b) => !b.isPaid).slice(0, 4);
    const emis = (data.emis || []).slice(0, 3);
    return { unpaid, emis, emiMonthly: emis.reduce((s, e) => s + (e.monthlyAmount || 0), 0) };
  }, [data.bills, data.emis]);

  const folderPreview = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>();
    for (const t of data.transactions || []) {
      const key = (t.date || "").slice(0, 7);
      if (key.length < 7) continue;
      if (!map.has(key)) map.set(key, { income: 0, expense: 0, count: 0 });
      const row = map.get(key)!;
      const a = Number(t.amount) || 0;
      if (t.type === "income") row.income += a;
      else row.expense += a;
      row.count += 1;
    }
    if (!map.has(currentMonth)) {
      map.set(currentMonth, { income: 0, expense: 0, count: 0 });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        ...v,
        balance: v.income - v.expense,
      }))
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 4);
  }, [data.transactions, currentMonth]);

  const healthColor =
    healthScore >= 70 ? "text-emerald-400" : healthScore >= 50 ? "text-amber-400" : "text-rose-400";

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 md:p-5 space-y-4 max-w-5xl">
        {/* This month hero */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.04] to-transparent p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                This month · {appCurrencyCode()}
              </p>
              <h3 className="text-lg font-semibold mt-0.5">{monthTitle(currentMonth)}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {monthStats.count} transaction{monthStats.count === 1 ? "" : "s"} recorded
              </p>
            </div>
            <Button size="sm" onClick={() => onNavigate("daily_inout")}>
              <Folder className="h-3.5 w-3.5 mr-1.5" />
              Open month folders
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-emerald-400/80 mb-1">
                <ArrowDownCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wide">In</span>
              </div>
              <p className="text-xl font-bold text-emerald-400 tabular-nums">
                {money(monthStats.income)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-rose-400/80 mb-1">
                <ArrowUpCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Out</span>
              </div>
              <p className="text-xl font-bold text-rose-400 tabular-nums">
                {money(monthStats.expense)}
              </p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-sky-400/80 mb-1">
                <Wallet className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Balance</span>
              </div>
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  monthStats.balance >= 0 ? "text-sky-400" : "text-rose-400",
                )}
              >
                {money(monthStats.balance)}
              </p>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Kpi
            label="Health score"
            value={`${healthScore}/100`}
            valueClass={healthColor}
            sub={healthLabel ? `${healthLabel}${healthHint ? ` · ${healthHint}` : ""}` : healthHint}
            icon={<Activity className="h-4 w-4" />}
          />
          <Kpi
            label="Savings"
            value={money(savingsTotal)}
            sub={`${savingsCount} item${savingsCount === 1 ? "" : "s"}`}
            icon={<PiggyBank className="h-4 w-4 text-sky-400" />}
            onClick={() => onNavigate("savings")}
          />
          <Kpi
            label="Side income"
            value={`${money(sideIncome)}/mo`}
            icon={<Briefcase className="h-4 w-4 text-violet-400" />}
          />
          <Kpi
            label="EMI / month"
            value={money(billsDue.emiMonthly)}
            sub={`${(data.emis || []).length} active`}
            icon={<Building className="h-4 w-4 text-amber-400" />}
            onClick={() => onNavigate("bills")}
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            {
              tab: "daily_inout" as const,
              label: "In & Out",
              hint: "Month folders",
              icon: <CalendarDays className="h-4 w-4 text-emerald-400" />,
            },
            {
              tab: "savings" as const,
              label: "Savings",
              hint: "FD · bank · emergency",
              icon: <PiggyBank className="h-4 w-4 text-sky-400" />,
            },
            {
              tab: "investments" as const,
              label: "Investments",
              hint: "Stocks & holdings",
              icon: <TrendingUp className="h-4 w-4 text-violet-400" />,
            },
            {
              tab: "networth" as const,
              label: "Net worth",
              hint: "Assets & liabilities",
              icon: <Landmark className="h-4 w-4 text-amber-400" />,
            },
          ].map((a) => (
            <button
              key={a.tab}
              type="button"
              onClick={() => onNavigate(a.tab)}
              className="rounded-xl border border-border bg-muted/20 px-3 py-3 text-left hover:bg-muted/35 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-lg bg-background/60 flex items-center justify-center">
                  {a.icon}
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-[11px] text-muted-foreground">{a.hint}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Recent this month */}
          <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
              <p className="text-sm font-medium">Recent this month</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onNavigate("daily_inout")}
              >
                See all
              </Button>
            </div>
            <div className="p-2.5 space-y-1.5">
              {monthStats.recent.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No entries yet this month</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    variant="outline"
                    onClick={() => onNavigate("daily_inout")}
                  >
                    Add In / Out
                  </Button>
                </div>
              ) : (
                monthStats.recent.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/30"
                  >
                    {t.type === "income" ? (
                      <ArrowDownCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.description}</p>
                      <p className="text-[11px] text-muted-foreground">{t.date}</p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium tabular-nums flex-shrink-0",
                        t.type === "income" ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {t.type === "income" ? "+" : "-"}
                      {money(Number(t.amount) || 0)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Month folders preview */}
          <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
              <p className="text-sm font-medium">Month folders</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onNavigate("daily_inout")}
              >
                Manage
              </Button>
            </div>
            <div className="p-2.5 space-y-1.5">
              {folderPreview.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => onNavigate("daily_inout")}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/30"
                >
                  <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <Folder className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{monthTitle(f.key)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {f.count} txn · In {money(f.income)} · Out {money(f.expense)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      f.balance >= 0 ? "text-sky-400" : "text-rose-400",
                    )}
                  >
                    {money(f.balance)}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Bills / EMI strip */}
        <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
            <p className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Bills & EMIs
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onNavigate("bills")}
            >
              Open bills
            </Button>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {billsDue.unpaid.length === 0 && billsDue.emis.length === 0 ? (
              <p className="text-sm text-muted-foreground md:col-span-2 py-4 text-center">
                No unpaid bills or EMIs
              </p>
            ) : (
              <>
                {billsDue.unpaid.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{b.name}</p>
                      <p className="text-[11px] text-muted-foreground">Due {b.dueDate}</p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{money(b.amount)}</p>
                  </div>
                ))}
                {billsDue.emis.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{e.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        EMI · {e.remainingMonths} mo left
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums text-amber-400">
                      {money(e.monthlyAmount)}/mo
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  valueClass,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  valueClass?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-muted/20 px-3 py-3 text-left",
        onClick && "hover:bg-muted/35 transition-colors cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between mb-2 text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className={cn("text-base font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p> : null}
    </Comp>
  );
}
