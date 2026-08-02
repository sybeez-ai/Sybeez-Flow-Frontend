/**
 * Financial Health Score (0–100) from real Finance data.
 * Pillars: cashflow, debt/EMI burden, savings buffer, obligations, extras.
 */

import { computeFinanceRollup } from "@/services/financeRollup";
import { localISODay } from "@/utils/dateUtils";

export interface HealthPillar {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface FinancialHealthResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  label: string;
  pillars: HealthPillar[];
}

type Txn = { type?: string; amount?: number; date?: string };
type DebtLike = { remaining?: number };
type SideIncomeLike = { active?: boolean; monthlyAmount?: number };
type BudgetLike = { spent?: number; limit?: number };
type CreditLike = { score?: number };
type AssetLike = { value?: number; amount?: number };
type SavingsPlanLike = { currentAmount?: number };
type SavingsItemLike = { principal?: number };
type EmiLike = { monthlyAmount?: number };
type BillLike = { amount?: number; isPaid?: boolean };
type PeopleLike = { amount?: number };
type InvestmentLike = { currentValue?: number; amount?: number };

function num(n: unknown): number {
  const v = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function localMonthKey(d = new Date()): string {
  return localISODay(d).slice(0, 7);
}

function gradeFor(score: number): FinancialHealthResult["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function labelFor(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 40) return "Needs work";
  if (score > 0) return "At risk";
  return "No data yet";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Average monthly income from recent transaction months + side income. */
function estimateMonthlyIncome(
  transactions: Txn[],
  sideMonthly: number,
): { monthly: number; note: string } {
  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "income") continue;
    const key = String(t.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    byMonth.set(key, (byMonth.get(key) || 0) + num(t.amount));
  }
  const months = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);
  const avgTxn =
    months.length > 0
      ? months.reduce((s, [, v]) => s + v, 0) / months.length
      : 0;
  const monthly = avgTxn + sideMonthly;
  if (monthly <= 0) {
    return { monthly: 0, note: "No income logged yet" };
  }
  if (months.length) {
    return {
      monthly,
      note: `Avg income from last ${months.length} active month(s)`,
    };
  }
  return { monthly, note: "Side income only" };
}

function avgMonthlyExpenses(transactions: Txn[]): number {
  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const key = String(t.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    byMonth.set(key, (byMonth.get(key) || 0) + num(t.amount));
  }
  const months = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);
  if (!months.length) return 0;
  return months.reduce((s, [, v]) => s + v, 0) / months.length;
}

/**
 * Compute a production health score from live Finance Manager data.
 */
