// Multi-currency Net Worth tracking: assets + liabilities ledgers with
// aggregations (allocation, currency exposure, geography) computed in a
// chosen display currency. Persisted in localStorage.

import { currencyService } from "@/services/currencyService";
import { usGetItem, usSetItem } from "@/services/userStorage";

export type AssetCategory =
  | "Bank Accounts"
  | "Stocks"
  | "Crypto"
  | "Gold"
  | "Property"
  | "Retirement"
  | "Other";

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  type: string; // free label e.g. Cash, Equity, Metal
  location: string; // country / region
  currency: string;
  amount: number; // in native currency
  liquid: boolean;
}

export interface Liability {
  id: string;
  name: string;
  note?: string;
  location: string;
  currency: string;
  amount: number; // in native currency
}

export interface NetWorthData {
  displayCurrency: string;
  assets: Asset[];
  liabilities: Liability[];
}

export const ASSET_CATEGORIES: AssetCategory[] = [
  "Bank Accounts",
  "Stocks",
  "Crypto",
  "Gold",
  "Property",
  "Retirement",
  "Other",
];

// Category colors for charts (premium muted palette).
export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  "Bank Accounts": "#3b82f6",
  Stocks: "#10b981",
  Crypto: "#f59e0b",
  Gold: "#eab308",
  Property: "#8b5cf6",
  Retirement: "#06b6d4",
  Other: "#64748b",
};

const STORAGE_KEY = "stabee_networth";
const EVENT = "stabee-networth-updated";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(): NetWorthData {
  // Empty by default — user data only (no demo seed)
  return {
    displayCurrency: currencyService.getBaseCurrency() || "EUR",
    assets: [],
    liabilities: [],
  };
}

function read(): NetWorthData {
  try {
    const raw = usGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as NetWorthData;
      if (parsed && Array.isArray(parsed.assets) && Array.isArray(parsed.liabilities)) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  const seeded = seed();
  write(seeded);
  return seeded;
}

function write(data: NetWorthData) {
  try {
    usSetItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export interface Breakdown {
  key: string;
  value: number; // in display currency
  pct: number;
  color?: string;
}

export interface NetWorthSummary {
  displayCurrency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidNetWorth: number;
  byCategory: Breakdown[];
  byCurrency: Breakdown[];
  byLocation: Breakdown[];
}

export const netWorthService = {
  getData(): NetWorthData {
    return read();
  },

  getDisplayCurrency(): string {
    return read().displayCurrency;
  },

  setDisplayCurrency(code: string) {
    const data = read();
    data.displayCurrency = code;
    write(data);
  },

  addAsset(asset: Omit<Asset, "id">) {
    const data = read();
    data.assets.push({ ...asset, id: uid() });
    write(data);
  },

  updateAsset(id: string, patch: Partial<Asset>) {
    const data = read();
    data.assets = data.assets.map((a) => (a.id === id ? { ...a, ...patch } : a));
    write(data);
  },

  removeAsset(id: string) {
    const data = read();
    data.assets = data.assets.filter((a) => a.id !== id);
    write(data);
  },

  addLiability(liability: Omit<Liability, "id">) {
    const data = read();
    data.liabilities.push({ ...liability, id: uid() });
    write(data);
  },

  updateLiability(id: string, patch: Partial<Liability>) {
    const data = read();
    data.liabilities = data.liabilities.map((l) => (l.id === id ? { ...l, ...patch } : l));
    write(data);
  },

  removeLiability(id: string) {
    const data = read();
    data.liabilities = data.liabilities.filter((l) => l.id !== id);
    write(data);
  },

  /** Convert a native amount into the current display currency. */
  toDisplay(amount: number, fromCurrency: string): number {
    const display = read().displayCurrency;
    return currencyService.convert(amount, fromCurrency, display);
  },

  computeSummary(): NetWorthSummary {
    const data = read();
    const display = data.displayCurrency;
    const conv = (amt: number, from: string) => currencyService.convert(amt, from, display);

    let totalAssets = 0;
    let liquid = 0;
    const cat: Record<string, number> = {};
    const cur: Record<string, number> = {};
    const loc: Record<string, number> = {};

    for (const a of data.assets) {
      const v = conv(a.amount, a.currency);
      totalAssets += v;
      if (a.liquid) liquid += v;
      cat[a.category] = (cat[a.category] || 0) + v;
      cur[a.currency] = (cur[a.currency] || 0) + v;
      loc[a.location || "Unknown"] = (loc[a.location || "Unknown"] || 0) + v;
    }

    let totalLiabilities = 0;
    for (const l of data.liabilities) {
      totalLiabilities += conv(l.amount, l.currency);
    }

    const netWorth = totalAssets - totalLiabilities;
    const liquidNetWorth = liquid - totalLiabilities;

    const toBreakdown = (
      map: Record<string, number>,
      colorFn?: (k: string) => string | undefined
    ): Breakdown[] =>
      Object.entries(map)
        .map(([key, value]) => ({
          key,
          value,
          pct: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
          color: colorFn?.(key),
        }))
        .sort((a, b) => b.value - a.value);

    return {
      displayCurrency: display,
      totalAssets,
      totalLiabilities,
      netWorth,
      liquidNetWorth,
      byCategory: toBreakdown(cat, (k) => CATEGORY_COLORS[k as AssetCategory]),
      byCurrency: toBreakdown(cur),
      byLocation: toBreakdown(loc),
    };
  },

  subscribe(listener: () => void): () => void {
    window.addEventListener(EVENT, listener);
    const fwd = () => listener();
    currencyService.subscribe(fwd);
    return () => {
      window.removeEventListener(EVENT, listener);
    };
  },
};
