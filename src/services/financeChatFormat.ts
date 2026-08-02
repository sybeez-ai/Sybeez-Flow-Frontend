/**
 * Convert finance snapshot / agent JSON into a friendly chat reply.
 * Never show raw JSON in the Finance Assistant UI.
 * Uses Markdown so the chat panel can render bold headings + spacing.
 */

function money(n: unknown, currency = "EUR"): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  const amount = Number.isFinite(v) ? v : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `€${amount.toFixed(2)}`;
  }
}

function isFinanceSnapshot(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return Boolean(
    o.thisMonth ||
      o.totals ||
      o.savingsItems ||
      o.currency ||
      o.asOf ||
      o.recentTransactions ||
      o.emiMonthly ||
      o.portfolio,
  );
}

export function formatFinanceOverview(snap: Record<string, unknown>): string {
  const nested = snap.financeSnapshot;
  const data =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : snap;

  const currency = String(data.currency || "EUR");
  const month = (data.thisMonth || {}) as Record<string, unknown>;
  const totals = (data.totals || {}) as Record<string, unknown>;
  const savingsItems = Array.isArray(data.savingsItems) ? data.savingsItems : [];
  const emis = Array.isArray(data.emis) ? data.emis : [];
  const upcoming = Array.isArray(data.upcomingPayments) ? data.upcomingPayments : [];

  const portfolio = (data.portfolio || {}) as Record<string, unknown>;
  const holdings = Array.isArray(portfolio.stocks) ? portfolio.stocks : [];
  const label = String(month.label || month.key || "This month");

  const lines: string[] = [];
  lines.push("I'm **Sybeez Flow** — here's a clear look at your **Finance Manager**.");
  lines.push("");
  lines.push("```mindmap");
  lines.push("Finance overview");
  lines.push(`  ${label}`);
  lines.push("  Savings");
  lines.push("  Bills & EMIs");
  lines.push("  Investments");
  lines.push("  Net position");
  lines.push("```");
  lines.push("");

  lines.push(`## 📅 ${label}`);
  lines.push("");
  lines.push(
    `- 💰 **In:** ${money(month.income, currency)}`,
  );
  lines.push(`- 💸 **Out:** ${money(month.expense, currency)}`);
  lines.push(`- ✅ **Balance:** ${money(month.balance, currency)}`);
  if (month.transactionCount != null) {
    lines.push(`- 🧾 **${month.transactionCount}** transactions logged`);
  }
  lines.push("");

  lines.push("## 🏦 Savings");
  lines.push("");
  lines.push(`- **Total:** ${money(totals.savings, currency)}`);
  if (savingsItems.length) {
    for (const raw of savingsItems.slice(0, 6)) {
      const s = raw as Record<string, unknown>;
      lines.push(
        `- 💵 **${s.name || "Account"}:** ${money(s.principal, currency)}${s.kind ? ` (${s.kind})` : ""}`,
      );
    }
  } else {
    lines.push("- No savings items yet");
  }
  lines.push("");

  lines.push("## 📄 Bills & EMIs");
  lines.push("");
  lines.push(
    `- **Monthly EMI:** ${money(totals.emiMonthly, currency)}`,
  );
  lines.push(`- **Remaining:** ${money(totals.emiRemainingBalance, currency)}`);
  for (const raw of emis.slice(0, 6)) {
    const e = raw as Record<string, unknown>;
    const bits = [`**${e.name || "Loan"}**`, `${money(e.monthlyAmount, currency)}/mo`];
    if (e.remainingMonths != null) bits.push(`${e.remainingMonths} months left`);
    if (e.nextPaymentDate) bits.push(`next ${e.nextPaymentDate}`);
    lines.push(`- 📆 ${bits.join(" · ")}`);
  }
  if (totals.subscriptionsMonthly != null) {
    lines.push(`- 🔁 **Subscriptions (~monthly):** ${money(totals.subscriptionsMonthly, currency)}`);
  }
  if (totals.insuranceYearly != null) {
    lines.push(`- 🛡️ **Insurance (yearly):** ${money(totals.insuranceYearly, currency)}`);
  }
  lines.push("");

  lines.push("## 📈 Investment portfolio");
  lines.push("");
  if (holdings.length) {
    lines.push(
      `- **Invested:** ${money(portfolio.total_invested ?? totals.portfolioInvested, currency)}`,
    );
    lines.push(
      `- **Current:** ${money(portfolio.total_current ?? totals.portfolioCurrent, currency)}`,
    );
    lines.push(
      `- **P&L:** ${money(portfolio.total_pl ?? totals.portfolioPl, currency)} (**${Number(portfolio.total_pl_pct ?? totals.portfolioPlPct ?? 0).toFixed(2)}%**)`,
    );
    for (const raw of holdings.slice(0, 8)) {
      const s = raw as Record<string, unknown>;
      const cur = String(s.currency || currency);
      lines.push(
        `- 📊 **${s.symbol || s.name}:** qty ${s.qty} @ ${money(s.price, cur)} · value ${money(s.current_value, cur)} · P&L ${money(s.pl, cur)} (${Number(s.pl_pct || 0).toFixed(2)}%)`,
      );
    }
  } else {
    lines.push("- No holdings in Investment Hub yet — add stocks to track live P&L.");
  }
  lines.push("");

  lines.push("## 🧮 Net position");
  lines.push("");
  const assets =
    (Number(totals.assets) || 0) +
    (Number(totals.savings) || 0) +
    (Number(totals.portfolioCurrent) || Number(portfolio.total_current) || 0);
  lines.push(`- **Assets / savings / portfolio:** ${money(assets, currency)}`);
  lines.push(`- **Liabilities:** ${money(totals.liabilities, currency)}`);
  lines.push(`- ✅ **Approx. net worth:** ${money(totals.netWorthApprox, currency)}`);

  if (upcoming.length) {
    lines.push("");
    lines.push("## ⏰ Coming up");
    lines.push("");
    for (const raw of upcoming.slice(0, 5)) {
      const p = raw as Record<string, unknown>;
      lines.push(
        `- ${p.type || "Payment"}: **${p.name}** · ${money(p.amount, currency)} on ${p.date}`,
      );
    }
  }

  lines.push("");
  lines.push("## 💡 Next steps");
  lines.push("");
  lines.push("- Ask about portfolio, savings, EMIs, bills, In & Out, or market news.");
  return lines.join("\n");
}

