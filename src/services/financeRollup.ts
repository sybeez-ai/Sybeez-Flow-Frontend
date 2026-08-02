/**
 * Single finance picture for the whole app.
 * Bills (EMIs, money to give/collect), Savings, Net Worth ledger,
 * unpaid bills, credit cards, and Investments all roll into one
 * easy-to-understand assets / liabilities / net worth summary.
 */

import { LifeManagementService } from "@/services/lifeManagement";
import { netWorthService } from "@/services/netWorthService";
import { currencyService } from "@/services/currencyService";
import { appCurrencyCode } from "@/services/regionService";
import { usGetItem } from "@/services/userStorage";
import type { EMI, PeopleMoneyItem } from "@/types/lifeManagement";

export type RollupSource =
  | "net_worth"
  | "emi"
  | "people_owe"
  | "people_collect"
  | "savings"
  | "investment"
  | "credit_card"
  | "unpaid_bill"
  | "extra_debt"
  | "extra_asset"
  | "portfolio";

export interface RollupLine {
  id: string;
  name: string;
  amount: number;
  source: RollupSource;
  note?: string;
  /** Where to manage this item in the app */
  manageIn?: string;
}

export interface FinanceRollup {
  currency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** Breakdown for UI */
  assets: RollupLine[];
  liabilities: RollupLine[];
  /** Quick buckets */
  buckets: {
    netWorthLedgerAssets: number;
    netWorthLedgerLiabilities: number;
    savings: number;
    investments: number;
    portfolio: number;
    emis: number;
    moneyToGive: number;
    moneyToCollect: number;
    unpaidBills: number;
    creditCards: number;
    extraDebts: number;
    emiMonthly: number;
  };
}

