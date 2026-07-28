/**
 * Daily In & Out — month folders.
 * Create June / July folders → open folder → add In & Out transactions inside.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Plus,
  Folder,
  FolderPlus,
  FolderOpen,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LifeManagementService } from "@/services/lifeManagement";
import { DATA_CHANGED_EVENT } from "@/services/persistSync";
import type { Transaction } from "@/types/lifeManagement";
import { formatAppMoney } from "@/services/regionService";
import { cn } from "@/lib/utils";

const FOLDERS_KEY = "sybeez_inout_month_folders";

type ViewMode = "folders" | "inside";
type AddKind = "income" | "expense" | null;
type ListFilter = "all" | "6m" | "1y";

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string, long = false): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: long ? "long" : "short",
    year: "numeric",
  });
}

function monthOptions(past = 36, future = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + future);
  for (let i = 0; i < past + future + 1; i++) {
    out.push(ym(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function clampDateToMonth(dateStr: string, monthKey: string): string {
  const day = Math.min(
    28,
    Math.max(1, parseInt((dateStr || "").slice(8, 10) || "15", 10) || 15),
  );
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthKey}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

function defaultDateForMonth(monthKey: string): string {
  const now = new Date();
  if (monthKey === ym(now)) return now.toISOString().split("T")[0];
  return `${monthKey}-15`;
}

function money(n: number): string {
  return formatAppMoney(n || 0);
}

function readFolders(): string[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeFolders(keys: string[]) {
  const unique = Array.from(new Set(keys)).sort((a, b) => b.localeCompare(a));
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(unique));
  return unique;
}

type FolderRow = {
  key: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
};

export default function DailyInOutHub() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [folders, setFolders] = useState<string[]>(() => {
    const saved = readFolders();
    const current = ym(new Date());
    if (!saved.includes(current)) {
      return writeFolders([...saved, current]);
    }
    return saved;
  });
  const [view, setView] = useState<ViewMode>("folders");
  const [openMonth, setOpenMonth] = useState(ym(new Date()));
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderPick, setNewFolderPick] = useState(ym(new Date()));
  const [addKind, setAddKind] = useState<AddKind>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(defaultDateForMonth(ym(new Date())));

  const pickableMonths = useMemo(() => monthOptions(36, 6), []);

  const reload = useCallback(() => {
    const data = LifeManagementService.getData();
    const list = [...(data.transactions || [])].sort((a, b) =>
      (b.date || "").localeCompare(a.date || ""),
    );
    setTransactions(list);

    // Auto-register folders for months that already have transactions
    const keysFromTx = new Set(
      list.map((t) => (t.date || "").slice(0, 7)).filter((k) => k.length === 7),
    );
    if (keysFromTx.size) {
      setFolders((prev) => {
        const next = writeFolders([...prev, ...keysFromTx]);
        return next;
      });
    }
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

  const folderRows: FolderRow[] = useMemo(() => {
    const stats = new Map<string, FolderRow>();
    for (const key of folders) {
      stats.set(key, { key, income: 0, expense: 0, balance: 0, count: 0 });
    }
    for (const t of transactions) {
      const key = (t.date || "").slice(0, 7);
      if (!key || key.length < 7) continue;
      if (!stats.has(key)) {
        stats.set(key, { key, income: 0, expense: 0, balance: 0, count: 0 });
      }
      const row = stats.get(key)!;
      const a = Number(t.amount) || 0;
      if (t.type === "income") row.income += a;
      else row.expense += a;
      row.count += 1;
      row.balance = row.income - row.expense;
    }

    let rows = Array.from(stats.values()).sort((a, b) => b.key.localeCompare(a.key));

    if (listFilter === "6m" || listFilter === "1y") {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (listFilter === "6m" ? 5 : 11));
      const start = ym(d);
      const end = ym(new Date());
      rows = rows.filter((r) => r.key >= start && r.key <= end);
    }

    return rows;
  }, [folders, transactions, listFilter]);

  const monthTxns = useMemo(
    () =>
      transactions
        .filter((t) => (t.date || "").startsWith(openMonth))
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [transactions, openMonth],
  );

  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of monthTxns) {
      const a = Number(t.amount) || 0;
      if (t.type === "income") income += a;
      else expense += a;
    }
    return { income, expense, balance: income - expense, count: monthTxns.length };
  }, [monthTxns]);

  const openFolder = (key: string) => {
    setFolders((prev) => writeFolders([...prev, key]));
    setOpenMonth(key);
    setView("inside");
    setAddKind(null);
    setShowNewFolder(false);
    setEntryDate(defaultDateForMonth(key));
  };

  const createFolder = () => {
    if (folders.includes(newFolderPick)) {
      toast.message(`${monthLabel(newFolderPick, true)} folder already exists`);
      openFolder(newFolderPick);
      return;
    }
    setFolders((prev) => writeFolders([...prev, newFolderPick]));
    toast.success(`Folder created: ${monthLabel(newFolderPick, true)}`);
    openFolder(newFolderPick);
  };

  const removeFolder = (key: string, e: MouseEvent) => {
    e.stopPropagation();
    const hasTx = transactions.some((t) => (t.date || "").startsWith(key));
    if (hasTx) {
      toast.error("Remove all transactions in this folder first");
      return;
    }
    setFolders((prev) => writeFolders(prev.filter((k) => k !== key)));
    toast.success("Folder removed");
  };

  const resetForm = () => {
    setAddKind(null);
    setEditingId(null);
    setDescription("");
    setAmount("");
    setEntryDate(defaultDateForMonth(openMonth));
  };

  const openAdd = (kind: "income" | "expense") => {
    setEditingId(null);
    setAddKind(kind);
    setDescription("");
    setAmount("");
    setEntryDate(defaultDateForMonth(openMonth));
  };

  const openEdit = (t: Transaction) => {
    setEditingId(t.id);
    setAddKind(t.type === "income" ? "income" : "expense");
    setDescription(t.description || "");
    setAmount(String(t.amount ?? ""));
    setEntryDate(clampDateToMonth(t.date || defaultDateForMonth(openMonth), openMonth));
  };

  const handleSave = () => {
    if (!addKind) return;
    if (!description.trim() || !amount) {
      toast.error("Enter description and amount");
      return;
    }
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const date = clampDateToMonth(
      entryDate || defaultDateForMonth(openMonth),
      openMonth,
    );
    const type = addKind === "income" ? "income" : "expense";
    const payload = {
      description: description.trim(),
      amount: value,
      type: type as Transaction["type"],
      category: type,
      date,
    };

    if (editingId) {
      LifeManagementService.updateTransaction(editingId, payload);
      toast.success("Transaction updated");
    } else {
      LifeManagementService.addTransaction({
        id: `txn-${Date.now()}`,
        ...payload,
      });
      toast.success(
        `${type === "income" ? "In" : "Out"} added in ${monthLabel(openMonth)} folder`,
      );
    }

    setFolders((prev) => writeFolders([...prev, openMonth]));
    resetForm();
    reload();
  };

  const handleDelete = (id: string) => {
    if (editingId === id) resetForm();
    LifeManagementService.deleteTransaction(id);
    toast.success("Removed");
    reload();
  };

  /* ── Folder list ───────────────────────────────────────────── */
  if (view === "folders") {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Month folders</p>
              <p className="text-[11px] text-muted-foreground">
                Create June, July… then open and add In / Out
              </p>
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setNewFolderPick(ym(new Date()));
                setShowNewFolder(true);
              }}
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1" />
              New folder
            </Button>
          </div>

          <div className="flex gap-1">
            {(
              [
                { id: "all" as const, label: "All" },
                { id: "6m" as const, label: "6 months" },
                { id: "1y" as const, label: "1 year" },
              ] as const
            ).map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={listFilter === f.id ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setListFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {showNewFolder && (
            <div className="rounded-xl border border-border bg-muted/25 p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <FolderPlus className="h-3.5 w-3.5" />
                Create month folder
              </p>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={newFolderPick}
                onChange={(e) => setNewFolderPick(e.target.value)}
              >
                {pickableMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m, true)}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={createFolder}>
                  Create {monthLabel(newFolderPick)} folder
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewFolder(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
          {folderRows.length === 0 ? (
            <div className="py-12 text-center">
              <Folder className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No month folders yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a June or July folder to start
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => {
                  setNewFolderPick(ym(new Date()));
                  setShowNewFolder(true);
                }}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1" />
                New folder
              </Button>
            </div>
          ) : (
            folderRows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => openFolder(row.key)}
                className="w-full rounded-xl border border-border bg-muted/15 px-3 py-3 text-left hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <Folder className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {monthLabel(row.key, true)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.count === 0
                        ? "Empty folder — open to add In / Out"
                        : `${row.count} transaction${row.count === 1 ? "" : "s"}`}
                    </p>
                    <div className="flex gap-3 mt-1 text-[11px]">
                      <span className="text-emerald-400">In {money(row.income)}</span>
                      <span className="text-rose-400">Out {money(row.expense)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {row.count === 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={(e) => removeFolder(row.key, e)}
                        title="Remove empty folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  /* ── Inside a month folder ─────────────────────────────────── */
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-border space-y-2.5">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => {
              setView("folders");
              resetForm();
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" />
            Folders
          </Button>
          <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="h-4 w-4 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {monthLabel(openMonth, true)} folder
            </p>
            <p className="text-[11px] text-muted-foreground">
              Add In and Out inside this month
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="outline" className="h-8" onClick={() => openAdd("income")}>
              <ArrowDownCircle className="h-3.5 w-3.5 mr-1" />
              In
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => openAdd("expense")}>
              <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
              Out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
            <p className="text-[10px] uppercase text-emerald-400/80">In</p>
            <p className="text-sm font-semibold text-emerald-400 tabular-nums">
              {money(monthTotals.income)}
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2">
            <p className="text-[10px] uppercase text-rose-400/80">Out</p>
            <p className="text-sm font-semibold text-rose-400 tabular-nums">
              {money(monthTotals.expense)}
            </p>
          </div>
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2">
            <p className="text-[10px] uppercase text-sky-400/80">Balance</p>
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                monthTotals.balance >= 0 ? "text-sky-400" : "text-rose-400",
              )}
            >
              {money(monthTotals.balance)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {addKind && (
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">
                {editingId ? "Edit" : "Add"} {addKind === "income" ? "In" : "Out"} →{" "}
                {monthLabel(openMonth, true)} folder
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={addKind === "income" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setAddKind("income")}
                >
                  In
                </Button>
                <Button
                  size="sm"
                  variant={addKind === "expense" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setAddKind("expense")}
                >
                  Out
                </Button>
              </div>
            </div>
            <Input
              className="h-9"
              placeholder="Description / note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="h-9"
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input
                className="h-9"
                type="date"
                value={entryDate}
                onChange={(e) =>
                  setEntryDate(clampDateToMonth(e.target.value, openMonth))
                }
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleSave}>
                {editingId ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Update
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Save in folder
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Transactions in this folder
          </p>

          {monthTxns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <FolderOpen className="h-8 w-8 mx-auto text-amber-400/50 mb-2" />
              <p className="text-sm font-medium">
                {monthLabel(openMonth, true)} folder is empty
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Add In or Out for this month
              </p>
              <div className="flex justify-center gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => openAdd("income")}>
                  Add In
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAdd("expense")}>
                  Add Out
                </Button>
              </div>
            </div>
          ) : (
            monthTxns.map((t, index) => (
              <div
                key={t.id}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/15 px-3 py-2.5"
              >
                <div className="pt-0.5 flex-shrink-0">
                  {t.type === "income" ? (
                    <ArrowDownCircle className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4 text-rose-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    #{monthTxns.length - index} · {t.date}
                  </p>
                  <p className="text-sm font-medium truncate mt-0.5">{t.description}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.type === "income" ? "In" : "Out"}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "tabular-nums",
                      t.type === "income" ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {money(Number(t.amount) || 0)}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-7 w-7 text-muted-foreground hover:text-foreground",
                      editingId === t.id && "text-foreground bg-muted",
                    )}
                    title="Edit"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
