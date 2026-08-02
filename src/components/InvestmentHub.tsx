/**
 * InvestmentHub
 * -------------
 * Worldwide stock tracker inside Finance Manager.
 *   • Holdings   — live value, today's move, total P&L vs cost
 *   • Allocation — mix by current value
 *   • Watchlist  — symbols you don't own yet
 *   • Explore    — search any market by name or ticker
 */

import { usGetItem, usSetItem } from "@/services/userStorage";
import {
  stocksApi,
  type PortfolioQuotes,
  type StockQuote,
  type StockSearchHit,
  type OHLCBar,
} from "@/services/stocksApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Trash2,
  RefreshCw,
  Search,
  Star,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  PieChart as PieIcon,
  LayoutGrid,
  Rows3,
  LineChart as LineChartIcon,
  Loader2,
  Globe2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart as RPieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#f97316",
  "#ec4899",
];

const REGIONS = [
  { id: "all", label: "Worldwide" },
  { id: "US", label: "🇺🇸 US" },
  { id: "IN", label: "🇮🇳 India" },
  { id: "EU", label: "🇪🇺 Europe" },
  { id: "UK", label: "🇬🇧 UK" },
  { id: "JP", label: "🇯🇵 Japan" },
  { id: "ETF", label: "ETFs" },
] as const;

