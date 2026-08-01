/**
 * SavingsHub — simple savings tracker.
 * Quick add: type + name + amount. Optional rate/months → auto maturity.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PiggyBank,
  Plus,
  Trash2,
  Pencil,
  Check,
  Landmark,
  Shield,
  Building2,
  TrendingUp,
  Wallet,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LifeManagementService } from "@/services/lifeManagement";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import type {
  SavingsCompounding,
  SavingsItem,
  SavingsKind,
} from "@/types/lifeManagement";
import { cn } from "@/lib/utils";
import { appCurrencyCode, appCurrencySymbol, formatAppMoney } from "@/services/regionService";
import { useAppCurrency } from "@/hooks/useAppCurrency";

const TYPES: {
  kind: SavingsKind;
  label: string;
  short: string;
  color: string;
  icon: typeof PiggyBank;
}[] = [
  { kind: "bank_account", label: "Bank", short: "Bank", color: "#3b82f6", icon: Landmark },
  { kind: "emergency_fund", label: "Emergency", short: "Emergency", color: "#f43f5e", icon: Shield },
  { kind: "fixed_deposit", label: "FD", short: "FD", color: "#22c55e", icon: Building2 },
  { kind: "recurring_deposit", label: "RD", short: "RD", color: "#14b8a6", icon: TrendingUp },
  { kind: "savings_account", label: "Savings a/c", short: "Savings", color: "#06b6d4", icon: Wallet },
  { kind: "investment", label: "Invest", short: "Invest", color: "#a855f7", icon: PiggyBank },
];

function meta(kind: SavingsKind) {
  return TYPES.find((t) => t.kind === kind) || TYPES[0];
}

export function calculateMaturity(opts: {
  principal: number;
  interestRate?: number;
  tenureMonths?: number;
  compounding?: SavingsCompounding;
  monthlyContribution?: number;
}): number {
  const P = Math.max(0, opts.principal || 0);
  const rate = Math.max(0, opts.interestRate || 0) / 100;
  const months = Math.max(0, Math.round(opts.tenureMonths || 0));
  const contrib = Math.max(0, opts.monthlyContribution || 0);
  if (months <= 0) return P;

  const years = months / 12;
  const compounding = opts.compounding || "quarterly";

  if (rate <= 0) return Math.round((P + contrib * months) * 100) / 100;

  if (compounding === "simple") {
    let amount = P * (1 + rate * years);
    if (contrib > 0) {
      amount += contrib * months + contrib * ((months * (months + 1)) / 2) * (rate / 12);
    }
    return Math.round(amount * 100) / 100;
  }

  const n =
    compounding === "monthly" ? 12 : compounding === "half_yearly" ? 2 : compounding === "yearly" ? 1 : 4;
  let amount = P * Math.pow(1 + rate / n, n * years);
  if (contrib > 0) {
    const i = rate / 12;
    amount += i > 0 ? contrib * ((Math.pow(1 + i, months) - 1) / i) : contrib * months;
  }
  return Math.round(amount * 100) / 100;
}

function money(n: number): string {
  return formatAppMoney(n || 0);
}

export default function SavingsHub() {
  useAppCurrency();
  const [items, setItems] = useState<SavingsItem[]>([]);
  const [kind, setKind] = useState<SavingsKind>("bank_account");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [months, setMonths] = useState("");
  const [target, setTarget] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustVal, setAdjustVal] = useState("");

  const reload = useCallback(() => {
    setItems(LifeManagementService.getData().savingsItems || []);
  }, []);

  useEffect(() => {
    reload();
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { domains?: string[] } | undefined;
      if (!d?.domains || d.domains.includes("finance")) reload();
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [reload]);

  // Auto-open rate fields for FD/RD
  useEffect(() => {
    if (kind === "fixed_deposit" || kind === "recurring_deposit") {
      setShowMore(true);
      if (!months) setMonths("12");
    } else if (kind === "emergency_fund") {
      setShowMore(true);
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const projected = useMemo(
    () =>
      calculateMaturity({
        principal: parseFloat(amount) || 0,
        interestRate: parseFloat(rate) || 0,
        tenureMonths: parseInt(months, 10) || 0,
        compounding: "quarterly",
      }),
    [amount, rate, months]
  );

  const totals = useMemo(() => {
    const total = items.reduce((s, i) => s + (i.principal || 0), 0);
    const bank = items
      .filter((i) => i.kind === "bank_account" || i.kind === "savings_account")
      .reduce((s, i) => s + i.principal, 0);
    const emergency = items
      .filter((i) => i.kind === "emergency_fund")
      .reduce((s, i) => s + i.principal, 0);
    const emergencyTarget = items
      .filter((i) => i.kind === "emergency_fund")
      .reduce((s, i) => s + (i.targetAmount || 0), 0);
    const fd = items
      .filter((i) => i.kind === "fixed_deposit" || i.kind === "recurring_deposit")
      .reduce((s, i) => s + i.principal, 0);
    return { total, bank, emergency, emergencyTarget, fd };
  }, [items]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setAmount("");
    setRate("");
    setMonths(kind === "fixed_deposit" || kind === "recurring_deposit" ? "12" : "");
    setTarget("");
  };

  const openEdit = (item: SavingsItem) => {
    setAdjustId(null);
    setAdjustVal("");
    setEditingId(item.id);
    setKind(item.kind);
    setName(item.name || "");
    setAmount(String(item.principal ?? ""));
    setRate(item.interestRate != null ? String(item.interestRate) : "");
    setMonths(item.tenureMonths != null ? String(item.tenureMonths) : "");
    setTarget(item.targetAmount != null ? String(item.targetAmount) : "");
    setShowMore(
      Boolean(
        item.interestRate ||
          item.tenureMonths ||
          item.targetAmount ||
          item.kind === "fixed_deposit" ||
          item.kind === "recurring_deposit" ||
          item.kind === "emergency_fund",
      ),
    );
  };

  const handleSave = () => {
    const principal = parseFloat(amount);
    if (!Number.isFinite(principal) || principal < 0) {
      toast.error("Enter an amount");
      return;
    }
    const interestRate = rate ? parseFloat(rate) : undefined;
    const tenureMonths = months ? parseInt(months, 10) : undefined;
    const targetAmount = target ? parseFloat(target) : undefined;

    let maturityDate: string | undefined;
    if (tenureMonths) {
      const d = new Date();
      d.setMonth(d.getMonth() + tenureMonths);
      maturityDate = d.toISOString().split("T")[0];
    }

    const maturityAmount = calculateMaturity({
      principal,
      interestRate,
      tenureMonths,
      compounding: "quarterly",
    });

    const fields: Partial<SavingsItem> = {
      name: name.trim() || `${meta(kind).label} · ${money(principal)}`,
      kind,
      principal,
      interestRate: Number.isFinite(interestRate as number) ? interestRate : undefined,
      compounding: "quarterly",
      tenureMonths: Number.isFinite(tenureMonths as number) ? tenureMonths : undefined,
      maturityDate,
      maturityAmount,
      targetAmount: Number.isFinite(targetAmount as number) ? targetAmount : undefined,
      currency: appCurrencyCode(),
    };

    if (editingId) {
      LifeManagementService.updateSavingsItem(editingId, fields);
      toast.success("Savings updated");
    } else {
      LifeManagementService.addSavingsItem({
        id: `sav-${Date.now()}`,
        startDate: new Date().toISOString().split("T")[0],
        name: fields.name!,
        kind: fields.kind!,
        principal: fields.principal!,
        interestRate: fields.interestRate,
        compounding: fields.compounding,
        tenureMonths: fields.tenureMonths,
        maturityDate: fields.maturityDate,
        maturityAmount: fields.maturityAmount,
        targetAmount: fields.targetAmount,
        currency: fields.currency,
      });
      toast.success("Saved");
    }

    resetForm();
    reload();
  };

  const handleDelete = (id: string) => {
    if (editingId === id) resetForm();
    if (adjustId === id) {
      setAdjustId(null);
      setAdjustVal("");
    }
    LifeManagementService.deleteSavingsItem(id);
    toast.success("Removed");
    reload();
  };

  const handleAdjust = (id: string) => {
    const delta = parseFloat(adjustVal);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter an amount");
      return;
    }
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const principal = Math.max(0, item.principal + delta);
    const maturityAmount = calculateMaturity({
      principal,
      interestRate: item.interestRate,
      tenureMonths: item.tenureMonths,
      compounding: item.compounding,
      monthlyContribution: item.monthlyContribution,
    });
    LifeManagementService.updateSavingsItem(id, { principal, maturityAmount });
    toast.success("Updated");
    setAdjustId(null);
    setAdjustVal("");
    reload();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Compact summary strip */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 grid grid-cols-3 gap-2 border-b border-border">
        <div className="rounded-xl bg-muted/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-base font-semibold tabular-nums">{money(totals.total)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bank</p>
          <p className="text-base font-semibold tabular-nums text-sky-400">{money(totals.bank)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Emergency</p>
          <p className="text-base font-semibold tabular-nums text-rose-400">
            {money(totals.emergency)}
            {totals.emergencyTarget > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                / {money(totals.emergencyTarget)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Quick add — always visible */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border space-y-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = kind === t.kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => setKind(t.kind)}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs whitespace-nowrap border transition-colors",
                  active
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
                style={active ? { background: t.color } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.short}
              </button>
            );
          })}
        </div>

        {editingId && (
          <p className="text-[11px] text-sky-400">Editing savings — change fields then Update</p>
        )}

        <div className="flex gap-2">
          <Input
            className="h-9 flex-1 min-w-0"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <Input
            className="h-9 w-[120px] flex-shrink-0"
            type="number"
            min="0"
            step="1"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <Button className="h-9 px-3 flex-shrink-0" onClick={handleSave}>
            {editingId ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Update
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </>
            )}
          </Button>
          {editingId && (
            <Button className="h-9 px-3 flex-shrink-0" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>

        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showMore ? "Hide extras" : "Interest % / months / target (optional)"}
        </button>

        {showMore && (
          <div className="grid grid-cols-3 gap-2">
            <Input
              className="h-8 text-xs"
              type="number"
              min="0"
              step="0.1"
              placeholder="Rate %"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <Input
              className="h-8 text-xs"
              type="number"
              min="0"
              placeholder="Months"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
            {kind === "emergency_fund" ? (
              <Input
                className="h-8 text-xs"
                type="number"
                min="0"
                placeholder={`Target ${appCurrencySymbol()}`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            ) : (
              <div className="h-8 rounded-md border border-border px-2 flex items-center text-xs text-muted-foreground tabular-nums">
                {(parseFloat(rate) > 0 || parseInt(months, 10) > 0) && parseFloat(amount) > 0
                  ? `→ ${money(projected)}`
                  : "Maturity —"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {items.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-6">
            <PiggyBank className="h-9 w-9 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">Add your first savings</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
              Pick a type, enter an amount, tap Add. Rate and months are optional.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const m = meta(item.kind);
            const Icon = m.icon;
            const maturity =
              item.maturityAmount ??
              calculateMaturity({
                principal: item.principal,
                interestRate: item.interestRate,
                tenureMonths: item.tenureMonths,
                compounding: item.compounding,
              });
            const showMaturity =
              (item.interestRate || 0) > 0 && (item.tenureMonths || 0) > 0 && maturity > item.principal;
            const progress =
              item.targetAmount && item.targetAmount > 0
                ? Math.min(100, (item.principal / item.targetAmount) * 100)
                : null;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 flex items-center gap-3"
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${m.color}22` }}
                >
                  <Icon className="h-4 w-4" style={{ color: m.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-sm font-semibold tabular-nums flex-shrink-0">
                      {money(item.principal)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.label}
                      {item.interestRate ? ` · ${item.interestRate}%` : ""}
                      {item.tenureMonths ? ` · ${item.tenureMonths}mo` : ""}
                      {showMaturity ? (
                        <span className="text-emerald-400"> · → {money(maturity)}</span>
                      ) : null}
                    </p>
                  </div>
                  {progress != null && (
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${progress}%`, background: m.color }}
                      />
                    </div>
                  )}
                  {adjustId === item.id && (
                    <div className="flex gap-1.5 mt-2">
                      <Input
                        className="h-7 text-xs w-28"
                        type="number"
                        placeholder="+/-"
                        value={adjustVal}
                        onChange={(e) => setAdjustVal(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdjust(item.id)}
                        autoFocus
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleAdjust(item.id)}>
                        OK
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setAdjustId(null);
                          setAdjustVal("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {adjustId !== item.id && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7 p-0 text-muted-foreground hover:text-foreground",
                        editingId === item.id && "text-foreground bg-muted",
                      )}
                      title="Edit"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      title="Add or subtract amount"
                      onClick={() => {
                        setEditingId(null);
                        setAdjustId(item.id);
                        setAdjustVal("");
                      }}
                    >
                      ±
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
