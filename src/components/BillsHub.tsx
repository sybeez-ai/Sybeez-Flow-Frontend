/**
 * BillsHub — EMIs, Insurance, Subscriptions with full details + reminders.
 * Mark paid advances next payment by one month.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building,
  Shield,
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Check,
  Bell,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeManagementService } from "@/services/lifeManagement";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import { upsertNotification, scanAndEmitNotifications } from "@/services/notificationService";
import type { EMI, Insurance, Subscription } from "@/types/lifeManagement";
import { formatAppMoney, appCurrencySymbol } from "@/services/regionService";
import { cn } from "@/lib/utils";

type FormKind = "emi" | "insurance" | "subscription" | null;

function money(n: number): string {
  return formatAppMoney(n || 0);
}

function clampDueDay(n: number): number {
  return Math.min(31, Math.max(1, Math.round(Number(n) || 1)));
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Next due date on/after today for a day-of-month. */
function resolveNextDue(dueDay: number, stored?: string): string {
  const start = todayStart();
  if (stored) {
    const d = new Date(stored + "T00:00:00");
    d.setHours(0, 0, 0, 0);
    if (d.getTime() >= start.getTime()) return stored;
  }
  const day = clampDueDay(dueDay);
  let y = start.getFullYear();
  let m = start.getMonth();
  let candidate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
  candidate.setHours(0, 0, 0, 0);
  if (candidate.getTime() < start.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    candidate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
  }
  return toISODate(candidate);
}

/** Push next payment one calendar month (same due day). */
function addOneMonth(dateStr: string, dueDay: number): string {
  const d = new Date((dateStr || toISODate(new Date())) + "T00:00:00");
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const day = Math.min(clampDueDay(dueDay), daysInMonth(y, m));
  return toISODate(new Date(y, m, day));
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  target.setHours(0, 0, 0, 0);
  const now = todayStart();
  return Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function formatWhen(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d < 0) return `overdue ${Math.abs(d)}d`;
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `in ${d} days`;
}