const POPULAR = [
  { symbol: "AAPL", name: "Apple", region: "🇺🇸", market: "US" },
  { symbol: "MSFT", name: "Microsoft", region: "🇺🇸", market: "US" },
  { symbol: "GOOGL", name: "Alphabet", region: "🇺🇸", market: "US" },
  { symbol: "NVDA", name: "NVIDIA", region: "🇺🇸", market: "US" },
  { symbol: "AMZN", name: "Amazon", region: "🇺🇸", market: "US" },
  { symbol: "TSLA", name: "Tesla", region: "🇺🇸", market: "US" },
  { symbol: "RELIANCE.NS", name: "Reliance", region: "🇮🇳", market: "IN" },
  { symbol: "TCS.NS", name: "TCS", region: "🇮🇳", market: "IN" },
  { symbol: "INFY.NS", name: "Infosys", region: "🇮🇳", market: "IN" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", region: "🇮🇳", market: "IN" },
  { symbol: "SAP.DE", name: "SAP", region: "🇩🇪", market: "EU" },
  { symbol: "ASML.AS", name: "ASML", region: "🇳🇱", market: "EU" },
  { symbol: "AIR.PA", name: "Airbus", region: "🇫🇷", market: "EU" },
  { symbol: "MC.PA", name: "LVMH", region: "🇫🇷", market: "EU" },
  { symbol: "BP.L", name: "BP", region: "🇬🇧", market: "UK" },
  { symbol: "HSBA.L", name: "HSBC", region: "🇬🇧", market: "UK" },
  { symbol: "7203.T", name: "Toyota", region: "🇯🇵", market: "JP" },
  { symbol: "6758.T", name: "Sony", region: "🇯🇵", market: "JP" },
  { symbol: "VOO", name: "Vanguard S&P 500", region: "ETF", market: "ETF" },
  { symbol: "IWDA.AS", name: "iShares World", region: "ETF", market: "ETF" },
];

const WATCHLIST_KEY = "finance_watchlist";

type Quote = StockQuote;
type Portfolio = PortfolioQuotes;
type OHLC = OHLCBar;
type WatchItem = { symbol: string; name: string };
type SearchResult = StockSearchHit;

type SubTab = "holdings" | "allocation" | "watchlist" | "explore";
type SortKey = "value" | "pl_pct" | "change_pct" | "name";

const CUR: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF ",
  HKD: "HK$",
  SGD: "S$",
  KRW: "₩",
  CNY: "¥",
};
const sym = (c?: string) => CUR[c || "USD"] || `${c || ""} `;
const money = (n: number, c?: string) =>
  `${sym(c)}${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
const signed = (n: number, c?: string) => `${n >= 0 ? "+" : "-"}${money(n, c)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

// ── Sparkline ─────────────────────────────────────────────────────────
function Sparkline({ symbol, positive }: { symbol: string; positive: boolean }) {
  const [pts, setPts] = useState<OHLC[]>([]);
  useEffect(() => {
    let alive = true;
    stocksApi
      .history(symbol, "5d", "1h")
      .then((d) => alive && Array.isArray(d) && setPts(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol]);
  const color = positive ? "#22c55e" : "#ef4444";
  if (!pts.length)
    return <div className="h-9 w-full animate-pulse rounded bg-muted/40" />;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sp-${symbol.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sp-${symbol.replace(/\W/g, "")})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const InvestmentHub = () => {
  const [tab, setTab] = useState<SubTab>("holdings");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"cards" | "table">("table");
  const [sortKey, setSortKey] = useState<SortKey>("value");

  const [selected, setSelected] = useState<Quote | null>(null);
  const [chart, setChart] = useState<OHLC[]>([]);
  const [chartPeriod, setChartPeriod] = useState("1mo");
  const [chartLoad, setChartLoad] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addSym, setAddSym] = useState("");
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addHits, setAddHits] = useState<SearchResult[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [watchQuotes, setWatchQuotes] = useState<
    Record<string, SearchResult & { change_pct?: number; price?: number }>
  >({});

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchResult[]>([]);
  const [regionFilter, setRegionFilter] = useState<(typeof REGIONS)[number]["id"]>("all");

  // trade drawer inputs
  const [tradeQty, setTradeQty] = useState("");
  const addSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stocks = useMemo(() => portfolio?.stocks ?? [], [portfolio]);

  // ── data fetching ────────────────────────────────────────────────
  const fetchPortfolio = useCallback(async (): Promise<Portfolio | null> => {
    setLoading(true);
    try {
      const d = await stocksApi.quotes();
      if (d && Array.isArray(d.stocks)) {
        setPortfolio(d);
        return d;
      }
      setPortfolio({
        stocks: [],
        total_invested: 0,
        total_current: 0,
        total_pl: 0,
        total_pl_pct: 0,
        day_pl: 0,
        day_pl_pct: 0,
      });
      return null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load portfolio");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChart = useCallback(async (s: string, period = "1mo") => {
    setChartLoad(true);
    try {
      const interval = period === "1d" ? "5m" : period === "5d" ? "1h" : "1d";
      const d = await stocksApi.history(s, period, interval);
      setChart(Array.isArray(d) ? d : []);
    } catch {
      setChart([]);
    } finally {
      setChartLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    const id = setInterval(fetchPortfolio, 20000);
    return () => clearInterval(id);
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!selected) return;
    fetchChart(selected.symbol, chartPeriod);
  }, [selected, chartPeriod, fetchChart]);

  // ── watchlist ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = usGetItem(WATCHLIST_KEY) || localStorage.getItem(WATCHLIST_KEY);
      if (raw) setWatchlist(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persistWatch = useCallback((list: WatchItem[]) => {
    setWatchlist(list);
    usSetItem(WATCHLIST_KEY, JSON.stringify(list));
  }, []);

  const refreshWatchQuotes = useCallback(async (list: WatchItem[]) => {
    const entries = await Promise.all(
      list.map(async (w) => {
        try {
          const d = await stocksApi.singleQuote(w.symbol);
          return [w.symbol, { ...d, name: w.name }] as const;
        } catch {
          return [w.symbol, null] as const;
        }
      })
    );
    const map: Record<string, SearchResult & { change_pct?: number; price?: number }> = {};
    entries.forEach(([s, d]) => {
      if (d) map[s] = d;
    });
    setWatchQuotes(map);
  }, []);

  useEffect(() => {
    if (tab === "watchlist" && watchlist.length) refreshWatchQuotes(watchlist);
  }, [tab, watchlist, refreshWatchQuotes]);

  const addToWatch = (symbol: string, name: string) => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    if (watchlist.some((w) => w.symbol === s)) {
      toast.info(`${s} already in watchlist`);
      return;
    }
    persistWatch([...watchlist, { symbol: s, name: name || s }]);
    toast.success(`${s} added to watchlist`);
  };

  const removeFromWatch = (symbol: string) =>
    persistWatch(watchlist.filter((w) => w.symbol !== symbol));

  // ── search / add ─────────────────────────────────────────────────
  const runSearch = async (q: string) => {
    const s = q.trim();
    if (!s) return;
    setSearching(true);
    setSearchHits([]);
    try {
      const d = await stocksApi.search(s, 12);
      const hits = d.results?.length ? d.results : [d];
      setSearchHits(hits.filter((h) => h?.symbol));
      if (!hits.length) toast.error(`No results for “${s}”`);
    } catch {
      toast.error(`No results for “${s}” — try company name or ticker (AAPL, SAP.DE, TCS.NS)`);
    } finally {
      setSearching(false);
    }
  };

  const selectAddHit = (hit: SearchResult) => {
    setAddSym(hit.symbol);
    setAddName(hit.name || hit.symbol);
    if (hit.price) setAddPrice(String(hit.price));
    setAddHits([]);
  };

  const lookupForAdd = async (raw?: string) => {
    const s = (raw ?? addSym).trim();
    if (s.length < 1) return;
    setAddSearching(true);
    try {
      const d = await stocksApi.search(s, 10);
      const hits = (d.results?.length ? d.results : [d]).filter((h) => h?.symbol);
      setAddHits(hits);
      if (hits[0]) {
        setAddName(hits[0].name || hits[0].symbol);
        if (hits[0].price) setAddPrice(String(hits[0].price));
      }
    } catch {
      setAddHits([]);
      toast.error("No matching stocks found");
    } finally {
      setAddSearching(false);
    }
  };

  useEffect(() => {
    if (!showAdd) return;
    const s = addSym.trim();
    if (s.length < 2) {
      setAddHits([]);
      return;
    }
    if (addSearchTimer.current) clearTimeout(addSearchTimer.current);
    addSearchTimer.current = setTimeout(() => {
      void lookupForAdd(s);
    }, 350);
    return () => {
      if (addSearchTimer.current) clearTimeout(addSearchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSym, showAdd]);

  const postHolding = async (
    symbol: string,
    name: string,
    qty: number,
    avg: number
  ) => {
    await stocksApi.addHolding({ symbol, name, qty, avg_buy_price: avg });
  };

  const addStock = async (prefill?: { symbol: string; name: string; price?: number }) => {
    const symbol = (prefill?.symbol || addSym).trim().toUpperCase();
    if (!symbol) {
      toast.error("Search a company or ticker first");
      return;
    }
    setAddBusy(true);
    try {
      let name = (prefill?.name || addName).trim();
      let qty = Number(addQty || "1");
      let avg = Number(prefill?.price ?? addPrice);
      if (!Number.isFinite(qty) || qty <= 0) qty = 1;
      if (!name || !Number.isFinite(avg) || avg <= 0) {
        const d = await stocksApi.search(symbol, 5);
        const hit = d.results?.[0] || d;
        name = name || hit.name || symbol;
        avg = Number(hit.price || 0) || avg;
      }
      if (!Number.isFinite(avg) || avg <= 0)
        throw new Error("Unable to resolve a live price — enter avg buy price manually");
      await postHolding(symbol, name || symbol, qty, avg);
      toast.success(`${symbol} added to portfolio`);
      setShowAdd(false);
      setAddSym("");
      setAddName("");
      setAddQty("");
      setAddPrice("");
      setAddHits([]);
      const updated = await fetchPortfolio();
      const added = updated?.stocks.find((s) => s.symbol.toUpperCase() === symbol);
      if (added) {
        setSelected(added);
        setChartPeriod("1mo");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to add stock");
    } finally {
      setAddBusy(false);
    }
  };

  const removeStock = async (symbol: string) => {
    try {
      await stocksApi.removeHolding(symbol);
      toast.success(`${symbol} removed`);
      if (selected?.symbol === symbol) setSelected(null);
      fetchPortfolio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  // Buy more / reduce from the detail drawer
  const trade = async (side: "buy" | "sell") => {
    if (!selected) return;
    const q = Number(tradeQty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      if (side === "buy") {
        const newQty = selected.qty + q;
        const newAvg =
          (selected.qty * selected.avg_buy_price + q * selected.price) / newQty;
        await postHolding(selected.symbol, selected.name, newQty, newAvg);
        toast.success(`Bought ${q} ${selected.symbol}`);
      } else {
        const newQty = selected.qty - q;
        if (newQty <= 0) {
          await removeStock(selected.symbol);
          setTradeQty("");
          return;
        }
        await postHolding(
          selected.symbol,
          selected.name,
          newQty,
          selected.avg_buy_price
        );
        toast.success(`Sold ${q} ${selected.symbol}`);
      }
      setTradeQty("");
      const updated = await fetchPortfolio();
      const refreshed = updated?.stocks.find((s) => s.symbol === selected.symbol);
      if (refreshed) setSelected(refreshed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trade failed");
    }
  };

  // ── derived ──────────────────────────────────────────────────────
  const sortedStocks = useMemo(() => {
    const arr = [...stocks];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.symbol.localeCompare(b.symbol);
        case "pl_pct":
          return b.pl_pct - a.pl_pct;
        case "change_pct":
          return b.change_pct - a.change_pct;
        default:
          return b.current_value - a.current_value;
      }
    });
    return arr;
  }, [stocks, sortKey]);

  const dayChange = portfolio?.day_pl ?? 0;
  const dayChangePct = portfolio?.day_pl_pct ?? 0;

  const todayBest = useMemo(
    () =>
      stocks.length
        ? stocks.reduce((a, b) => (b.change_pct > a.change_pct ? b : a))
        : null,
    [stocks]
  );
  const todayWorst = useMemo(
    () =>
      stocks.length
        ? stocks.reduce((a, b) => (b.change_pct < a.change_pct ? b : a))
        : null,
    [stocks]
  );
  // Keep best/worst aliases for existing mover pills (all-time P&L)
  const best = useMemo(
    () =>
      stocks.length
        ? stocks.reduce((a, b) => (b.pl_pct > a.pl_pct ? b : a))
        : null,
    [stocks]
  );
  const worst = useMemo(
    () =>
      stocks.length
        ? stocks.reduce((a, b) => (b.pl_pct < a.pl_pct ? b : a))
        : null,
    [stocks]
  );

  const cur = portfolio?.currency || stocks[0]?.currency || "USD";
  const plUp = (portfolio?.total_pl ?? 0) >= 0;
  const dayUp = dayChange >= 0;
  const popularFiltered = useMemo(
    () =>
      regionFilter === "all"
        ? POPULAR
        : POPULAR.filter((p) => p.market === regionFilter),
    [regionFilter]
  );

  // ── render helpers ───────────────────────────────────────────────
  const SummaryHero = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 border-border bg-gradient-to-br from-primary/10 to-transparent lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Now worth
            </div>
            <p className="mt-1 text-2xl font-bold">
              {money(portfolio?.total_current ?? 0, cur)}
            </p>
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs font-medium",
                dayUp ? "text-green-500" : "text-red-500"
              )}
            >
              {dayUp ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {signed(dayChange, cur)} ({pct(dayChangePct)}) today
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today’s move</p>
            <p className={cn("mt-1 text-xl font-bold", dayUp ? "text-green-500" : "text-red-500")}>
              {signed(dayChange, cur)}
            </p>
            <p className={cn("text-xs font-medium", dayUp ? "text-green-500" : "text-red-500")}>
              {pct(dayChangePct)} vs yesterday close
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">All-time P&L</p>
            <p className={cn("mt-1 text-xl font-bold", plUp ? "text-green-500" : "text-red-500")}>
              {signed(portfolio?.total_pl ?? 0, cur)}
            </p>
            <p className={cn("text-xs font-medium", plUp ? "text-green-500" : "text-red-500")}>
              {pct(portfolio?.total_pl_pct ?? 0)} vs what you paid
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today’s top mover</p>
            {todayBest ? (
              <>
                <p className="mt-1 truncate text-sm font-bold">{todayBest.symbol}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    todayBest.change_pct >= 0 ? "text-green-500" : "text-red-500"
                  )}
                >
                  {pct(todayBest.change_pct)} · {money(todayBest.price, todayBest.currency)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Add stocks to track</p>
            )}
          </CardContent>
        </Card>
      </div>
      {portfolio?.mixed_currency && portfolio.by_currency && (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Multi-currency portfolio. </span>
          Totals above use {cur}. Other currencies:{" "}
          {Object.entries(portfolio.by_currency)
            .filter(([c]) => c !== cur)
            .map(
              ([c, b]) =>
                `${c} ${money(b.current, c)} today ${signed(b.day_pl, c)} (${pct(b.day_pl_pct)})`
            )
            .join(" · ")}
        </div>
      )}
      {stocks.length > 0 && todayBest && todayWorst && todayBest.symbol !== todayWorst.symbol && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border">
            <CardContent className="flex items-center gap-2 p-3">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Best today
                </p>
                <p className="truncate text-sm font-semibold">
                  {todayBest.symbol}{" "}
                  <span className="text-green-500">{pct(todayBest.change_pct)}</span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="flex items-center gap-2 p-3">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Weakest today
                </p>
                <p className="truncate text-sm font-semibold">
                  {todayWorst.symbol}{" "}
                  <span className="text-red-500">{pct(todayWorst.change_pct)}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  const subTabs: { id: SubTab; label: string; icon: typeof Wallet }[] = [
    { id: "holdings", label: "Holdings", icon: Wallet },
    { id: "allocation", label: "Allocation", icon: PieIcon },
    { id: "watchlist", label: "Watchlist", icon: Eye },
    { id: "explore", label: "Explore", icon: Search },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <SummaryHero />

          {/* Sub-tabs + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {subTabs.map((t) => {
                const Icon = t.icon;
                return (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={tab === t.id ? "default" : "ghost"}
                    className="flex-shrink-0"
                    onClick={() => setTab(t.id)}
                  >
                    <Icon className="mr-1 h-4 w-4" />
                    {t.label}
                    {t.id === "watchlist" && watchlist.length > 0 && (
                      <span className="ml-1 rounded-full bg-foreground/15 px-1.5 text-[10px]">
                        {watchlist.length}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={fetchPortfolio} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </div>

          {/* ── HOLDINGS ─────────────────────────────────────────── */}
          {tab === "holdings" && (
            <>
              {stocks.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Sort</span>
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="h-8 rounded-md border border-border bg-transparent px-2 text-foreground outline-none"
                    >
                      <option value="value">Value</option>
                      <option value="pl_pct">P&L %</option>
                      <option value="change_pct">Day %</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    <button
                      onClick={() => setView("table")}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center",
                        view === "table" ? "bg-muted text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <Rows3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setView("cards")}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center",
                        view === "cards" ? "bg-muted text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {stocks.length === 0 ? (
                <EmptyHoldings onAdd={() => setShowAdd(true)} loading={loading} />
              ) : best && worst && best.symbol !== worst.symbol ? (
                <div className="grid grid-cols-2 gap-3">
                  <MoverPill label="Best performer" q={best} />
                  <MoverPill label="Needs attention" q={worst} />
                </div>
              ) : null}

              {stocks.length > 0 &&
                (view === "table" ? (
                  <Card className="border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Symbol</th>
                            <th className="px-3 py-2 text-right font-medium">Price</th>
                            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                              Day
                            </th>
                            <th className="px-3 py-2 text-right font-medium">Value</th>
                            <th className="px-3 py-2 text-right font-medium">P&L</th>
                            <th className="hidden w-24 px-3 py-2 md:table-cell" />
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedStocks.map((s) => (
                            <tr
                              key={s.symbol}
                              onClick={() => {
                                setSelected(s);
                                setChartPeriod("1mo");
                              }}
                              className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/50"
                            >
                              <td className="px-3 py-2.5">
                                <p className="font-semibold">{s.symbol}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {s.qty} @ {money(s.avg_buy_price, s.currency)}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {money(s.price, s.currency)}
                              </td>
                              <td
                                className={cn(
                                  "hidden px-3 py-2.5 text-right text-xs font-medium sm:table-cell",
                                  s.change_pct >= 0 ? "text-green-500" : "text-red-500"
                                )}
                              >
                                {pct(s.change_pct)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {money(s.current_value, s.currency)}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2.5 text-right",
                                  s.pl >= 0 ? "text-green-500" : "text-red-500"
                                )}
                              >
                                <p className="font-medium">{signed(s.pl, s.currency)}</p>
                                <p className="text-xs">{pct(s.pl_pct)}</p>
                              </td>
                              <td className="hidden px-3 py-2.5 md:table-cell">
                                <Sparkline symbol={s.symbol} positive={s.change_pct >= 0} />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeStock(s.symbol);
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {sortedStocks.map((s) => (
                      <Card
                        key={s.symbol}
                        onClick={() => {
                          setSelected(s);
                          setChartPeriod("1mo");
                        }}
                        className="cursor-pointer border-border transition-shadow hover:shadow-md"
                      >
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold">{s.symbol}</span>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                                    s.change_pct >= 0
                                      ? "bg-green-500/15 text-green-600"
                                      : "bg-red-500/15 text-red-600"
                                  )}
                                >
                                  {pct(s.change_pct)}
                                </span>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">{money(s.price, s.currency)}</p>
                              <p
                                className={cn(
                                  "text-xs font-semibold",
                                  s.pl >= 0 ? "text-green-500" : "text-red-500"
                                )}
                              >
                                {signed(s.pl, s.currency)}
                              </p>
                            </div>
                          </div>
                          <Sparkline symbol={s.symbol} positive={s.change_pct >= 0} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
            </>
          )}

          {/* ── ALLOCATION ───────────────────────────────────────── */}
          {tab === "allocation" &&
            (stocks.length === 0 ? (
              <EmptyHoldings onAdd={() => setShowAdd(true)} loading={loading} />
            ) : (
              <Card className="border-border">
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-sm">Portfolio Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <RPieChart>
                      <Pie
                        data={stocks.map((s, i) => ({
                          name: s.symbol,
                          value: s.current_value,
                          fill: COLORS[i % COLORS.length],
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                      >
                        {stocks.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(v: number) => [money(v, cur), "Value"]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RPieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-2">
                    {sortedStocks.map((s, i) => {
                      const share = portfolio?.total_current
                        ? (s.current_value / portfolio.total_current) * 100
                        : 0;
                      return (
                        <div key={s.symbol} className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 flex-none rounded-full"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="w-20 flex-none font-medium">{s.symbol}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${share}%`,
                                backgroundColor: COLORS[i % COLORS.length],
                              }}
                            />
                          </div>
                          <span className="w-12 flex-none text-right text-xs text-muted-foreground">
                            {share.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}

          {/* ── WATCHLIST ────────────────────────────────────────── */}
          {tab === "watchlist" && (
            <div className="space-y-3">
              {watchlist.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Star className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm">Your watchlist is empty.</p>
                  <p className="text-xs">Add symbols from the Explore tab to track them here.</p>
                  <Button size="sm" className="mt-3" onClick={() => setTab("explore")}>
                    <Search className="mr-1 h-4 w-4" /> Explore stocks
                  </Button>
                </div>
              ) : (
                watchlist.map((w) => {
                  const q = watchQuotes[w.symbol];
                  return (
                    <Card key={w.symbol} className="border-border">
                      <CardContent className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{w.symbol}</p>
                          <p className="truncate text-xs text-muted-foreground">{w.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {q?.price != null ? (
                            <div className="text-right">
                              <p className="font-medium">{money(q.price, q.currency)}</p>
                              {typeof q.change_pct === "number" && (
                                <p
                                  className={cn(
                                    "text-xs font-medium",
                                    q.change_pct >= 0 ? "text-green-500" : "text-red-500"
                                  )}
                                >
                                  {pct(q.change_pct)} today
                                </p>
                              )}
                            </div>
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddSym(w.symbol);
                              setAddName(w.name);
                              if (q?.price) setAddPrice(String(q.price));
                              setShowAdd(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <button
                            onClick={() => removeFromWatch(w.symbol)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* ── EXPLORE ──────────────────────────────────────────── */}
          {tab === "explore" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Globe2 className="h-3.5 w-3.5" /> Worldwide markets
                </span>
                <p className="mt-1">
                  Search by company name or ticker — US, India, Europe, UK, Japan, ETFs, and more.
                </p>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
                    placeholder="Search Apple, Reliance, SAP, Toyota…"
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => runSearch(query)} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {searchHits.length > 0 && (
                <div className="space-y-2">
                  {searchHits.map((hit) => (
                    <Card key={`${hit.symbol}-${hit.exchange || ""}`} className="border-border">
                      <CardContent className="flex items-center justify-between gap-3 p-3.5">
                        <div className="min-w-0">
                          <p className="font-bold">{hit.symbol}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {hit.name}
                            {hit.exchange ? ` · ${hit.exchange}` : ""}
                            {hit.type ? ` · ${hit.type}` : ""}
                          </p>
                          {hit.price != null && hit.price > 0 && (
                            <p className="mt-1 text-sm font-semibold">
                              {money(hit.price, hit.currency)}
                              {typeof hit.change_pct === "number" && (
                                <span
                                  className={cn(
                                    "ml-2 text-xs",
                                    hit.change_pct >= 0 ? "text-green-500" : "text-red-500"
                                  )}
                                >
                                  {pct(hit.change_pct)}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-none gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addToWatch(hit.symbol, hit.name)}
                          >
                            <Star className="mr-1 h-4 w-4" /> Watch
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              addStock({
                                symbol: hit.symbol,
                                name: hit.name,
                                price: hit.price,
                              })
                            }
                          >
                            <Plus className="mr-1 h-4 w-4" /> Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRegionFilter(r.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        regionFilter === r.id
                          ? "border-foreground/30 bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Popular picks
                </p>
                <div className="flex flex-wrap gap-2">
                  {popularFiltered.map((p) => (
                    <button
                      key={p.symbol}
                      onClick={() => {
                        setQuery(p.symbol);
                        runSearch(p.symbol);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                    >
                      {p.region} {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Add Stock modal ────────────────────────────────────── */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Add a stock</h3>
                <p className="text-[11px] text-muted-foreground">
                  Search any worldwide company or ticker
                </p>
              </div>
              <button onClick={() => setShowAdd(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {POPULAR.slice(0, 8).map((p) => (
                <button
                  key={p.symbol}
                  className="rounded-full bg-muted px-2 py-1 text-[10px] transition-colors hover:bg-accent"
                  onClick={() => selectAddHit({ symbol: p.symbol, name: p.name })}
                >
                  {p.region} {p.name}
                </button>
              ))}
            </div>
            <div className="relative">
              <div className="flex gap-2">
                <Input
                  placeholder="Type Apple, Reliance, SAP.DE…"
                  value={addSym}
                  onChange={(e) => setAddSym(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => lookupForAdd()}
                  disabled={addBusy || addSearching}
                >
                  {addSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {addHits.length > 0 && (
                <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
                  {addHits.map((hit) => (
                    <button
                      key={`${hit.symbol}-${hit.exchange || ""}`}
                      type="button"
                      className="flex w-full items-start justify-between gap-2 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-muted/60"
                      onClick={() => selectAddHit(hit)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{hit.symbol}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {hit.name}
                          {hit.exchange ? ` · ${hit.exchange}` : ""}
                        </p>
                      </div>
                      {hit.price != null && hit.price > 0 && (
                        <span className="flex-none text-xs text-muted-foreground">
                          {money(hit.price, hit.currency)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              placeholder="Company name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Shares (qty)"
                type="number"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Avg buy price"
                type="number"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tip: leave price blank to use today’s live market price.
            </p>
            <Button className="w-full" onClick={() => addStock()} disabled={addBusy}>
              {addBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Add to Portfolio
            </Button>
          </div>
        </div>
      )}

      {/* ── Detail drawer ──────────────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-bold">{selected.symbol}</h3>
                <p className="text-xs text-muted-foreground">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Price", v: money(selected.price, selected.currency) },
                  {
                    l: "Day",
                    v: pct(selected.change_pct),
                    c: selected.change_pct >= 0 ? "text-green-500" : "text-red-500",
                  },
                  {
                    l: "P&L",
                    v: signed(selected.pl, selected.currency),
                    c: selected.pl >= 0 ? "text-green-500" : "text-red-500",
                  },
                  { l: "Invested", v: money(selected.invested, selected.currency) },
                  { l: "Value", v: money(selected.current_value, selected.currency) },
                  {
                    l: "P&L %",
                    v: pct(selected.pl_pct),
                    c: selected.pl_pct >= 0 ? "text-green-500" : "text-red-500",
                  },
                  {
                    l: "Today",
                    v: `${signed((selected.day_pl ?? (selected.price - selected.prev_close) * selected.qty), selected.currency)} (${pct(selected.change_pct)})`,
                    c: selected.change_pct >= 0 ? "text-green-500" : "text-red-500",
                  },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                    <p className={cn("text-sm font-bold", s.c)}>{s.v}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-1">
                {["1d", "5d", "1mo", "3mo", "6mo", "1y"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={cn(
                      "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                      chartPeriod === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {chartLoad ? (
                <div className="flex h-44 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading…
                </div>
              ) : chart.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={176}>
                    <AreaChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="detGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor={selected.change_pct >= 0 ? "#22c55e" : "#ef4444"}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={selected.change_pct >= 0 ? "#22c55e" : "#ef4444"}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} width={50} />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(v: number) => [money(v, selected.currency), "Close"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={selected.change_pct >= 0 ? "#22c55e" : "#ef4444"}
                        strokeWidth={2}
                        fill="url(#detGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={70}>
                    <BarChart data={chart} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Bar dataKey="volume" fill="#6366f1" opacity={0.6} radius={[2, 2, 0, 0]} />
                      <Tooltip
                        contentStyle={{ fontSize: 10 }}
                        formatter={(v: number) => [v.toLocaleString(), "Volume"]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No chart data available.
                </p>
              )}

              {/* Buy / reduce */}
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Manage position ({selected.qty} shares @ {money(selected.avg_buy_price, selected.currency)})
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Quantity"
                    value={tradeQty}
                    onChange={(e) => setTradeQty(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={() => trade("buy")} className="bg-green-600 hover:bg-green-700">
                    <TrendingUp className="mr-1 h-4 w-4" /> Buy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => trade("sell")}
                    className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                  >
                    <TrendingDown className="mr-1 h-4 w-4" /> Reduce
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── small sub-components ─────────────────────────────────────────────
const MoverPill = ({ label, q }: { label: string; q: Quote }) => (
  <Card className="border-border">
    <CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-semibold">{q.symbol}</span>
        <span
          className={cn(
            "flex items-center gap-1 text-sm font-bold",
            q.pl_pct >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {q.pl_pct >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          {pct(q.pl_pct)}
        </span>
      </div>
    </CardContent>
  </Card>
);

const EmptyHoldings = ({
  onAdd,
  loading,
}: {
  onAdd: () => void;
  loading: boolean;
}) => (
  <div className="py-16 text-center text-muted-foreground">
    {loading ? (
      <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin opacity-40" />
    ) : (
      <TrendingUp className="mx-auto mb-3 h-10 w-10 opacity-30" />
    )}
    <p className="text-sm">No holdings yet</p>
    <p className="mx-auto mt-1 max-w-xs text-xs">
      Add stocks from anywhere — US, India, Europe, UK, Japan, ETFs — then check today’s price and performance every day.
    </p>
    <Button size="sm" className="mt-4" onClick={onAdd}>
      <Plus className="mr-1 h-4 w-4" /> Add your first stock
    </Button>
  </div>
);

export default InvestmentHub;