export function computeFinancialHealthScore(input: {
  data: {
    transactions?: Txn[];
    savingsPlans?: SavingsPlanLike[];
    savingsItems?: SavingsItemLike[];
    emis?: EmiLike[];
    bills?: BillLike[];
    peopleMoney?: PeopleLike[];
    investments?: InvestmentLike[];
  };
  debts?: DebtLike[];
  sideIncomes?: SideIncomeLike[];
  budgetCategories?: BudgetLike[];
  creditScores?: CreditLike[];
  assets?: AssetLike[];
}): FinancialHealthResult {
  const data = input.data;
  const transactions = (data.transactions || []) as Txn[];
  const debts = input.debts || [];
  const sideIncomes = input.sideIncomes || [];
  const budgets = input.budgetCategories || [];
  const creditScores = input.creditScores || [];
  const assets = input.assets || [];

  const rollup = computeFinanceRollup();
  const savingsFromPlans =
    (data.savingsPlans || []).reduce((s, p) => s + num(p.currentAmount), 0) +
    (data.savingsItems || []).reduce((s, p) => s + num(p.principal), 0);
  const savings = Math.max(savingsFromPlans, rollup.buckets.savings);

  const emiMonthly = rollup.buckets.emiMonthly;
  const sideMonthly = sideIncomes
    .filter((s) => s.active)
    .reduce((s, i) => s + num(i.monthlyAmount), 0);
  const { monthly: incomeMonthly, note: incomeNote } = estimateMonthlyIncome(
    transactions,
    sideMonthly,
  );

  const extraDebtRemaining = debts.reduce((s, d) => s + num(d.remaining), 0);
  const unpaidBills = rollup.buckets.unpaidBills;
  const moneyToGive = rollup.buckets.moneyToGive;

  const hasAny =
    transactions.length > 0 ||
    savings > 0 ||
    emiMonthly > 0 ||
    extraDebtRemaining > 0 ||
    unpaidBills > 0 ||
    moneyToGive > 0 ||
    sideMonthly > 0 ||
    (data.investments || []).length > 0 ||
    assets.length > 0 ||
    rollup.totalAssets > 0 ||
    rollup.totalLiabilities > 0 ||
    budgets.length > 0 ||
    creditScores.length > 0;

  if (!hasAny) {
    return {
      score: 0,
      grade: "F",
      label: "No data yet",
      pillars: [],
    };
  }

  // ── Cashflow (25) ───────────────────────────────────────────────
  const thisMonth = localMonthKey();
  const monthKeys = [0, 1, 2].map((i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return localMonthKey(d);
  });
  let cashPts = 0;
  const monthNotes: string[] = [];
  for (const key of monthKeys) {
    const rows = transactions.filter((t) => String(t.date || "").startsWith(key));
    if (!rows.length) {
      if (key === thisMonth) monthNotes.push("No transactions this month");
      continue;
    }
    const inn = rows.filter((t) => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
    const out = rows.filter((t) => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);
    const bal = inn - out;
    if (inn <= 0 && out <= 0) continue;
    if (bal > 0 && inn > 0) {
      const rate = bal / inn;
      cashPts += clamp(rate * 12, 2, 10);
    } else if (bal >= 0) {
      cashPts += 4;
    } else {
      cashPts += 1;
    }
  }
  cashPts = clamp(Math.round(cashPts), 0, 25);
  if (cashPts === 0 && incomeMonthly > 0) {
    cashPts = 8;
    monthNotes.push("Using recent income history");
  }
  const cashflow: HealthPillar = {
    id: "cashflow",
    label: "Cashflow",
    score: cashPts,
    max: 25,
    note: monthNotes[0] || incomeNote,
  };

  // ── Debt / EMI burden (25) ──────────────────────────────────────
  let debtPts = 25;
  let debtNote = "No EMI or loan pressure";
  if (emiMonthly > 0 || extraDebtRemaining > 0 || rollup.totalLiabilities > 0) {
    if (incomeMonthly > 0) {
      const ratio = emiMonthly / incomeMonthly;
      if (ratio <= 0.2) {
        debtPts = 25;
        debtNote = `EMI ${Math.round(ratio * 100)}% of income — healthy`;
      } else if (ratio <= 0.35) {
        debtPts = 18;
        debtNote = `EMI ${Math.round(ratio * 100)}% of income — manageable`;
      } else if (ratio <= 0.5) {
        debtPts = 10;
        debtNote = `EMI ${Math.round(ratio * 100)}% of income — high`;
      } else {
        debtPts = 4;
        debtNote = `EMI ${Math.round(ratio * 100)}% of income — stretched`;
      }
    } else {
      debtPts = emiMonthly > 0 ? 6 : 12;
      debtNote = "EMI active but no income logged";
    }
    if (rollup.totalAssets > 0) {
      const lev = rollup.totalLiabilities / rollup.totalAssets;
      if (lev > 1) debtPts = Math.max(0, debtPts - 8);
      else if (lev > 0.6) debtPts = Math.max(0, debtPts - 4);
    } else if (rollup.totalLiabilities > 0) {
      debtPts = Math.max(0, debtPts - 6);
    }
  }
  const debtPillar: HealthPillar = {
    id: "debt",
    label: "Debt & EMI",
    score: clamp(Math.round(debtPts), 0, 25),
    max: 25,
    note: debtNote,
  };

  // ── Savings buffer (25) ─────────────────────────────────────────
  const avgExpense = avgMonthlyExpenses(transactions);
  const monthlyBurn = Math.max(emiMonthly + avgExpense * 0.5, emiMonthly, avgExpense);
  const monthsCovered = monthlyBurn > 0 ? savings / monthlyBurn : savings > 0 ? 6 : 0;
  let savePts = 0;
  let saveNote = "No savings yet";
  if (savings <= 0) {
    savePts = 0;
  } else if (monthsCovered >= 6) {
    savePts = 25;
    saveNote = `~${monthsCovered.toFixed(1)} months of buffer`;
  } else if (monthsCovered >= 3) {
    savePts = 18;
    saveNote = `~${monthsCovered.toFixed(1)} months of buffer`;
  } else if (monthsCovered >= 1) {
    savePts = 12;
    saveNote = `~${monthsCovered.toFixed(1)} months of buffer`;
  } else {
    savePts = clamp(Math.round(monthsCovered * 12), 2, 10);
    saveNote =
      monthlyBurn > 0
        ? `Savings cover ~${Math.round(monthsCovered * 30)} days of commitments`
        : "Small savings started";
  }
  if (emiMonthly > 0 && savings < emiMonthly) {
    savePts = Math.min(savePts, 8);
    saveNote = "Savings below one EMI payment";
  }
  const savingsPillar: HealthPillar = {
    id: "savings",
    label: "Savings buffer",
    score: clamp(savePts, 0, 25),
    max: 25,
    note: saveNote,
  };

  // ── Obligations (15) ────────────────────────────────────────────
  let oblPts = 15;
  const oblNotes: string[] = [];
  if (unpaidBills > 0) {
    oblPts -= Math.min(8, 3 + Math.floor(unpaidBills / 500));
    oblNotes.push("Unpaid bills");
  }
  if (moneyToGive > 0) {
    oblPts -= Math.min(4, 2);
    oblNotes.push("Money to give");
  }
  const overBudget = budgets.filter(
    (b) => num(b.spent) > num(b.limit) && num(b.limit) > 0,
  ).length;
  if (overBudget > 0) {
    oblPts -= Math.min(6, overBudget * 2);
    oblNotes.push(`${overBudget} budget(s) over`);
  }
  const obligations: HealthPillar = {
    id: "obligations",
    label: "Bills & budgets",
    score: clamp(Math.round(oblPts), 0, 15),
    max: 15,
    note: oblNotes[0] || "Obligations in check",
  };

  // ── Extras (10) ─────────────────────────────────────────────────
  let extraPts = 0;
  const extraNotes: string[] = [];
  const latestCredit = creditScores[creditScores.length - 1];
  if (latestCredit && num(latestCredit.score) > 0) {
    const cs = num(latestCredit.score);
    extraPts += clamp(Math.round((cs - 550) / 35), 0, 7);
    extraNotes.push(`Credit ${Math.round(cs)}`);
  }
  if (rollup.buckets.investments > 0 || rollup.buckets.portfolio > 0) {
    extraPts += 2;
    extraNotes.push("Investing");
  }
  if (rollup.netWorth > 0) {
    extraPts += 1;
  } else if (rollup.netWorth < 0) {
    extraPts = Math.max(0, extraPts - 2);
    extraNotes.push("Negative net worth");
  }
  extraPts = clamp(extraPts, 0, 10);
  const extras: HealthPillar = {
    id: "extras",
    label: "Credit & assets",
    score: extraPts,
    max: 10,
    note: extraNotes[0] || "Add credit score or investments",
  };

  const pillars = [cashflow, debtPillar, savingsPillar, obligations, extras];
  const score = clamp(
    Math.round(pillars.reduce((s, p) => s + p.score, 0)),
    0,
    100,
  );

  return {
    score,
    grade: gradeFor(score),
    label: labelFor(score),
    pillars,
  };
}
