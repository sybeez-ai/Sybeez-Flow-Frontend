import { usGetItem } from "@/services/userStorage";
/**
 * Build a complete Finance Manager context for the AI assistant.
 * Keeps raw life data for CRUD + a compact snapshot for Q&A.
 * Async variant attaches live Investment Hub portfolio quotes.
 */

import { LifeManagementService } from "@/services/lifeManagement";
import { appCurrencyCode } from "@/services/regionService";

function readJSON(key: string): unknown {
  try {
    return JSON.parse(usGetItem(key) || "null");
  } catch {
    return null;
  }
}

function num(n: unknown): number {
  const v = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function ym(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function buildFinanceAssistantContext(): Record<string, unknown> {
  return buildFinanceAssistantContextSync();
}

/** Sync builder (used as base). */
export function buildFinanceAssistantContextSync(
  portfolio?: Record<string, unknown> | null,
): Record<string, unknown> {
  const life = (readJSON("life_management_data") as Record<string, any>) || LifeManagementService.getData();
  const extras = (readJSON("finance_extra_features") as Record<string, any>) || {};
  const folders = (readJSON("sybeez_inout_month_folders") as string[]) || [];

  const transactions: any[] = Array.isArray(life.transactions) ? life.transactions : [];
  const savingsItems: any[] = Array.isArray(life.savingsItems) ? life.savingsItems : [];
  const savingsPlans: any[] = Array.isArray(life.savingsPlans) ? life.savingsPlans : [];
  const emis: any[] = Array.isArray(life.emis) ? life.emis : [];
  const insurances: any[] = Array.isArray(life.insurances) ? life.insurances : [];
  const subscriptions: any[] = Array.isArray(life.subscriptions) ? life.subscriptions : [];
  const bills: any[] = Array.isArray(life.bills) ? life.bills : [];
  const investments: any[] = Array.isArray(life.investments) ? life.investments : [];
  const creditCards: any[] = Array.isArray(life.creditCards) ? life.creditCards : [];
  const budgets: any[] = Array.isArray(life.budgets) ? life.budgets : [];

  const thisMonth = ym();
  const monthTxns = transactions.filter((t) => String(t.date || "").startsWith(thisMonth));
  const monthIncome = monthTxns
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + num(t.amount), 0);
  const monthExpense = monthTxns
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + num(t.amount), 0);

  const savingsTotal =
    savingsItems.reduce((s, i) => s + num(i.principal), 0) +
    savingsPlans.reduce((s, p) => s + num(p.currentAmount), 0);

  const savingsByKind: Record<string, number> = {};
  for (const i of savingsItems) {
    const k = String(i.kind || "other");
    savingsByKind[k] = (savingsByKind[k] || 0) + num(i.principal);
  }

  const emiMonthly = emis.reduce((s, e) => s + num(e.monthlyAmount), 0);
  const emiRemaining = emis.reduce(
    (s, e) => s + num(e.monthlyAmount) * Math.max(0, num(e.remainingMonths)),
    0,
  );

  const subMonthly = subscriptions.reduce((s, sub) => {
    const a = num(sub.amount);
    if (sub.frequency === "yearly") return s + a / 12;
    if (sub.frequency === "quarterly") return s + a / 3;
    return s + a;
  }, 0);

  const insuranceYearly = insurances.reduce((s, i) => s + num(i.premium), 0);

  const assets = Array.isArray(extras.assets) ? extras.assets : [];
  const debts = Array.isArray(extras.debts) ? extras.debts : [];
  const assetTotal = assets.reduce((s: number, a: any) => s + num(a.value), 0);
  const debtTotal =
    debts.reduce((s: number, d: any) => s + num(d.remaining ?? d.amount), 0) + emiRemaining;

  const upcoming = LifeManagementService.getUpcomingPayments(14);

  const byMonth: Record<string, { income: number; expense: number; count: number }> = {};
  for (const t of transactions) {
    const key = String(t.date || "").slice(0, 7);
    if (key.length < 7) continue;
    if (!byMonth[key]) byMonth[key] = { income: 0, expense: 0, count: 0 };
    const a = num(t.amount);
    if (t.type === "income") byMonth[key].income += a;
    else byMonth[key].expense += a;
    byMonth[key].count += 1;
  }

  const recentTxns = [...transactions]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 40)
    .map((t) => ({
      id: t.id,
      type: t.type,
      amount: num(t.amount),
      description: t.description,
      category: t.category,
      date: t.date,
    }));

  const pf = portfolio && typeof portfolio === "object" ? portfolio : null;
  const pfStocks = Array.isArray(pf?.stocks) ? (pf!.stocks as any[]) : [];

  const financeSnapshot = {
    currency: appCurrencyCode(),
    asOf: new Date().toISOString(),
    thisMonth: {
      key: thisMonth,
      label: monthLabel(thisMonth),
      income: monthIncome,
      expense: monthExpense,
      balance: monthIncome - monthExpense,
      transactionCount: monthTxns.length,
    },
    totals: {
      savings: savingsTotal,
      savingsByKind,
      emiMonthly,
      emiRemainingBalance: emiRemaining,
      subscriptionsMonthly: subMonthly,
      insuranceYearly,
      assets: assetTotal,
      liabilities: debtTotal,
      netWorthApprox: assetTotal + savingsTotal - debtTotal + num(pf?.total_current),
      portfolioInvested: num(pf?.total_invested),
      portfolioCurrent: num(pf?.total_current),
      portfolioPl: num(pf?.total_pl),
      portfolioPlPct: num(pf?.total_pl_pct),
    },
    counts: {
      transactions: transactions.length,
      savingsItems: savingsItems.length,
      savingsPlans: savingsPlans.length,
      emis: emis.length,
      insurances: insurances.length,
      subscriptions: subscriptions.length,
      bills: bills.length,
      investments: investments.length,
      portfolioHoldings: pfStocks.length,
      creditCards: creditCards.length,
      budgets: budgets.length,
    },
    monthFolders: folders,
    monthlyInOut: Object.entries(byMonth)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([key, v]) => ({
        month: key,
        label: monthLabel(key),
        ...v,
        balance: v.income - v.expense,
      })),
    savingsItems: savingsItems.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      principal: num(i.principal),
      interestRate: i.interestRate,
      tenureMonths: i.tenureMonths,
      maturityAmount: i.maturityAmount,
      targetAmount: i.targetAmount,
    })),
    savingsPlans: savingsPlans.map((p) => ({
      id: p.id,
      name: p.name,
      current: num(p.currentAmount),
      target: num(p.targetAmount),
    })),
    emis: emis.map((e) => ({
      id: e.id,
      name: e.name,
      monthlyAmount: num(e.monthlyAmount),
      dueDay: e.dueDay,
      remainingMonths: e.remainingMonths,
      tenure: e.tenure,
      interestRate: e.interestRate,
      principalAmount: e.principalAmount,
      nextPaymentDate: e.nextPaymentDate,
      lender: e.lender,
      paidApprox: num(e.monthlyAmount) * Math.max(0, num(e.tenure) - num(e.remainingMonths)),
      remainingApprox: num(e.monthlyAmount) * Math.max(0, num(e.remainingMonths)),
    })),
    insurances: insurances.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      premium: num(i.premium),
      renewalDate: i.renewalDate,
      provider: i.provider,
    })),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      amount: num(s.amount),
      frequency: s.frequency,
      nextBillingDate: s.nextBillingDate,
    })),
    bills: bills.map((b) => ({
      id: b.id,
      name: b.name,
      amount: num(b.amount),
      dueDate: b.dueDate,
      isPaid: b.isPaid,
      category: b.category,
      frequency: b.frequency,
    })),
    investments: investments.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      invested: num(i.investedAmount),
      current: num(i.currentValue),
    })),
    portfolio: pf
      ? {
          total_invested: num(pf.total_invested),
          total_current: num(pf.total_current),
          total_pl: num(pf.total_pl),
          total_pl_pct: num(pf.total_pl_pct),
          stocks: pfStocks.slice(0, 40).map((s) => ({
            symbol: s.symbol,
            name: s.name,
            qty: num(s.qty),
            avg_buy_price: num(s.avg_buy_price),
            price: num(s.price),
            change_pct: num(s.change_pct),
            invested: num(s.invested),
            current_value: num(s.current_value),
            pl: num(s.pl),
            pl_pct: num(s.pl_pct),
            currency: s.currency,
          })),
        }
      : { stocks: [], total_invested: 0, total_current: 0, total_pl: 0, total_pl_pct: 0 },
    assets: assets.map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      value: num(a.value),
    })),
    debts: debts.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      remaining: num(d.remaining ?? d.amount),
    })),
    upcomingPayments: upcoming,
    recentTransactions: recentTxns,
  };

  return {
    feature: "finance",
    currency: appCurrencyCode(),
    financeSnapshot,
    portfolio: financeSnapshot.portfolio,
    enableWebSearch: true,
    enableRag: true,
    life: {
      transactions,
      savingsItems,
      savingsPlans,
      emis,
      insurances,
      subscriptions,
      bills,
      investments,
      creditCards,
      budgets,
    },
    finance: extras,
    monthFolders: folders,
  };
}

/** Async: pulls live Investment Hub portfolio quotes into context. */
export async function buildFinanceAssistantContextAsync(): Promise<Record<string, unknown>> {
  const API = (import.meta.env.VITE_API_URL || "http://localhost:8000") + "/api/stocks";
  let portfolio: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${API}/quotes`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") portfolio = data as Record<string, unknown>;
    }
  } catch {
    /* portfolio optional offline */
  }
  return buildFinanceAssistantContextSync(portfolio);
}
