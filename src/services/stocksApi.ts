/**
 * Authenticated client for /api/stocks (portfolio, quotes, search, history).
 */
import { authHeaders } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const BASE = `${getApiBase()}/api/stocks`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.message || text;
    } catch {
      /* keep text */
    }
    throw new Error(detail || `Request failed (${r.status})`);
  }
  return r.json() as Promise<T>;
}

export type StockSearchHit = {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
  region?: string;
  price?: number;
  currency?: string;
  change_pct?: number;
};

export type StockSearchResponse = StockSearchHit & {
  results?: StockSearchHit[];
  count?: number;
};

export type StockQuote = {
  symbol: string;
  name: string;
  qty: number;
  avg_buy_price: number;
  price: number;
  prev_close: number;
  change_pct: number;
  change?: number;
  currency: string;
  invested: number;
  current_value: number;
  pl: number;
  pl_pct: number;
  day_pl?: number;
};

export type CurrencyBucket = {
  invested: number;
  current: number;
  pl: number;
  pl_pct: number;
  day_pl: number;
  day_pl_pct: number;
  holdings: number;
};

export type PortfolioQuotes = {
  stocks: StockQuote[];
  currency?: string;
  total_invested: number;
  total_current: number;
  total_pl: number;
  total_pl_pct: number;
  day_pl?: number;
  day_pl_pct?: number;
  mixed_currency?: boolean;
  currencies?: string[];
  by_currency?: Record<string, CurrencyBucket>;
  updated_at?: string;
};

export type OHLCBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const stocksApi = {
  quotes: () => request<PortfolioQuotes>("/quotes"),
  singleQuote: (symbol: string) =>
    request<StockSearchHit>(`/quotes/single?symbol=${encodeURIComponent(symbol)}`),
  search: (q: string, limit = 12) =>
    request<StockSearchResponse>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  history: (symbol: string, period = "1mo", interval = "1d") =>
    request<OHLCBar[]>(
      `/history/${encodeURIComponent(symbol)}?period=${period}&interval=${interval}`,
    ),
  addHolding: (body: {
    symbol: string;
    name: string;
    qty: number;
    avg_buy_price: number;
  }) =>
    request<{ status: string; symbol: string }>("/portfolio/add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  removeHolding: (symbol: string) =>
    request<{ status: string }>(`/portfolio/${encodeURIComponent(symbol)}`, {
      method: "DELETE",
    }),
};
