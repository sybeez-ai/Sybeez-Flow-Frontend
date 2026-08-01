// Multi-currency support: currency metadata, exchange rates and conversion.
// Rates are relative to USD (1 USD = rate units of currency). They are
// seeded with sensible defaults and refreshed from a free public API when
// available, then cached in localStorage so the app works fully offline.

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", flag: "🇨🇭" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },
  { code: "ZAR", name: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
];

// Fallback rates per 1 USD (approximate, updated periodically at runtime).
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.3,
  JPY: 156.5,
  CNY: 7.24,
  CAD: 1.37,
  AUD: 1.51,
  CHF: 0.89,
  AED: 3.67,
  SGD: 1.35,
  HKD: 7.81,
  SEK: 10.6,
  NZD: 1.64,
  ZAR: 18.4,
  BRL: 5.43,
};

import { usGetItem, usSetItem } from "@/services/userStorage";

const RATES_KEY = "stabee_fx_rates";
const BASE_KEY = "stabee_base_currency";
const EVENT = "stabee-currency-updated";

interface RatesCache {
  base: "USD";
  rates: Record<string, number>;
  updatedAt: number;
}

function loadRates(): RatesCache {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RatesCache;
      if (parsed?.rates?.USD) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { base: "USD", rates: { ...DEFAULT_RATES }, updatedAt: 0 };
}

let cache: RatesCache = loadRates();

export const currencyService = {
  getCurrency(code: string): CurrencyInfo {
    return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  },

  getBaseCurrency(): string {
    return usGetItem(BASE_KEY) || localStorage.getItem(BASE_KEY) || "EUR";
  },

  setBaseCurrency(code: string) {
    const next = (code || "").trim().toUpperCase();
    if (!next) return;
    usSetItem(BASE_KEY, next);
    // Keep legacy global key in sync for older readers
    try {
      localStorage.setItem(BASE_KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { code: next } }));
  },

  getRates(): Record<string, number> {
    return { ...cache.rates };
  },

  getUpdatedAt(): number {
    return cache.updatedAt;
  },

  /** Convert an amount from one currency to another using USD as the pivot. */
  convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const fromRate = cache.rates[from] ?? DEFAULT_RATES[from] ?? 1;
    const toRate = cache.rates[to] ?? DEFAULT_RATES[to] ?? 1;
    const usd = amount / fromRate;
    return usd * toRate;
  },

  format(amount: number, code: string): string {
    const info = currencyService.getCurrency(code);
    const fractionDigits = code === "JPY" ? 0 : 2;
    const value = amount.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return `${info.symbol}${value}`;
  },

  /** Refresh live rates from a free API; falls back silently on failure. */
  async refresh(): Promise<void> {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.result === "success" && data.rates) {
        const next: Record<string, number> = { USD: 1 };
        for (const c of CURRENCIES) {
          if (typeof data.rates[c.code] === "number") next[c.code] = data.rates[c.code];
        }
        cache = { base: "USD", rates: { ...DEFAULT_RATES, ...next }, updatedAt: Date.now() };
        localStorage.setItem(RATES_KEY, JSON.stringify(cache));
        window.dispatchEvent(new CustomEvent(EVENT));
      }
    } catch {
      /* offline — keep cached/default rates */
    }
  },

  subscribe(listener: () => void): () => void {
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  },
};
