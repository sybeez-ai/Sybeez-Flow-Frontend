import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Plus,
  RefreshCw,
  Trash2,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CURRENCIES,
  CurrencyInfo,
  currencyService,
} from "@/services/currencyService";

interface BasketItem {
  id: string;
  amount: string;
  code: string;
}

function CurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = currencyService.getCurrency(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span>{current.code}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 max-h-72 w-60 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
            {CURRENCIES.map((c: CurrencyInfo) => (
              <button
                key={c.code}
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="font-medium">{c.code}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {c.name}
                </span>
                {c.code === value && <Check className="h-4 w-4 text-foreground" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CurrencyConverter = () => {
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState(currencyService.getBaseCurrency());
  const [updatedAt, setUpdatedAt] = useState(currencyService.getUpdatedAt());
  const [refreshing, setRefreshing] = useState(false);

  // Multi-currency basket (add several amounts, get one converted total).
  const [basket, setBasket] = useState<BasketItem[]>([
    { id: "1", amount: "", code: "USD" },
    { id: "2", amount: "", code: "EUR" },
  ]);
  const [basketTarget, setBasketTarget] = useState(currencyService.getBaseCurrency());

  useEffect(() => {
    currencyService.refresh().then(() => setUpdatedAt(currencyService.getUpdatedAt()));
    return currencyService.subscribe(() => setUpdatedAt(currencyService.getUpdatedAt()));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await currencyService.refresh();
    setUpdatedAt(currencyService.getUpdatedAt());
    setRefreshing(false);
  };

  const converted = useMemo(() => {
    const n = parseFloat(amount) || 0;
    return currencyService.convert(n, from, to);
  }, [amount, from, to]);

  const rateLine = useMemo(() => {
    const one = currencyService.convert(1, from, to);
    return `1 ${from} = ${currencyService.format(one, to)}`;
  }, [from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const basketTotal = useMemo(() => {
    return basket.reduce((sum, item) => {
      const n = parseFloat(item.amount) || 0;
      return sum + currencyService.convert(n, item.code, basketTarget);
    }, 0);
  }, [basket, basketTarget]);

  const addBasketRow = () =>
    setBasket((b) => [
      ...b,
      { id: `${Date.now()}`, amount: "", code: "USD" },
    ]);

  const updateRow = (id: string, patch: Partial<BasketItem>) =>
    setBasket((b) => b.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeRow = (id: string) =>
    setBasket((b) => (b.length > 1 ? b.filter((it) => it.id !== id) : b));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Converter card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <ArrowRightLeft className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Currency Converter</h3>
              <p className="text-[11px] text-muted-foreground">
                {updatedAt
                  ? `Live rates · updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Using offline rates"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={refresh} title="Refresh rates">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="space-y-3">
          {/* From */}
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">From</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 flex-1 border-0 bg-transparent px-0 text-2xl font-bold focus-visible:ring-0"
                placeholder="0"
              />
              <CurrencySelect value={from} onChange={setFrom} />
            </div>
          </div>

          {/* Swap */}
          <div className="flex justify-center">
            <button
              onClick={swap}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
              title="Swap"
            >
              <ArrowRightLeft className="h-4 w-4 rotate-90" />
            </button>
          </div>

          {/* To */}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">To</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-bold">
                {currencyService.format(converted, to)}
              </div>
              <CurrencySelect value={to} onChange={setTo} />
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">{rateLine}</p>
        </div>
      </div>

      {/* Multi-currency calculator */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Multi-Currency Total</h3>
            <p className="text-[11px] text-muted-foreground">
              Add amounts in any currency — get one converted total.
            </p>
          </div>
          <CurrencySelect value={basketTarget} onChange={setBasketTarget} />
        </div>

        <div className="space-y-2">
          {basket.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Input
                type="number"
                value={item.amount}
                onChange={(e) => updateRow(item.id, { amount: e.target.value })}
                placeholder="0.00"
                className="h-10 flex-1"
              />
              <CurrencySelect
                value={item.code}
                onChange={(code) => updateRow(item.id, { code })}
              />
              <button
                onClick={() => removeRow(item.id)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={addBasketRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add currency
        </Button>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-bold">
            {currencyService.format(basketTotal, basketTarget)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CurrencyConverter;
