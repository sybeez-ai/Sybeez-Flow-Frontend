/**
 * NetWorthTracker — multi-currency wealth dashboard.
 * Tabs: Overview (net worth across currencies, allocation, exposure, geography),
 * Assets ledger, and Liabilities ledger. All values convert into a chosen
 * display currency via currencyService.
 */

import { usGetItem, usSetItem } from "@/services/userStorage";
import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  LayoutGrid,
  Landmark,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Globe,
  Coins,
  History,
  TrendingUp,
  LineChart as LineChartIcon,
} from "lucide-react";
import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  netWorthService,
  ASSET_CATEGORIES,
  CATEGORY_COLORS,
  type Asset,
  type AssetCategory,
  type Liability,
  type NetWorthSummary,
} from "@/services/netWorthService";
import { CURRENCIES, currencyService } from "@/services/currencyService";
import { setAppCurrency } from "@/services/regionService";

type NWTab = "overview" | "assets" | "liabilities" | "history" | "projector";

const fmt = (amount: number, code: string) => currencyService.format(amount, code);

const emptyAsset = (display: string): Omit<Asset, "id"> => ({
  name: "",
  category: "Bank Accounts",
  type: "Cash",
  location: "",
  currency: display,
  amount: 0,
  liquid: true,
});

const emptyLiability = (display: string): Omit<Liability, "id"> => ({
  name: "",
  note: "",
  location: "",
  currency: display,
  amount: 0,
});