/** Friendly reply when the user asks specifically about investments / portfolio. */
export function formatPortfolioOverview(snap: Record<string, unknown>): string {
  const nested = snap.financeSnapshot;
  const data =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : snap;
  const currency = String(data.currency || "EUR");
  const portfolio = (data.portfolio || snap.portfolio || {}) as Record<string, unknown>;
  const holdings = Array.isArray(portfolio.stocks) ? portfolio.stocks : [];
  if (!holdings.length) {
    return (
      "I'm **Sybeez Flow** — happy to help with your investments.\n\n" +
      "## 📈 Your portfolio\n\n" +
      "Your Investment Hub is empty right now.\n\n" +
      "- 💡 Add stocks under **Investments** and I’ll track live prices, P&L, and market context for you."
    );
  }
  const lines: string[] = [
    "I'm **Sybeez Flow** — here's your **live portfolio** at a glance.",
    "",
    "```mindmap",
    "Your portfolio",
    "  Value",
    "  P&L",
    "  Holdings",
    "```",
    "",
    "## 📈 Portfolio summary",
    "",
    `- 💰 **Invested:** ${money(portfolio.total_invested, currency)}`,
    `- 📊 **Current value:** ${money(portfolio.total_current, currency)}`,
    `- ✅ **P&L:** ${money(portfolio.total_pl, currency)} (**${Number(portfolio.total_pl_pct || 0).toFixed(2)}%**)`,
    "",
    "## 📌 Holdings",
    "",
  ];
  for (const raw of holdings.slice(0, 20)) {
    const s = raw as Record<string, unknown>;
    const cur = String(s.currency || currency);
    lines.push(
      `- **${s.symbol}**${s.name ? ` (${s.name})` : ""} — ${s.qty} shares · avg ${money(s.avg_buy_price, cur)} · now ${money(s.price, cur)} · value ${money(s.current_value, cur)} · P&L ${money(s.pl, cur)} (${Number(s.pl_pct || 0).toFixed(2)}%) · day ${Number(s.change_pct || 0).toFixed(2)}%`,
    );
  }
  lines.push("");
  lines.push("## 💡 Next steps");
  lines.push("");
  lines.push("- Ask about a ticker, allocation, or today’s market news.");
  return lines.join("\n");
}

/** If assistant text is raw JSON / snapshot, convert to friendly chat. */
export function sanitizeAssistantText(
  text: string,
  financeSnapshot?: unknown,
): string {
  const raw = (text || "").trim();
  if (!raw) {
    if (isFinanceSnapshot(financeSnapshot)) {
      return formatFinanceOverview(financeSnapshot as Record<string, unknown>);
    }
    return "I've got your finance data loaded. What would you like to know?";
  }

  let candidate = raw;
  // Only unwrap JSON fences — never strip ```mindmap``` or other code blocks
  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();

  const looksJson =
    candidate.startsWith("{") ||
    candidate.startsWith("[") ||
    (candidate.includes('"thisMonth"') && candidate.includes('"totals"')) ||
    (candidate.includes('"reply"') && candidate.includes('"actions"'));

  if (!looksJson) {
    // Never show search-provider branding in the chat UI
    return raw
      .replace(/\bTavily\s+summary\b/gi, "Market research")
      .replace(/\bTavily\b/gi, "market research")
      .replace(/\bSerpAPI\b/gi, "web search");
  }

  try {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) {
      if (isFinanceSnapshot(financeSnapshot)) {
        return formatFinanceOverview(financeSnapshot as Record<string, unknown>);
      }
      return raw;
    }
    const parsed = JSON.parse(candidate.slice(start, end + 1));

    if (isFinanceSnapshot(parsed)) {
      return formatFinanceOverview(parsed);
    }
    if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
      const inner = parsed.reply.trim();
      if (inner.startsWith("{")) return sanitizeAssistantText(inner, financeSnapshot);
      return inner;
    }
    if (parsed && isFinanceSnapshot(parsed.reply)) {
      return formatFinanceOverview(parsed.reply);
    }
    if (isFinanceSnapshot(financeSnapshot)) {
      return formatFinanceOverview(financeSnapshot as Record<string, unknown>);
    }
  } catch {
    if (isFinanceSnapshot(financeSnapshot)) {
      return formatFinanceOverview(financeSnapshot as Record<string, unknown>);
    }
  }

  return (
    "I've loaded your Finance Manager. Ask me about savings, EMIs, bills, or this month's In & Out."
  );
}
