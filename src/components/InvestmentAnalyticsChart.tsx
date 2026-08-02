/**
 * Inline charts for Finance Assistant investment explanations.
 */
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type InvestmentAnalyticsPayload = {
  type?: string;
  ok?: boolean;
  empty?: boolean;
  portfolio_series?: Array<{ date: string; value: number }>;
  holdings?: Array<{
    symbol: string;
    name?: string;
    currency?: string;
    series?: Array<{ date: string; close: number }>;
    return_1w?: number | null;
    return_1m?: number | null;
    return_1y?: number | null;
    return_3m?: number | null;
    day_change_pct?: number;
    all_time_pl_pct?: number;
  }>;
  summary?: {
    currency?: string;
    current_value?: number;
    invested?: number;
    all_time_pl?: number;
    all_time_pl_pct?: number;
    day_pl?: number;
    day_pl_pct?: number;
    past_return_1m_pct?: number | null;
    past_return_3m_pct?: number | null;
  };
  projections?: {
    disclaimer?: string;
    conservative?: Array<{ date: string; value: number }>;
    base?: Array<{ date: string; value: number }>;
    optimistic?: Array<{ date: string; value: number }>;
  };
};

const money = (n?: number, c = "USD") => {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c.length === 3 ? c : "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${c} ${n.toFixed(0)}`;
  }
};

const pct = (n?: number | null) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export default function InvestmentAnalyticsChart({
  data,
}: {
  data: InvestmentAnalyticsPayload;
}) {
  if (!data || data.empty) return null;

  const summary = data.summary || {};
  const ccy = summary.currency || "USD";
  const series = data.portfolio_series || [];
  const projections = data.projections || {};

  const projRows: Array<{
    date: string;
    conservative?: number;
    base?: number;
    optimistic?: number;
  }> = [];
  const cons = projections.conservative || [];
  const base = projections.base || [];
  const opt = projections.optimistic || [];
  const len = Math.max(cons.length, base.length, opt.length);
  for (let i = 0; i < len; i++) {
    projRows.push({
      date: base[i]?.date || cons[i]?.date || opt[i]?.date || `${i}`,
      conservative: cons[i]?.value,
      base: base[i]?.value,
      optimistic: opt[i]?.value,
    });
  }

  const dayUp = (summary.day_pl_pct ?? 0) >= 0;
  const allUp = (summary.all_time_pl_pct ?? 0) >= 0;

  return (
    <div className="mt-3 w-full max-w-full space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "Now worth", v: money(summary.current_value, ccy) },
          {
            l: "Today",
            v: `${money(summary.day_pl, ccy)} (${pct(summary.day_pl_pct)})`,
            c: dayUp ? "text-green-500" : "text-red-500",
          },
          {
            l: "All-time",
            v: `${money(summary.all_time_pl, ccy)} (${pct(summary.all_time_pl_pct)})`,
            c: allUp ? "text-green-500" : "text-red-500",
          },
          {
            l: "~3 months",
            v: pct(summary.past_return_3m_pct),
            c:
              (summary.past_return_3m_pct ?? 0) >= 0
                ? "text-green-500"
                : "text-red-500",
          },
        ].map((x) => (
          <div key={x.l} className="rounded-xl border border-border/60 bg-background/80 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">{x.l}</p>
            <p className={cn("text-xs font-semibold leading-snug", x.c)}>{x.v}</p>
          </div>
        ))}
      </div>

      {series.length > 1 && (
        <Card className="border-border/70 bg-background/70">
          <CardContent className="p-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              Past performance (portfolio value)
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={series} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9 }}
                  tickFormatter={(d) => String(d).slice(5)}
                />
                <YAxis tick={{ fontSize: 9 }} width={48} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number) => [money(v, ccy), "Value"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#pfFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {projRows.length > 1 && (
        <Card className="border-border/70 bg-background/70">
          <CardContent className="p-3">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              Forward outlook (educational scenarios)
            </p>
            <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
              {projections.disclaimer ||
                "Not financial advice — markets can move either way."}
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={projRows} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} width={48} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number) => [money(v, ccy), ""]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="conservative"
                  name="Cautious"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="base"
                  name="Base"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="optimistic"
                  name="Optimistic"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {!!data.holdings?.length && (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Stock</th>
                <th className="px-2 py-1.5 font-medium">Today</th>
                <th className="px-2 py-1.5 font-medium">1m</th>
                <th className="px-2 py-1.5 font-medium">3m</th>
                <th className="px-2 py-1.5 font-medium">All-time</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.symbol} className="border-t border-border/40">
                  <td className="px-2 py-1.5 font-semibold">{h.symbol}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5",
                      (h.day_change_pct ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {pct(h.day_change_pct)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5",
                      (h.return_1m ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {pct(h.return_1m)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5",
                      (h.return_3m ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {pct(h.return_3m)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5",
                      (h.all_time_pl_pct ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {pct(h.all_time_pl_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