function ordinal(n: number): string {
  const day = clampDueDay(n);
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

function emiStats(emi: EMI) {
  const tenure = Math.max(1, emi.tenure || emi.remainingMonths || 1);
  const remaining = Math.max(0, emi.remainingMonths ?? tenure);
  const paidMonths = Math.max(0, tenure - remaining);
  const monthly = Number(emi.monthlyAmount) || 0;
  const totalPayable = monthly * tenure;
  const paidAmount = monthly * paidMonths;
  const remainingAmount = monthly * remaining;
  const principal = Number(emi.principalAmount) || 0;
  const interestTotal =
    principal > 0
      ? Math.max(0, totalPayable - principal)
      : emi.interestRate
        ? Math.round(monthly * tenure * ((emi.interestRate || 0) / 100) * 0.35 * 100) / 100
        : 0;
  const paidInterest =
    interestTotal > 0 && totalPayable > 0
      ? Math.round((interestTotal * (paidAmount / totalPayable)) * 100) / 100
      : 0;
  const nextDate = resolveNextDue(emi.dueDay, emi.nextPaymentDate);
  const progress = tenure > 0 ? Math.min(100, (paidMonths / tenure) * 100) : 0;
  return {
    tenure,
    remaining,
    paidMonths,
    monthly,
    totalPayable,
    paidAmount,
    remainingAmount,
    principal,
    interestTotal,
    paidInterest,
    nextDate,
    progress,
  };
}

const emptyForm = {
  name: "",
  amount: "",
  dueDay: String(new Date().getDate()),
  bank: "",
  tenure: "12",
  remainingMonths: "12",
  interestRate: "",
  principal: "",
  reminderDays: "7",
  type: "health",
  premium: "",
  renewalDate: "",
  provider: "",
  nextBilling: "",
};

export default function BillsHub() {
  const [emis, setEmis] = useState<EMI[]>([]);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const reload = useCallback(() => {
    const data = LifeManagementService.getData();
    // Heal invalid due days (e.g. 200 → 31) and backfill nextPaymentDate once
    for (const emi of data.emis || []) {
      const due = clampDueDay(emi.dueDay);
      const needsDueFix = emi.dueDay !== due;
      const needsNext = !emi.nextPaymentDate;
      const needsRemind = emi.reminderDays == null;
      if (needsDueFix || needsNext || needsRemind) {
        LifeManagementService.updateEMI(emi.id, {
          dueDay: due,
          nextPaymentDate: emi.nextPaymentDate || resolveNextDue(due),
          reminderDays: emi.reminderDays ?? 7,
        });
      }
    }
    const fresh = LifeManagementService.getData();
    setEmis(fresh.emis || []);
    setInsurances(fresh.insurances || []);
    setSubscriptions(fresh.subscriptions || []);
  }, []);

  useEffect(() => {
    reload();
    scanAndEmitNotifications({ toastFn: (t, o) => toast(t, { description: o?.description }) });
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { domains?: string[] } | undefined;
      if (!d?.domains || d.domains.includes("finance")) reload();
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [reload]);

  const reminders = useMemo(() => {
    return LifeManagementService.getUpcomingPayments(14);
  }, [emis, insurances, subscriptions]);

  const resetForm = () => {
    setFormKind(null);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const openAdd = (kind: FormKind) => {
    setEditingId(null);
    setFormKind(kind);
    setForm({
      ...emptyForm,
      dueDay: String(new Date().getDate()),
      renewalDate: toISODate(new Date()),
      nextBilling: toISODate(new Date()),
    });
  };

  const openEditEmi = (emi: EMI) => {
    setEditingId(emi.id);
    setFormKind("emi");
    setForm({
      ...emptyForm,
      name: emi.name,
      amount: String(emi.monthlyAmount),
      dueDay: String(clampDueDay(emi.dueDay)),
      bank: emi.lender || "",
      tenure: String(emi.tenure || emi.remainingMonths || 12),
      remainingMonths: String(emi.remainingMonths || 12),
      interestRate: emi.interestRate != null ? String(emi.interestRate) : "",
      principal: emi.principalAmount != null ? String(emi.principalAmount) : "",
      reminderDays: String(emi.reminderDays ?? 7),
    });
  };

  const openEditInsurance = (ins: Insurance) => {
    setEditingId(ins.id);
    setFormKind("insurance");
    setForm({
      ...emptyForm,
      name: ins.name,
      type: ins.type,
      premium: String(ins.premium),
      renewalDate: ins.renewalDate || "",
      provider: ins.provider || "",
      reminderDays: String(ins.reminderDays ?? 7),
    });
  };

  const openEditSub = (sub: Subscription) => {
    setEditingId(sub.id);
    setFormKind("subscription");
    setForm({
      ...emptyForm,
      name: sub.name,
      amount: String(sub.amount),
      nextBilling: sub.nextBillingDate || "",
      reminderDays: String(sub.reminderDays ?? 3),
    });
  };

  const saveEmi = () => {
    if (!form.name.trim() || !form.amount) {
      toast.error("Enter name and monthly amount");
      return;
    }
    const monthly = parseFloat(form.amount);
    const dueDay = clampDueDay(parseInt(form.dueDay, 10));
    const tenure = Math.max(1, parseInt(form.tenure, 10) || 12);
    const remainingMonths = Math.max(
      0,
      Math.min(tenure, parseInt(form.remainingMonths, 10) || tenure),
    );
    const interestRate = form.interestRate ? parseFloat(form.interestRate) : undefined;
    const principalAmount = form.principal ? parseFloat(form.principal) : undefined;
    const reminderDays = Math.max(0, parseInt(form.reminderDays, 10) || 7);
    const nextPaymentDate = resolveNextDue(dueDay);

    const fields: Partial<EMI> = {
      name: form.name.trim(),
      monthlyAmount: monthly,
      totalAmount: monthly * tenure,
      dueDay,
      tenure,
      remainingMonths,
      interestRate: Number.isFinite(interestRate as number) ? interestRate : undefined,
      principalAmount: Number.isFinite(principalAmount as number) ? principalAmount : undefined,
      reminderDays,
      nextPaymentDate,
      lender: form.bank.trim(),
      category: "other",
    };

    if (editingId) {
      LifeManagementService.updateEMI(editingId, fields);
      toast.success("Loan updated");
    } else {
      LifeManagementService.addEMI({
        id: `emi-${Date.now()}`,
        startDate: toISODate(new Date()),
        name: fields.name!,
        monthlyAmount: fields.monthlyAmount!,
        totalAmount: fields.totalAmount!,
        dueDay: fields.dueDay!,
        tenure: fields.tenure!,
        remainingMonths: fields.remainingMonths!,
        interestRate: fields.interestRate,
        principalAmount: fields.principalAmount,
        reminderDays: fields.reminderDays,
        nextPaymentDate: fields.nextPaymentDate,
        lender: fields.lender || "",
        category: "other",
      });
      toast.success("Loan added — reminders enabled");
    }

    upsertNotification({
      sourceKey: `finance:EMI:${fields.name}:${nextPaymentDate}`,
      module: "finance",
      title: `EMI due ${formatWhen(nextPaymentDate)}`,
      body: `${fields.name} · ${money(monthly)}`,
      target: "finance",
      severity: daysUntil(nextPaymentDate) <= 1 ? "urgent" : "warning",
    });

    resetForm();
    reload();
    scanAndEmitNotifications();
  };

  const markEmiPaid = (emi: EMI) => {
    if ((emi.remainingMonths || 0) <= 0) {
      toast.message("This loan is already fully paid");
      return;
    }
    const next = resolveNextDue(emi.dueDay, emi.nextPaymentDate);
    const following = addOneMonth(next, emi.dueDay);
    const remaining = Math.max(0, (emi.remainingMonths || 1) - 1);
    LifeManagementService.updateEMI(emi.id, {
      remainingMonths: remaining,
      nextPaymentDate: remaining > 0 ? following : next,
      lastPaidDate: toISODate(new Date()),
      dueDay: clampDueDay(emi.dueDay),
    });
    toast.success(
      remaining > 0
        ? `Payment recorded — next due ${following}`
        : "Final payment recorded — loan complete",
    );
    if (remaining > 0) {
      upsertNotification({
        sourceKey: `finance:EMI:${emi.name}:${following}`,
        module: "finance",
        title: `Next EMI · ${following}`,
        body: `${emi.name} · ${money(emi.monthlyAmount)} due next month`,
        target: "finance",
        severity: "info",
      });
    }
    reload();
    scanAndEmitNotifications();
  };

  const saveInsurance = () => {
    if (!form.name.trim() || !form.premium) {
      toast.error("Enter name and premium");
      return;
    }
    const premium = parseFloat(form.premium);
    const renewalDate = form.renewalDate || toISODate(new Date());
    const reminderDays = Math.max(0, parseInt(form.reminderDays, 10) || 7);
    const fields: Partial<Insurance> = {
      name: form.name.trim(),
      type: (form.type as Insurance["type"]) || "health",
      provider: form.provider.trim(),
      premium,
      renewalDate,
      reminderDays,
      frequency: "yearly",
    };
    if (editingId) {
      LifeManagementService.updateInsurance(editingId, fields);
      toast.success("Insurance updated");
    } else {
      LifeManagementService.addInsurance({
        id: `insurance-${Date.now()}`,
        policyNumber: "",
        startDate: toISODate(new Date()),
        coverageAmount: 0,
        name: fields.name!,
        type: fields.type!,
        provider: fields.provider || "",
        premium,
        frequency: "yearly",
        renewalDate,
        reminderDays,
      });
      toast.success("Insurance added");
    }
    resetForm();
    reload();
    scanAndEmitNotifications();
  };

  const markInsuranceRenewed = (ins: Insurance) => {
    const base = ins.renewalDate || toISODate(new Date());
    let d = new Date(base + "T00:00:00");
    if (ins.frequency === "monthly") {
      d = new Date(addOneMonth(base, d.getDate()) + "T00:00:00");
    } else if (ins.frequency === "quarterly") {
      d.setMonth(d.getMonth() + 3);
    } else {
      d.setFullYear(d.getFullYear() + 1);
    }
    const nextDate = toISODate(d);
    LifeManagementService.updateInsurance(ins.id, { renewalDate: nextDate });
    toast.success(`Renewed — next ${nextDate}`);
    upsertNotification({
      sourceKey: `finance:Insurance:${ins.name}:${nextDate}`,
      module: "finance",
      title: `Insurance renewal · ${nextDate}`,
      body: `${ins.name} · ${money(ins.premium)}`,
      target: "finance",
      severity: "info",
    });
    reload();
    scanAndEmitNotifications();
  };

  const saveSubscription = () => {
    if (!form.name.trim() || !form.amount) {
      toast.error("Enter name and amount");
      return;
    }
    const amount = parseFloat(form.amount);
    const nextBillingDate = form.nextBilling || toISODate(new Date());
    const reminderDays = Math.max(0, parseInt(form.reminderDays, 10) || 3);
    const fields: Partial<Subscription> = {
      name: form.name.trim(),
      amount,
      nextBillingDate,
      reminderDays,
      frequency: "monthly",
      autoRenew: true,
      category: "entertainment",
    };
    if (editingId) {
      LifeManagementService.updateSubscription(editingId, fields);
      toast.success("Subscription updated");
    } else {
      LifeManagementService.addSubscription({
        id: `sub-${Date.now()}`,
        startDate: toISODate(new Date()),
        name: fields.name!,
        amount,
        frequency: "monthly",
        nextBillingDate,
        category: "entertainment",
        autoRenew: true,
        reminderDays,
      });
      toast.success("Subscription added");
    }
    resetForm();
    reload();
    scanAndEmitNotifications();
  };

  const markSubPaid = (sub: Subscription) => {
    const dueDay = new Date((sub.nextBillingDate || toISODate(new Date())) + "T00:00:00").getDate();
    const next = addOneMonth(sub.nextBillingDate || toISODate(new Date()), dueDay);
    LifeManagementService.updateSubscription(sub.id, { nextBillingDate: next });
    toast.success(`Paid — next billing ${next}`);
    upsertNotification({
      sourceKey: `finance:Subscription:${sub.name}:${next}`,
      module: "finance",
      title: `Next subscription · ${next}`,
      body: `${sub.name} · ${money(sub.amount)} next month`,
      target: "finance",
      severity: "info",
    });
    reload();
    scanAndEmitNotifications();
  };

  const remove = (type: "emi" | "insurance" | "subscription", id: string) => {
    if (editingId === id) resetForm();
    if (type === "emi") LifeManagementService.deleteEMI(id);
    if (type === "insurance") LifeManagementService.deleteInsurance(id);
    if (type === "subscription") LifeManagementService.deleteSubscription(id);
    toast.success("Removed");
    reload();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Upcoming reminders strip */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-semibold">Upcoming payments</p>
          <span className="text-[11px] text-muted-foreground">
            Reminders · next month after you mark paid
          </span>
        </div>
        {reminders.length === 0 ? (
          <p className="text-xs text-muted-foreground px-0.5">
            Nothing due in the next two weeks
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {reminders.map((r) => {
              const d = daysUntil(r.date);
              return (
                <div
                  key={`${r.type}-${r.id || r.name}-${r.date}`}
                  className={cn(
                    "min-w-[160px] rounded-xl border px-3 py-2",
                    d <= 1
                      ? "border-rose-500/40 bg-rose-500/10"
                      : "border-amber-500/30 bg-amber-500/10",
                  )}
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {r.type} · {formatWhen(r.date)}
                  </p>
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs tabular-nums mt-0.5">{money(r.amount)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {/* EMIs */}
        <Card className="border-border bg-background">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building className="h-4 w-4" />
                EMIs & Loans
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openAdd("emi")}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {formKind === "emi" && (
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-medium">
                  {editingId ? "Edit loan" : "Add loan / EMI"}
                </p>
                <Input
                  placeholder="Name (e.g. Home loan)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Monthly EMI (${appCurrencySymbol()})`}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Due day (1–31)"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder={`Loan principal (${appCurrencySymbol()})`}
                    value={form.principal}
                    onChange={(e) => setForm({ ...form, principal: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Interest % p.a."
                    value={form.interestRate}
                    onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Total months"
                    value={form.tenure}
                    onChange={(e) => setForm({ ...form, tenure: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Months left"
                    value={form.remainingMonths}
                    onChange={(e) => setForm({ ...form, remainingMonths: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Remind (days)"
                    value={form.reminderDays}
                    onChange={(e) => setForm({ ...form, reminderDays: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Bank / lender"
                  value={form.bank}
                  onChange={(e) => setForm({ ...form, bank: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={saveEmi}>
                    {editingId ? "Update" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {emis.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No EMIs yet — add a loan to track paid, interest, and next payment
              </p>
            ) : (
              emis.map((emi) => {
                const s = emiStats(emi);
                const d = daysUntil(s.nextDate);
                return (
                  <div
                    key={emi.id}
                    className="rounded-xl border border-border bg-muted/15 p-3 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{emi.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {emi.lender ? `${emi.lender} · ` : ""}
                          Due every {ordinal(emi.dueDay)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Edit"
                          onClick={() => openEditEmi(emi)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={() => remove("emi", emi.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-background/60 border border-border/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Monthly</p>
                        <p className="text-sm font-semibold tabular-nums">{money(s.monthly)}</p>
                      </div>
                      <div className="rounded-lg bg-background/60 border border-border/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Paid</p>
                        <p className="text-sm font-semibold tabular-nums text-emerald-400">
                          {money(s.paidAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.paidMonths}/{s.tenure} months
                        </p>
                      </div>
                      <div className="rounded-lg bg-background/60 border border-border/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Remaining</p>
                        <p className="text-sm font-semibold tabular-nums text-rose-400">
                          {money(s.remainingAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.remaining} months left
                        </p>
                      </div>
                      <div className="rounded-lg bg-background/60 border border-border/60 px-2.5 py-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Interest</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {s.interestTotal > 0 ? money(s.interestTotal) : emi.interestRate ? `${emi.interestRate}%` : "—"}
                        </p>
                        {s.paidInterest > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            ~{money(s.paidInterest)} paid
                          </p>
                        )}
                      </div>
                    </div>

                    {(s.principal > 0 || s.totalPayable > 0) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {s.principal > 0 && <span>Principal {money(s.principal)}</span>}
                        <span>Total payable {money(s.totalPayable)}</span>
                        {emi.interestRate != null && <span>Rate {emi.interestRate}% p.a.</span>}
                      </div>
                    )}

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/80"
                        style={{ width: `${s.progress}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span
                          className={cn(
                            "font-medium",
                            d < 0 ? "text-rose-400" : d <= 3 ? "text-amber-400" : "text-foreground",
                          )}
                        >
                          Next {s.nextDate} · {formatWhen(s.nextDate)}
                        </span>
                        {d <= (emi.reminderDays ?? 7) && (
                          <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-400">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Reminder
                          </Badge>
                        )}
                      </div>
                      {s.remaining > 0 && (
                        <Button size="sm" className="h-8" onClick={() => markEmiPaid(emi)}>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Insurance */}
        <Card className="border-border bg-background">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Insurance
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openAdd("insurance")}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {formKind === "insurance" && (
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <Input
                  placeholder="Policy name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="health">Health</option>
                  <option value="life">Life</option>
                  <option value="car">Car</option>
                  <option value="home">Home</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder={`Premium (${appCurrencySymbol()})`}
                    value={form.premium}
                    onChange={(e) => setForm({ ...form, premium: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={form.renewalDate}
                    onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Provider"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Remind (days)"
                    value={form.reminderDays}
                    onChange={(e) => setForm({ ...form, reminderDays: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={saveInsurance}>
                    {editingId ? "Update" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {insurances.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No insurance yet</p>
            ) : (
              insurances.map((ins) => {
                const d = daysUntil(ins.renewalDate);
                return (
                  <div
                    key={ins.id}
                    className="rounded-xl border border-border bg-muted/15 px-3 py-2.5 flex items-start gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ins.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {money(ins.premium)} · {ins.provider || "—"} · Renewal {ins.renewalDate} (
                        {formatWhen(ins.renewalDate)})
                      </p>
                      {d <= (ins.reminderDays ?? 7) && (
                        <Badge variant="outline" className="mt-1.5 text-[10px] h-5 border-amber-500/40 text-amber-400">
                          Reminder on
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize flex-shrink-0">
                      {ins.type}
                    </Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markInsuranceRenewed(ins)}>
                      Renewed
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditInsurance(ins)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => remove("insurance", ins.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Subscriptions */}
        <Card className="border-border bg-background">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Subscriptions
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openAdd("subscription")}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {formKind === "subscription" && (
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <Input
                  placeholder="Name (e.g. Netflix)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder={`Amount / month (${appCurrencySymbol()})`}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={form.nextBilling}
                    onChange={(e) => setForm({ ...form, nextBilling: e.target.value })}
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  placeholder="Remind (days before)"
                  value={form.reminderDays}
                  onChange={(e) => setForm({ ...form, reminderDays: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={saveSubscription}>
                    {editingId ? "Update" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {subscriptions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No subscriptions yet</p>
            ) : (
              subscriptions.map((sub) => {
                const d = daysUntil(sub.nextBillingDate);
                return (
                  <div
                    key={sub.id}
                    className="rounded-xl border border-border bg-muted/15 px-3 py-2.5 flex items-start gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {money(sub.amount)}/month · Next {sub.nextBillingDate} ({formatWhen(sub.nextBillingDate)})
                      </p>
                      {d <= (sub.reminderDays ?? 3) && (
                        <Badge variant="outline" className="mt-1.5 text-[10px] h-5 border-amber-500/40 text-amber-400">
                          Reminder on
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markSubPaid(sub)}>
                      Mark paid
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSub(sub)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => remove("subscription", sub.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