const NetWorthTracker = () => {
  const [tab, setTab] = useState<NWTab>("overview");
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    const unsub = netWorthService.subscribe(refresh);
    currencyService.refresh();
    return unsub;
  }, []);

  const data = netWorthService.getData();
  const display = data.displayCurrency;
  const summary: NetWorthSummary = useMemo(
    () => netWorthService.computeSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, data.assets.length, data.liabilities.length, display]
  );

  // --- Asset dialog state ---
  const [assetDialog, setAssetDialog] = useState(false);
  const [assetDraft, setAssetDraft] = useState<Omit<Asset, "id">>(emptyAsset(display));
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  const openAddAsset = () => {
    setAssetDraft(emptyAsset(display));
    setEditingAssetId(null);
    setAssetDialog(true);
  };
  const openEditAsset = (a: Asset) => {
    const { id, ...rest } = a;
    setAssetDraft(rest);
    setEditingAssetId(id);
    setAssetDialog(true);
  };
  const saveAsset = () => {
    if (!assetDraft.name.trim()) return toast.error("Asset name is required");
    if (editingAssetId) {
      netWorthService.updateAsset(editingAssetId, assetDraft);
      toast.success("Asset updated");
    } else {
      netWorthService.addAsset(assetDraft);
      toast.success("Asset added");
    }
    setAssetDialog(false);
  };

  // --- Liability dialog state ---
  const [liabDialog, setLiabDialog] = useState(false);
  const [liabDraft, setLiabDraft] = useState<Omit<Liability, "id">>(emptyLiability(display));
  const [editingLiabId, setEditingLiabId] = useState<string | null>(null);

  const openAddLiability = () => {
    setLiabDraft(emptyLiability(display));
    setEditingLiabId(null);
    setLiabDialog(true);
  };
  const openEditLiability = (l: Liability) => {
    const { id, ...rest } = l;
    setLiabDraft(rest);
    setEditingLiabId(id);
    setLiabDialog(true);
  };
  const saveLiability = () => {
    if (!liabDraft.name.trim()) return toast.error("Liability name is required");
    if (editingLiabId) {
      netWorthService.updateLiability(editingLiabId, liabDraft);
      toast.success("Liability updated");
    } else {
      netWorthService.addLiability(liabDraft);
      toast.success("Liability added");
    }
    setLiabDialog(false);
  };

  // Net worth shown across the display currency + two reference currencies.
  const refCurrencies = useMemo(() => {
    const prefs = [display, "USD", "EUR", "INR", "GBP"];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of prefs) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
      if (out.length === 3) break;
    }
    return out;
  }, [display]);

  // --- History state (snapshots) ---
  const [snapshots, setSnapshots] = useState<Array<{
    date: string;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
  }>>(
    JSON.parse(usGetItem("nw_snapshots") || "[]")
  );

  const takeSnapshot = () => {
    const now = new Date().toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const newSnapshot = {
      date: now,
      totalAssets: summary.totalAssets,
      totalLiabilities: summary.totalLiabilities,
      netWorth: summary.netWorth,
    };
    const updated = [...snapshots, newSnapshot];
    setSnapshots(updated);
    usSetItem("nw_snapshots", JSON.stringify(updated));
    toast.success("Snapshot taken");
  };

  // --- Projector state ---
  const [projectionInputs, setProjectionInputs] = useState({
    monthlyEurSalary: 5040,
    monthlyInrSalary: 0,
    monthlyEurExpenses: 4300,
    stockGrowthPercent: 10,
    projectionMonths: 24,
  });

  const [vestingEvents, setVestingEvents] = useState<Array<{
    month: string;
    amountUsd: number;
    label: string;
  }>>(
    JSON.parse(usGetItem("nw_vesting_events") || "[]")
  );

  const [vestingInput, setVestingInput] = useState({ month: "", amountUsd: 0, label: "" });

  const addVestingEvent = () => {
    if (!vestingInput.month || vestingInput.amountUsd <= 0) {
      return toast.error("Please fill in all vesting event fields");
    }
    const updated = [...vestingEvents, vestingInput];
    setVestingEvents(updated);
    usSetItem("nw_vesting_events", JSON.stringify(updated));
    setVestingInput({ month: "", amountUsd: 0, label: "" });
    toast.success("Vesting event added");
  };

  const removeVestingEvent = (month: string) => {
    const updated = vestingEvents.filter(v => v.month !== month);
    setVestingEvents(updated);
    usSetItem("nw_vesting_events", JSON.stringify(updated));
    toast.success("Vesting event removed");
  };

  // --- Projection calculations ---
  const calculateProjections = () => {
    const projections = [];
    let currentNW = summary.netWorth; // Use netWorth which is already in display currency
    const rates = currencyService.getRates();
    const eurToDisplayRate = rates[display] / (rates["EUR"] || 1);
    const inrToDisplayRate = rates[display] / (rates["INR"] || 1);
    
    const monthlyEurToDisplay = projectionInputs.monthlyEurSalary * eurToDisplayRate;
    const monthlyInrToDisplay = projectionInputs.monthlyInrSalary * inrToDisplayRate;
    const monthlyExpensesDisplay = projectionInputs.monthlyEurExpenses * eurToDisplayRate;
    const monthlyNetIncome = monthlyEurToDisplay + monthlyInrToDisplay - monthlyExpensesDisplay;
    const monthlyStockGrowth = projectionInputs.stockGrowthPercent / 100 / 12;

    for (let m = 1; m <= projectionInputs.projectionMonths; m++) {
      currentNW += monthlyNetIncome;
      currentNW = currentNW * (1 + monthlyStockGrowth);
      
      const vestingThisMonth = vestingEvents
        .filter(v => {
          const vestDate = new Date(v.month);
          const currDate = new Date();
          const targetDate = new Date(currDate.getFullYear(), currDate.getMonth() + m - 1, 1);
          return vestDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0];
        })
        .reduce((sum, v) => {
          const usdRate = rates["USD"] || 1;
          const displayRate = rates[display] || 1;
          return sum + (v.amountUsd * (displayRate / usdRate));
        }, 0);
      
      currentNW += vestingThisMonth;

      const monthName = new Date(new Date().getFullYear(), new Date().getMonth() + m - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      projections.push({
        month: monthName,
        netWorth: Math.round(currentNW),
        liquifiable: Math.round(currentNW * 0.7),
        change: m === 1 ? monthlyNetIncome : 0,
      });
    }
    return projections;
  };

  const projectionData = useMemo(() => calculateProjections(), [
    projectionInputs.monthlyEurSalary,
    projectionInputs.monthlyInrSalary,
    projectionInputs.monthlyEurExpenses,
    projectionInputs.stockGrowthPercent,
    projectionInputs.projectionMonths,
    vestingEvents.length,
    summary.netWorth,
    display,
  ]);

  const TABS: { id: NWTab; label: string; icon: typeof Wallet; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "assets", label: "Assets", icon: Wallet, count: data.assets.length },
    { id: "liabilities", label: "Liabilities", icon: Landmark, count: data.liabilities.length },
    { id: "history", label: "History", icon: History },
    { id: "projector", label: "Projector", icon: LineChartIcon },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Net Worth
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.assets.length} assets · {data.liabilities.length} liabilities · all values in {display}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={display}
              onValueChange={(v) => {
                setAppCurrency(v);
                toast.success(`Finance currency set to ${v}`);
              }}
            >
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <Coins className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag} {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                currencyService.refresh().then(() => {
                  refresh();
                  toast.success("Exchange rates refreshed");
                });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Rates
            </Button>
          </div>
        </div>

        {/* Sub tabs */}
        <div className="flex gap-1 mt-4 bg-muted rounded-lg p-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-shrink-0 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  tab === t.id
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {typeof t.count === "number" && (
                  <span className="text-xs text-muted-foreground">({t.count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "overview" && (
          <Overview summary={summary} refCurrencies={refCurrencies} display={display} />
        )}
        {tab === "assets" && (
          <AssetsLedger
            assets={data.assets}
            summary={summary}
            display={display}
            onAdd={openAddAsset}
            onEdit={openEditAsset}
            onDelete={(id) => {
              netWorthService.removeAsset(id);
              toast.success("Asset removed");
            }}
          />
        )}
        {tab === "liabilities" && (
          <LiabilitiesLedger
            liabilities={data.liabilities}
            summary={summary}
            display={display}
            onAdd={openAddLiability}
            onEdit={openEditLiability}
            onDelete={(id) => {
              netWorthService.removeLiability(id);
              toast.success("Liability removed");
            }}
          />
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Net Worth History</h3>
                <p className="text-xs text-muted-foreground mt-1">Track your progress over time via historical snapshots</p>
              </div>
              <Button onClick={takeSnapshot} className="gap-2">
                <Plus className="h-4 w-4" />
                Take Snapshot
              </Button>
            </div>

            {snapshots.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-background p-4">
                  <h4 className="text-sm font-medium mb-3">Wealth Trajectory</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={snapshots}>
                      <defs>
                        <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip contentStyle={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="netWorth" stroke="#10b981" fillOpacity={1} fill="url(#colorNW)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <h4 className="text-sm font-medium mb-3">Snapshots</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {snapshots.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 border border-border/50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.date}</p>
                          <p className="text-xs text-muted-foreground">
                            Assets: {fmt(s.totalAssets, display)} • Liabilities: {fmt(s.totalLiabilities, display)} • Net: {fmt(s.netWorth, display)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {snapshots.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No snapshots yet. Click "Take Snapshot" to start tracking your wealth.</p>
              </div>
            )}
          </div>
        )}

        {/* Projector Tab */}
        {tab === "projector" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Wealth Projector</h3>
              <p className="text-xs text-muted-foreground mb-4">Forecast your net worth based on salary, expenses, and vesting schedule</p>
            </div>

            <div className="rounded-lg border border-border bg-background p-4 space-y-4">
              <h4 className="text-sm font-medium">Projection Inputs</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <Field label="Monthly EUR Salary (NET)">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">€</span>
                    <Input
                      type="number"
                      value={projectionInputs.monthlyEurSalary}
                      onChange={(e) => setProjectionInputs({...projectionInputs, monthlyEurSalary: Number(e.target.value)})}
                    />
                  </div>
                </Field>
                <Field label="Monthly INR Salary (NET)">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">₹</span>
                    <Input
                      type="number"
                      value={projectionInputs.monthlyInrSalary}
                      onChange={(e) => setProjectionInputs({...projectionInputs, monthlyInrSalary: Number(e.target.value)})}
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Monthly EUR Expenses">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">€</span>
                    <Input
                      type="number"
                      value={projectionInputs.monthlyEurExpenses}
                      onChange={(e) => setProjectionInputs({...projectionInputs, monthlyEurExpenses: Number(e.target.value)})}
                    />
                  </div>
                </Field>
                <Field label="Stock Growth % / Year">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={projectionInputs.stockGrowthPercent}
                      onChange={(e) => setProjectionInputs({...projectionInputs, stockGrowthPercent: Number(e.target.value)})}
                    />
                    <span className="text-sm">%</span>
                  </div>
                </Field>
              </div>

              <Field label="Projection Period">
                <select
                  className="w-full p-2 border border-border rounded text-sm bg-background text-foreground"
                  value={projectionInputs.projectionMonths}
                  onChange={(e) => setProjectionInputs({...projectionInputs, projectionMonths: Number(e.target.value)})}
                >
                  <option value={6}>6 months</option>
                  <option value={12}>1 year</option>
                  <option value={24}>2 years</option>
                  <option value={36}>3 years</option>
                  <option value={60}>5 years</option>
                </select>
              </Field>
            </div>

            {/* Projection Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Current NW</p>
                <p className="text-lg font-bold text-foreground mt-1">{fmt(summary.netWorth, display)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Projected in {projectionInputs.projectionMonths}M</p>
                <p className="text-lg font-bold text-emerald-500 mt-1">
                  {fmt(summary.netWorth * Math.pow(1 + projectionInputs.stockGrowthPercent / 100 / 12, projectionInputs.projectionMonths), display)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Projected Gain</p>
                <p className="text-lg font-bold text-emerald-500 mt-1">
                  +{fmt(
                    summary.netWorth * (Math.pow(1 + projectionInputs.stockGrowthPercent / 100 / 12, projectionInputs.projectionMonths) - 1),
                    display
                  )}
                </p>
              </div>
            </div>

            {/* Stock Vesting Events */}
            <div className="rounded-lg border border-border bg-background p-4 space-y-3">
              <h4 className="text-sm font-medium">Stock Vesting Events</h4>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Month (YYYY-MM)">
                  <Input
                    type="month"
                    value={vestingInput.month}
                    onChange={(e) => setVestingInput({...vestingInput, month: e.target.value})}
                  />
                </Field>
                <Field label="Amount (USD)">
                  <Input
                    type="number"
                    placeholder="10000"
                    value={vestingInput.amountUsd}
                    onChange={(e) => setVestingInput({...vestingInput, amountUsd: Number(e.target.value)})}
                  />
                </Field>
                <Field label="Label">
                  <Input
                    placeholder="e.g. MSFT vest Q2"
                    value={vestingInput.label}
                    onChange={(e) => setVestingInput({...vestingInput, label: e.target.value})}
                  />
                </Field>
              </div>
              <Button onClick={addVestingEvent} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-1" />
                Add Vest
              </Button>

              {vestingEvents.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {vestingEvents.map((v) => (
                    <div key={v.month} className="flex items-center justify-between p-2 border border-border/50 rounded">
                      <span className="text-sm">{v.month} • ${v.amountUsd.toLocaleString()} • {v.label}</span>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => removeVestingEvent(v.month)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projection Chart */}
            {projectionData.length > 0 && (
              <div className="rounded-lg border border-border bg-background p-4 space-y-4">
                <h4 className="text-sm font-medium">Net Worth Projection</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={projectionData}>
                    <defs>
                      <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => fmt(value as number, display)} />
                    <Area type="monotone" dataKey="netWorth" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNetWorth)" />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Month-by-month table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-2">Month</th>
                        <th className="text-right py-2 px-2">Net Worth</th>
                        <th className="text-right py-2 px-2">Liquifiable</th>
                        <th className="text-right py-2 px-2">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectionData.map((p) => (
                        <tr key={p.month} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-2">{p.month}</td>
                          <td className="text-right py-2 px-2 font-medium">{fmt(p.netWorth, display)}</td>
                          <td className="text-right py-2 px-2 text-muted-foreground">{fmt(p.liquifiable, display)}</td>
                          <td className="text-right py-2 px-2 text-emerald-500">+{fmt(p.change, display)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Asset dialog */}
      <Dialog open={assetDialog} onOpenChange={setAssetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAssetId ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Field label="Name">
              <Input
                value={assetDraft.name}
                onChange={(e) => setAssetDraft({ ...assetDraft, name: e.target.value })}
                placeholder="e.g. Revolut EUR Account"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select
                  value={assetDraft.category}
                  onValueChange={(v) =>
                    setAssetDraft({ ...assetDraft, category: v as AssetCategory })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type">
                <Input
                  value={assetDraft.type}
                  onChange={(e) => setAssetDraft({ ...assetDraft, type: e.target.value })}
                  placeholder="Cash, Equity…"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input
                  value={assetDraft.location}
                  onChange={(e) => setAssetDraft({ ...assetDraft, location: e.target.value })}
                  placeholder="Country"
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={assetDraft.currency}
                  onValueChange={(v) => setAssetDraft({ ...assetDraft, currency: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label="Amount (native)">
                <Input
                  type="number"
                  value={assetDraft.amount || ""}
                  onChange={(e) =>
                    setAssetDraft({ ...assetDraft, amount: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-muted-foreground pb-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={assetDraft.liquid}
                  onChange={(e) => setAssetDraft({ ...assetDraft, liquid: e.target.checked })}
                  className="h-4 w-4 accent-emerald-500"
                />
                Liquid asset
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              ≈ {fmt(currencyService.convert(assetDraft.amount, assetDraft.currency, display), display)} in {display}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssetDialog(false)}>Cancel</Button>
            <Button onClick={saveAsset}>{editingAssetId ? "Save" : "Add Asset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Liability dialog */}
      <Dialog open={liabDialog} onOpenChange={setLiabDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLiabId ? "Edit Liability" : "Add Liability"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Field label="Name">
              <Input
                value={liabDraft.name}
                onChange={(e) => setLiabDraft({ ...liabDraft, name: e.target.value })}
                placeholder="e.g. Home Loan - SBI"
              />
            </Field>
            <Field label="Note">
              <Input
                value={liabDraft.note || ""}
                onChange={(e) => setLiabDraft({ ...liabDraft, note: e.target.value })}
                placeholder="Optional description"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input
                  value={liabDraft.location}
                  onChange={(e) => setLiabDraft({ ...liabDraft, location: e.target.value })}
                  placeholder="Country"
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={liabDraft.currency}
                  onValueChange={(v) => setLiabDraft({ ...liabDraft, currency: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Amount (native)">
              <Input
                type="number"
                value={liabDraft.amount || ""}
                onChange={(e) =>
                  setLiabDraft({ ...liabDraft, amount: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              ≈ {fmt(currencyService.convert(liabDraft.amount, liabDraft.currency, display), display)} in {display}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLiabDialog(false)}>Cancel</Button>
            <Button onClick={saveLiability}>{editingLiabId ? "Save" : "Add Liability"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ----------------------------- Sub-views ----------------------------- */

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

const Overview = ({
  summary,
  refCurrencies,
  display,
}: {
  summary: NetWorthSummary;
  refCurrencies: string[];
  display: string;
}) => {
  const donutData = summary.byCategory.filter((b) => b.value > 0);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Net worth across currencies */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {refCurrencies.map((code, i) => {
          const value = currencyService.convert(summary.netWorth, display, code);
          const primary = i === 0;
          return (
            <div
              key={code}
              className={`rounded-2xl border border-border p-5 ${
                primary ? "bg-card" : "bg-card/40"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Net Worth ({code})
              </p>
              <p className={`mt-2 font-bold tabular-nums ${primary ? "text-3xl" : "text-2xl"}`}>
                {fmt(value, code)}
              </p>
              {primary ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-emerald-500">Liquid: {fmt(summary.liquidNetWorth, display)}</span>
                  {"  ·  "}Assets: {fmt(summary.totalAssets, display)}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  @ {currencyService.convert(1, display, code).toFixed(2)} {display}/{code}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Liabilities */}
      <div className="rounded-2xl border border-border p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total Liabilities
          </p>
          <p className="mt-1 text-2xl font-bold text-red-400 tabular-nums">
            {fmt(summary.totalLiabilities, display)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Assets</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(summary.totalAssets, display)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Allocation donut */}
        <div className="lg:col-span-2 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold mb-4 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" /> Asset Allocation
          </p>
          {donutData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No assets yet.</p>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="h-[180px] w-[180px] flex-none">
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="key"
                      innerRadius={58}
                      outerRadius={85}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donutData.map((d) => (
                        <Cell key={d.key} fill={d.color || "#64748b"} />
                      ))}
                    </Pie>
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-[200px] space-y-2">
                {donutData.map((d) => (
                  <div key={d.key} className="flex items-center gap-3 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-none"
                      style={{ background: d.color || "#64748b" }}
                    />
                    <span className="flex-1 text-foreground">{d.key}</span>
                    <span className="tabular-nums text-foreground">{fmt(d.value, display)}</span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {d.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Geography + currency exposure */}
        <div className="space-y-4">
          <BreakdownCard
            title="Geography"
            icon={<Globe className="h-4 w-4 text-muted-foreground" />}
            rows={summary.byLocation}
            display={display}
          />
          <BreakdownCard
            title="Currency Exposure"
            icon={<Coins className="h-4 w-4 text-muted-foreground" />}
            rows={summary.byCurrency}
            display={display}
            currencyLabels
          />
        </div>
      </div>
    </div>
  );
};

const BreakdownCard = ({
  title,
  icon,
  rows,
  display,
  currencyLabels,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; value: number; pct: number }[];
  display: string;
  currencyLabels?: boolean;
}) => (
  <div className="rounded-2xl border border-border p-5">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
      {icon} {title}
    </p>
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No data.</p>
    ) : (
      <div className="space-y-3">
        {rows.map((r) => {
          const label = currencyLabels
            ? `${currencyService.getCurrency(r.key).flag} ${r.key}`
            : r.key;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{label}</span>
                <span className="tabular-nums text-foreground">{fmt(r.value, display)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${Math.min(r.pct, 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
                  {r.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const categoryFilters = (assets: Asset[]) => {
  const counts: Record<string, number> = {};
  for (const a of assets) counts[a.category] = (counts[a.category] || 0) + 1;
  return Object.entries(counts).map(([key, count]) => ({ key: key as AssetCategory, count }));
};

const AssetsLedger = ({
  assets,
  summary,
  display,
  onAdd,
  onEdit,
  onDelete,
}: {
  assets: Asset[];
  summary: NetWorthSummary;
  display: string;
  onAdd: () => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}) => {
  const [filter, setFilter] = useState<AssetCategory | "All">("All");
  const filters = categoryFilters(assets);
  const shown = filter === "All" ? assets : assets.filter((a) => a.category === filter);
  const shownTotal = shown.reduce(
    (s, a) => s + currencyService.convert(a.amount, a.currency, display),
    0
  );

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Holdings Ledger</h3>
          <p className="text-xs text-muted-foreground">
            {assets.length} positions · {fmt(summary.totalAssets, display)} total
          </p>
        </div>
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Asset
        </Button>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 flex-wrap mb-4">
        <FilterPill active={filter === "All"} onClick={() => setFilter("All")}>
          All ({assets.length})
        </FilterPill>
        {filters.map((f) => (
          <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: CATEGORY_COLORS[f.key] }}
            />
            {f.key} ({f.count})
          </FilterPill>
        ))}
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground">{shown.length} positions</span>
          <span className="text-sm font-semibold tabular-nums text-emerald-500">
            {fmt(shownTotal, display)}
          </span>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No assets in this view.</p>
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="col-span-4">Name</span>
              <span className="col-span-2">Location / Currency</span>
              <span className="col-span-2 text-right">Native</span>
              <span className="col-span-2 text-right">{display} Value</span>
              <span className="col-span-1 text-right">% NW</span>
              <span className="col-span-1 text-right">Actions</span>
            </div>
            {shown.map((a) => {
              const inDisplay = currencyService.convert(a.amount, a.currency, display);
              const pct = summary.netWorth > 0 ? (inDisplay / summary.netWorth) * 100 : 0;
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                >
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                        style={{
                          background: `${CATEGORY_COLORS[a.category]}22`,
                          color: CATEGORY_COLORS[a.category],
                        }}
                      >
                        {a.category}
                      </span>
                      {!a.liquid && (
                        <span className="text-[10px] text-muted-foreground">Non-liquid</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:block sm:col-span-2 text-sm">
                    <p className="text-foreground">{a.location || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{a.currency}</p>
                  </div>
                  <div className="hidden sm:block sm:col-span-2 text-right text-sm tabular-nums">
                    {fmt(a.amount, a.currency)}
                  </div>
                  <div className="sm:col-span-2 text-right text-sm tabular-nums text-emerald-500">
                    {fmt(inDisplay, display)}
                  </div>
                  <div className="hidden sm:block sm:col-span-1 text-right text-xs tabular-nums text-muted-foreground">
                    {pct.toFixed(1)}%
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => onEdit(a)}
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(a.id)}
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const LiabilitiesLedger = ({
  liabilities,
  summary,
  display,
  onAdd,
  onEdit,
  onDelete,
}: {
  liabilities: Liability[];
  summary: NetWorthSummary;
  display: string;
  onAdd: () => void;
  onEdit: (l: Liability) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="max-w-5xl">
    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5 mb-5 inline-block min-w-[280px]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <TrendingDown className="h-3.5 w-3.5" /> Total Liabilities
      </p>
      <p className="mt-1 text-3xl font-bold text-red-400 tabular-nums">
        {fmt(summary.totalLiabilities, display)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Across {liabilities.length} {liabilities.length === 1 ? "entry" : "entries"}
      </p>
    </div>

    <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
      <h3 className="text-lg font-semibold">Liabilities Ledger</h3>
      <Button onClick={onAdd} size="sm" variant="destructive">
        <Plus className="h-4 w-4 mr-1" /> Add Liability
      </Button>
    </div>

    <div className="rounded-2xl border border-border overflow-hidden">
      {liabilities.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No liabilities. 🎉</p>
      ) : (
        <div className="divide-y divide-border">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="col-span-5">Name</span>
            <span className="col-span-2">Location</span>
            <span className="col-span-2 text-right">Native</span>
            <span className="col-span-2 text-right">{display} Value</span>
            <span className="col-span-1 text-right">Actions</span>
          </div>
          {liabilities.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
            >
              <div className="col-span-2 sm:col-span-5">
                <p className="text-sm font-medium text-foreground">{l.name}</p>
                {l.note && <p className="text-[11px] text-muted-foreground">{l.note}</p>}
              </div>
              <div className="hidden sm:block sm:col-span-2 text-sm text-foreground">
                {l.location || "—"}
              </div>
              <div className="hidden sm:block sm:col-span-2 text-right text-sm tabular-nums">
                {fmt(l.amount, l.currency)}
              </div>
              <div className="sm:col-span-2 text-right text-sm tabular-nums text-red-400">
                {fmt(currencyService.convert(l.amount, l.currency, display), display)}
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end gap-1">
                <button
                  onClick={() => onEdit(l)}
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(l.id)}
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const FilterPill = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-foreground/20 bg-muted font-medium text-foreground"
        : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`}
  >
    {children}
  </button>
);

export default NetWorthTracker;