function num(n: unknown): number {
  const v = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function readJSON(key: string): unknown {
  try {
    return JSON.parse(usGetItem(key) || "null");
  } catch {
    return null;
  }
}

/** Outstanding loan balance — prefer principal when set, else EMI × months left. */
export function emiOutstanding(emi: Pick<EMI, "monthlyAmount" | "remainingMonths" | "principalAmount">): number {
  const principal = num(emi.principalAmount);
  if (principal > 0) return principal;
  return Math.max(0, num(emi.monthlyAmount) * num(emi.remainingMonths));
}

export function peopleOutstanding(item: PeopleMoneyItem): number {
  if (item.status === "settled") return 0;
  return Math.max(0, num(item.amount));
}

/**
 * Full integrated finance rollup (display currency = app / NW display currency).
 */
export function computeFinanceRollup(opts?: {
  portfolioCurrent?: number;
}): FinanceRollup {
  const life = LifeManagementService.getData();
  const nw = netWorthService.getData();
  const currency =
    appCurrencyCode() || nw.displayCurrency || currencyService.getBaseCurrency() || "EUR";
  const conv = (amount: number, from: string) =>
    currencyService.convert(amount, from || currency, currency);

  const assets: RollupLine[] = [];
  const liabilities: RollupLine[] = [];

  // ── Net Worth manual ledger ──────────────────────────────────────
  let nwAssets = 0;
  let nwLiabilities = 0;
  for (const a of nw.assets || []) {
    const v = conv(num(a.amount), a.currency);
    nwAssets += v;
    assets.push({
      id: `nw-a-${a.id}`,
      name: a.name,
      amount: v,
      source: "net_worth",
      note: a.category,
      manageIn: "Net Worth → Assets",
    });
  }
  for (const l of nw.liabilities || []) {
    const v = conv(num(l.amount), l.currency);
    nwLiabilities += v;
    liabilities.push({
      id: `nw-l-${l.id}`,
      name: l.name,
      amount: v,
      source: "net_worth",
      note: l.note || "Manual liability",
      manageIn: "Net Worth → Liabilities",
    });
  }

  // ── Savings ──────────────────────────────────────────────────────
  let savings = 0;
  for (const s of life.savingsItems || []) {
    const v = num(s.principal);
    if (v <= 0) continue;
    savings += v;
    assets.push({
      id: `sav-${s.id}`,
      name: s.name || "Savings",
      amount: v,
      source: "savings",
      note: String(s.kind || "savings"),
      manageIn: "Savings",
    });
  }
  for (const p of life.savingsPlans || []) {
    const v = num(p.currentAmount);
    if (v <= 0) continue;
    savings += v;
    assets.push({
      id: `plan-${p.id}`,
      name: p.name || "Savings goal",
      amount: v,
      source: "savings",
      note: "Goal",
      manageIn: "Savings",
    });
  }

  // ── Life investments (manual) ────────────────────────────────────
  let investments = 0;
  for (const inv of life.investments || []) {
    const v = num((inv as { currentValue?: number }).currentValue);
    if (v <= 0) continue;
    investments += v;
    assets.push({
      id: `inv-${inv.id}`,
      name: (inv as { name?: string }).name || "Investment",
      amount: v,
      source: "investment",
      manageIn: "Investments",
    });
  }

  // ── Live portfolio (optional) ────────────────────────────────────
  let portfolio = Math.max(0, num(opts?.portfolioCurrent));
  if (!portfolio) {
    const cached = readJSON("sybeez_portfolio_cache") as { total_current?: number } | null;
    portfolio = Math.max(0, num(cached?.total_current));
  }
  if (portfolio > 0) {
    assets.push({
      id: "portfolio-hub",
      name: "Investment Hub portfolio",
      amount: portfolio,
      source: "portfolio",
      note: "Live holdings",
      manageIn: "Investments",
    });
  }

  // ── EMIs & Loans → liabilities ───────────────────────────────────
  let emis = 0;
  let emiMonthly = 0;
  for (const e of life.emis || []) {
    const v = emiOutstanding(e);
    emiMonthly += num(e.monthlyAmount);
    if (v <= 0) continue;
    emis += v;
    liabilities.push({
      id: `emi-${e.id}`,
      name: e.name || "Loan / EMI",
      amount: v,
      source: "emi",
      note: e.principalAmount
        ? `Principal · ${e.remainingMonths || 0} mo left · ${e.lender || ""}`.trim()
        : `${e.remainingMonths || 0} months × EMI · ${e.lender || ""}`.trim(),
      manageIn: "Bills → EMIs & Loans",
    });
  }

  // ── People money ─────────────────────────────────────────────────
  let moneyToGive = 0;
  let moneyToCollect = 0;
  for (const p of life.peopleMoney || []) {
    const v = peopleOutstanding(p);
    if (v <= 0) continue;
    if (p.direction === "owe") {
      moneyToGive += v;
      liabilities.push({
        id: `pm-owe-${p.id}`,
        name: `Money to give · ${p.personName || "Someone"}`,
        amount: v,
        source: "people_owe",
        note: "From Bills → Commitments",
        manageIn: "Bills → Money to give",
      });
    } else {
      moneyToCollect += v;
      assets.push({
        id: `pm-col-${p.id}`,
        name: `Money to collect · ${p.personName || "Someone"}`,
        amount: v,
        source: "people_collect",
        note: "From Bills → Commitments",
        manageIn: "Bills → Money to collect",
      });
    }
  }

  // ── Unpaid bills (short-term liability) ──────────────────────────
  let unpaidBills = 0;
  for (const b of life.bills || []) {
    if (b.isPaid) continue;
    const v = num(b.amount);
    if (v <= 0) continue;
    unpaidBills += v;
    liabilities.push({
      id: `bill-${b.id}`,
      name: b.name || "Unpaid bill",
      amount: v,
      source: "unpaid_bill",
      manageIn: "Bills",
    });
  }

  // ── Credit cards ─────────────────────────────────────────────────
  let creditCards = 0;
  for (const c of life.creditCards || []) {
    const v = num(c.currentBalance);
    if (v <= 0) continue;
    creditCards += v;
    liabilities.push({
      id: `cc-${c.id}`,
      name: c.name || "Credit card",
      amount: v,
      source: "credit_card",
      manageIn: "Bills",
    });
  }

  // ── Extra features (Reports debts/assets) — avoid double-count with EMI names ──
  const extras = (readJSON("finance_extra_features") as {
    debts?: Array<{ id?: string; name?: string; remaining?: number; amount?: number }>;
    assets?: Array<{ id?: string; name?: string; value?: number }>;
  }) || {};
  let extraDebts = 0;
  const emiNames = new Set((life.emis || []).map((e) => (e.name || "").trim().toLowerCase()));
  for (const d of extras.debts || []) {
    const name = (d.name || "Debt").trim();
    if (emiNames.has(name.toLowerCase())) continue; // already counted via EMI
    const v = num(d.remaining ?? d.amount);
    if (v <= 0) continue;
    extraDebts += v;
    liabilities.push({
      id: `xdebt-${d.id || name}`,
      name,
      amount: v,
      source: "extra_debt",
      manageIn: "Reports",
    });
  }
  for (const a of extras.assets || []) {
    const v = num(a.value);
    if (v <= 0) continue;
    assets.push({
      id: `xasset-${a.id || a.name}`,
      name: a.name || "Asset",
      amount: v,
      source: "extra_asset",
      manageIn: "Reports",
    });
  }

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);

  return {
    currency,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    assets: assets.sort((a, b) => b.amount - a.amount),
    liabilities: liabilities.sort((a, b) => b.amount - a.amount),
    buckets: {
      netWorthLedgerAssets: nwAssets,
      netWorthLedgerLiabilities: nwLiabilities,
      savings,
      investments,
      portfolio,
      emis,
      moneyToGive,
      moneyToCollect,
      unpaidBills,
      creditCards,
      extraDebts,
      emiMonthly,
    },
  };
}
