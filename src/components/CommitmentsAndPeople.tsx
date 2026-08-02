/**
 * Commitments — rent / utilities, money to give, money to collect.
 * One Add flow; pick the type inside the form.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Plus, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeManagementService } from "@/services/lifeManagement";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import type { Bill, PeopleMoneyItem } from "@/types/lifeManagement";
import { formatAppMoney, appCurrencySymbol } from "@/services/regionService";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { cn } from "@/lib/utils";

type CommitType = "utility" | "owe" | "collect";

const COMMITMENT_CATEGORIES: { value: Bill["category"]; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "electricity", label: "Electricity" },
  { value: "water", label: "Water" },
  { value: "gas", label: "Gas" },
  { value: "internet", label: "Internet" },
  { value: "phone", label: "Phone" },
  { value: "other", label: "Other utility" },
];

const TYPE_OPTIONS: { value: CommitType; label: string; hint: string }[] = [
  { value: "utility", label: "Rent / utility", hint: "Monthly bill" },
  { value: "owe", label: "Money to give", hint: "You pay someone" },
  { value: "collect", label: "Money to collect", hint: "Someone pays you" },
];

function money(n: number) {
  return formatAppMoney(n || 0);
}

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function clampDueDay(n: number) {
  return Math.min(31, Math.max(1, Math.round(Number(n) || 1)));
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

function addMonths(dateStr: string, months: number): string {
  const d = new Date((dateStr || toISODate(new Date())) + "T00:00:00");
  d.setMonth(d.getMonth() + Math.max(0, months));
  return toISODate(d);
}

function emptyForm() {
  return {
    commitType: "utility" as CommitType,
    name: "",
    amount: "",
    category: "rent" as Bill["category"],
    dueDay: String(new Date().getDate()),
    provider: "",
    personName: "",
    principal: "",
    interestRate: "",
    interestOnlyMonths: "0",
    monthlyInterest: "",
    notes: "",
    reminderDays: "7",
  };
}

function monthlyInterestFromRate(principal: number, annualPct: number) {
  if (!principal || !annualPct) return 0;
  return Math.round(((principal * annualPct) / 100 / 12) * 100) / 100;
}

type ListItem =
  | { kind: "utility"; bill: Bill }
  | { kind: "people"; item: PeopleMoneyItem };

export default function CommitmentsAndPeople() {
  useAppCurrency();
  const [bills, setBills] = useState<Bill[]>([]);
  const [people, setPeople] = useState<PeopleMoneyItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const reload = useCallback(() => {
    const data = LifeManagementService.getData();
    setBills((data.bills || []).filter((b) => b.category !== "tax"));
    setPeople((data.peopleMoney || []).filter((p) => p.status === "open"));
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

  const list: ListItem[] = useMemo(() => {
    const utilities = bills
      .filter((b) =>
        ["rent", "electricity", "water", "gas", "internet", "phone", "other"].includes(
          b.category,
        ),
      )
      .map((bill) => ({ kind: "utility" as const, bill }));
    const peeps = people.map((item) => ({ kind: "people" as const, item }));
    return [...utilities, ...peeps];
  }, [bills, people]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEditUtility = (bill: Bill) => {
    setEditingId(bill.id);
    setShowForm(true);
    setForm({
      ...emptyForm(),
      commitType: "utility",
      name: bill.name,
      amount: String(bill.amount),
      category: bill.category,
      dueDay: String(bill.dueDay || new Date(bill.dueDate + "T00:00:00").getDate()),
      provider: bill.provider || "",
      reminderDays: String(bill.reminderDays ?? 7),
    });
  };

  const openEditPeople = (item: PeopleMoneyItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      ...emptyForm(),
      commitType: item.direction === "owe" ? "owe" : "collect",
      personName: item.personName,
      principal: String(item.amount),
      interestRate: item.interestRate != null ? String(item.interestRate) : "",
      interestOnlyMonths: String(item.interestOnlyMonths ?? 0),
      monthlyInterest:
        item.monthlyInterest != null ? String(item.monthlyInterest) : "",
      notes: item.notes || "",
    });
  };

  const saveUtility = () => {
    if (!form.name.trim() || !form.amount) {
      toast.error("Enter name and amount");
      return;
    }
    const amount = parseFloat(form.amount);
    const dueDay = clampDueDay(parseInt(form.dueDay, 10));
    const dueDate = resolveNextDue(dueDay);
    const reminderDays = Math.max(0, parseInt(form.reminderDays, 10) || 7);
    const fields: Partial<Bill> = {
      name: form.name.trim(),
      amount,
      category: form.category,
      dueDay,
      dueDate,
      frequency: "monthly",
      provider: form.provider.trim() || undefined,
      reminderDays,
      isPaid: false,
    };
    if (editingId) {
      LifeManagementService.updateBill(editingId, fields);
      toast.success("Commitment updated");
    } else {
      LifeManagementService.addBill({
        id: `bill-${Date.now()}`,
        name: fields.name!,
        amount,
        dueDate,
        dueDay,
        frequency: "monthly",
        category: form.category,
        isPaid: false,
        reminderDays,
        provider: fields.provider,
      });
      toast.success("Commitment added");
    }
    resetForm();
    reload();
  };

  const savePeople = (direction: "owe" | "collect") => {
    if (!form.personName.trim() || !form.principal) {
      toast.error("Enter person name and amount");
      return;
    }
    const principal = parseFloat(form.principal);
    const interestRate = form.interestRate ? parseFloat(form.interestRate) : undefined;
    const interestOnlyMonths = Math.max(
      0,
      parseInt(form.interestOnlyMonths, 10) || 0,
    );
    let monthlyInterest = form.monthlyInterest
      ? parseFloat(form.monthlyInterest)
      : undefined;
    if (
      (monthlyInterest == null || !Number.isFinite(monthlyInterest)) &&
      interestRate &&
      interestOnlyMonths > 0
    ) {
      monthlyInterest = monthlyInterestFromRate(principal, interestRate);
    }
    const start = toISODate(new Date());
    const nextPaymentDate =
      interestOnlyMonths > 0 ? resolveNextDue(new Date().getDate()) : undefined;
    const fullPayDate =
      interestOnlyMonths > 0
        ? addMonths(start, interestOnlyMonths)
        : addMonths(start, 1);

    const fields: Partial<PeopleMoneyItem> = {
      personName: form.personName.trim(),
      direction,
      amount: principal,
      originalAmount: principal,
      interestRate: Number.isFinite(interestRate as number) ? interestRate : undefined,
      interestOnlyMonths: interestOnlyMonths || undefined,
      interestOnlyPaid: editingId
        ? people.find((p) => p.id === editingId)?.interestOnlyPaid || 0
        : 0,
      monthlyInterest:
        Number.isFinite(monthlyInterest as number) ? monthlyInterest : undefined,
      nextPaymentDate,
      fullPayDate,
      notes: form.notes.trim() || undefined,
      status: "open",
    };

    if (editingId) {
      LifeManagementService.updatePeopleMoney(editingId, fields);
      toast.success("Commitment updated");
    } else {
      LifeManagementService.addPeopleMoney({
        id: `pm-${Date.now()}`,
        createdAt: new Date().toISOString(),
        personName: fields.personName!,
        direction,
        amount: principal,
        originalAmount: principal,
        interestRate: fields.interestRate,
        interestOnlyMonths: fields.interestOnlyMonths,
        interestOnlyPaid: 0,
        monthlyInterest: fields.monthlyInterest,
        nextPaymentDate: fields.nextPaymentDate,
        fullPayDate: fields.fullPayDate,
        notes: fields.notes,
        status: "open",
      });
      toast.success(
        direction === "owe" ? "Added money to give" : "Added money to collect",
      );
    }
    resetForm();
    reload();
  };

  const save = () => {
    if (form.commitType === "utility") saveUtility();
    else savePeople(form.commitType);
  };

  const markCommitmentPaid = (bill: Bill) => {
    const dueDay = bill.dueDay || new Date(bill.dueDate + "T00:00:00").getDate();
    const next = addOneMonth(bill.dueDate || toISODate(new Date()), dueDay);
    LifeManagementService.updateBill(bill.id, {
      dueDate: next,
      dueDay,
      isPaid: false,
    });
    toast.success(`Paid — next due ${next}`);
    reload();
  };

  const recordInterestPayment = (item: PeopleMoneyItem) => {
    const paid = (item.interestOnlyPaid || 0) + 1;
    const total = item.interestOnlyMonths || 0;
    const dueDay = item.nextPaymentDate
      ? new Date(item.nextPaymentDate + "T00:00:00").getDate()
      : new Date().getDate();
    if (paid >= total) {
      LifeManagementService.updatePeopleMoney(item.id, {
        interestOnlyPaid: total,
        nextPaymentDate: item.fullPayDate || toISODate(new Date()),
      });
      toast.success(
        `Interest-only done — settle full ${money(item.amount)} by ${item.fullPayDate || "due date"}`,
      );
    } else {
      const next = addOneMonth(
        item.nextPaymentDate || toISODate(new Date()),
        dueDay,
      );
      LifeManagementService.updatePeopleMoney(item.id, {
        interestOnlyPaid: paid,
        nextPaymentDate: next,
      });
      toast.success(
        `Interest paid (${paid}/${total}) — next ${money(item.monthlyInterest || 0)} on ${next}`,
      );
    }
    reload();
  };

  const settlePeople = (item: PeopleMoneyItem) => {
    LifeManagementService.updatePeopleMoney(item.id, {
      status: "settled",
      amount: 0,
    });
    toast.success(
      item.direction === "owe"
        ? `Settled — paid ${item.personName} in full`
        : `Settled — collected from ${item.personName}`,
    );
    reload();
  };

  const removeUtility = (id: string) => {
    if (editingId === id) resetForm();
    LifeManagementService.deleteBill(id);
    toast.success("Removed");
    reload();
  };

  const removePeople = (id: string) => {
    if (editingId === id) resetForm();
    LifeManagementService.deletePeopleMoney(id);
    toast.success("Removed");
    reload();
  };

  return (
    <Card className="border-border bg-background">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Home className="h-4 w-4" />
            Commitments
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Rent &amp; utilities, money to give (counts as a liability), and money to collect (counts as an asset) — all flow into Net Worth automatically.
        </p>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {showForm && (
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-medium">
              {editingId ? "Edit commitment" : "Add commitment"}
            </p>

            {/* Type picker */}
            <div className="grid grid-cols-3 gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!!editingId && form.commitType !== opt.value}
                  onClick={() => setForm({ ...form, commitType: opt.value })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left transition-colors",
                    form.commitType === opt.value
                      ? "border-foreground/40 bg-foreground/10"
                      : "border-border bg-background hover:bg-muted/40",
                    editingId && form.commitType !== opt.value && "opacity-40",
                  )}
                >
                  <p className="text-[11px] font-semibold leading-tight">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{opt.hint}</p>
                </button>
              ))}
            </div>

            {form.commitType === "utility" ? (
              <>
                <Input
                  placeholder="Name (e.g. Flat rent)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value as Bill["category"],
                      })
                    }
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {COMMITMENT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Amount (${appCurrencySymbol()})`}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Due day (1–31)"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  />
                  <Input
                    placeholder="Provider / landlord"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <Input
                  placeholder="Person name"
                  value={form.personName}
                  onChange={(e) => setForm({ ...form, personName: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Amount (${appCurrencySymbol()})`}
                    value={form.principal}
                    onChange={(e) => setForm({ ...form, principal: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Interest % p.a. (optional)"
                    value={form.interestRate}
                    onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Interest-only months"
                    value={form.interestOnlyMonths}
                    onChange={(e) =>
                      setForm({ ...form, interestOnlyMonths: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Monthly interest (${appCurrencySymbol()})`}
                    value={form.monthlyInterest}
                    onChange={(e) =>
                      setForm({ ...form, monthlyInterest: e.target.value })
                    }
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Optional: pay interest only for a few months, then settle the full amount.
                </p>
                <Input
                  placeholder="Notes (optional)"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </>
            )}

            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={save}>
                {editingId ? "Update" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {list.length === 0 && !showForm ? (
          <p className="text-xs text-muted-foreground text-center py-5">
            No commitments yet — add rent, a utility, money to give, or money to collect
          </p>
        ) : (
          list.map((row) => {
            if (row.kind === "utility") {
              const bill = row.bill;
              const dueDay =
                bill.dueDay ||
                new Date((bill.dueDate || toISODate(new Date())) + "T00:00:00").getDate();
              const next = resolveNextDue(dueDay, bill.dueDate);
              const label =
                COMMITMENT_CATEGORIES.find((c) => c.value === bill.category)?.label ||
                bill.category;
              return (
                <div
                  key={bill.id}
                  className="rounded-xl border border-border bg-muted/15 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{bill.name}</p>
                        <span className="text-[10px] uppercase tracking-wide rounded-md border border-border px-1.5 py-0.5 text-muted-foreground">
                          {label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {bill.provider ? `${bill.provider} · ` : ""}due {next}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEditUtility(bill)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeUtility(bill.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold tabular-nums">{money(bill.amount)}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markCommitmentPaid(bill)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Mark paid
                    </Button>
                  </div>
                </div>
              );
            }

            const item = row.item;
            const onlyTotal = item.interestOnlyMonths || 0;
            const onlyPaid = item.interestOnlyPaid || 0;
            const inInterestPhase = onlyTotal > 0 && onlyPaid < onlyTotal;
            const tag =
              item.direction === "owe" ? "Money to give" : "Money to collect";

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-muted/15 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{item.personName}</p>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide rounded-md border px-1.5 py-0.5",
                          item.direction === "owe"
                            ? "border-rose-500/30 text-rose-300"
                            : "border-emerald-500/30 text-emerald-300",
                        )}
                      >
                        {tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Principal {money(item.amount)}
                      {item.interestRate != null ? ` · ${item.interestRate}% p.a.` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEditPeople(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removePeople(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {onlyTotal > 0 && (
                  <div
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-[11px]",
                      inInterestPhase
                        ? "border-amber-500/30 bg-amber-500/10"
                        : "border-emerald-500/30 bg-emerald-500/10",
                    )}
                  >
                    {inInterestPhase ? (
                      <>
                        Interest-only · {onlyPaid}/{onlyTotal} months
                        {item.monthlyInterest != null && (
                          <span className="font-medium">
                            {" "}
                            · {money(item.monthlyInterest)} / month
                          </span>
                        )}
                        {item.nextPaymentDate && (
                          <span className="text-muted-foreground">
                            {" "}
                            · next {item.nextPaymentDate}
                          </span>
                        )}
                        <div className="mt-1 text-muted-foreground">
                          Full {money(item.amount)} after interest period
                          {item.fullPayDate ? ` (${item.fullPayDate})` : ""}
                        </div>
                      </>
                    ) : (
                      <>
                        Interest done — settle full{" "}
                        <span className="font-semibold">{money(item.amount)}</span>
                        {item.fullPayDate ? ` by ${item.fullPayDate}` : ""}
                      </>
                    )}
                  </div>
                )}

                {item.notes && (
                  <p className="text-[11px] text-muted-foreground">{item.notes}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {inInterestPhase && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => recordInterestPayment(item)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Paid interest
                    </Button>
                  )}
                  <Button size="sm" onClick={() => settlePeople(item)}>
                    <Check className="h-3 w-3 mr-1" />
                    {item.direction === "owe" ? "Paid in full" : "Collected in full"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
