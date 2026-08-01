import { useEffect, useState } from "react";
import { currencyService } from "@/services/currencyService";
import {
  appCurrencyCode,
  appCurrencySymbol,
  formatAppMoney,
} from "@/services/regionService";

/** Subscribe to app currency so Finance UIs re-render when it changes. */
export function useAppCurrency() {
  const [code, setCode] = useState(() => appCurrencyCode());

  useEffect(() => {
    setCode(appCurrencyCode());
    return currencyService.subscribe(() => {
      setCode(appCurrencyCode());
    });
  }, []);

  return {
    code,
    symbol: currencyService.getCurrency(code).symbol || appCurrencySymbol(),
    format: (amount: number) => currencyService.format(amount || 0, code),
    formatApp: formatAppMoney,
  };
}
