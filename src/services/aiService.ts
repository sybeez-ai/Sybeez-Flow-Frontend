import { authHeaders } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";
/**
 * Unified AI Service
 * Single entry point for all AI features across the app (Finance + Life Planner).
 *
 * Routes through the FastAPI `/api/chat` LangGraph endpoint and gracefully
 * falls back to Perplexity (client-side) if the backend is unreachable.
 */

import { searchWithPerplexity, PerplexityMessage } from "@/services/perplexity";
import { applyAgentActions, type AgentAction } from "@/services/agentActions";
import {
  sanitizeAssistantText,
  formatFinanceOverview,
  formatPortfolioOverview,
} from "@/services/financeChatFormat";

const API_URL = getApiBase();

export interface AIAskOptions {
  /** A system prompt describing the assistant's role. */
  system?: string;
  /** Prior turns of conversation for multi-turn context. */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Arbitrary structured context passed to the backend agent. */
  context?: Record<string, unknown>;
  /** Stable session id so the backend keeps conversation memory. */
  sessionId?: string;
  /** Allow the backend to use live web search. Default false for app features. */
  useWebSearch?: boolean;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** When true (default), apply LangGraph write actions to localStorage. */
  applyActions?: boolean;
}

export interface AIAskResult {
  text: string;
  actions: AgentAction[];
  intent?: string;
}

const DEFAULT_SESSION = "app-assistant";

function wantsFinanceOverview(prompt: string): boolean {
  return /\b(complete finance|full finance|finance manager|overview|explain|summary|everything|all my (money|finance)|know my finance|my finances|whole finance)\b/i.test(
    prompt,
  );
}

function wantsPortfolioOverview(prompt: string): boolean {
  return /\b(my portfolio|portfolio (doing|status|overview|summary)|how (is|are) my (stocks|holdings|investments)|show (my )?(portfolio|holdings|stocks)|what('?s| is) in my portfolio)\b/i.test(
    prompt,
  );
}

/** These need backend finance_intel charts — never short-circuit on the client. */
function wantsInvestmentAnalytics(prompt: string): boolean {
  return /\b(analytics|charts?|live analytics|past performance|performance report|projection|look like|forecast|6 months|investments with)\b/i.test(
    prompt,
  );
}

/** Pull the assistant text out of the backend's `format_response` envelope. */
function extractBackendText(payload: any, financeSnapshot?: unknown): string | null {
  if (!payload) return null;
  const data = payload.data ?? payload;
  let text =
    data.response ||
    data.message ||
    data.text ||
    (typeof data === "string" ? data : null);
  if (typeof text !== "string") return null;
  return sanitizeAssistantText(text.trim(), financeSnapshot);
}

function extractActions(payload: any): AgentAction[] {
  const data = payload?.data ?? payload;
  const actions = data?.actions;
  return Array.isArray(actions) ? actions : [];
}

/**
 * Ask the AI and return text + optional agentic actions.
 * Prefer this when the UI needs to know what was written.
 */
export async function askAIDetailed(
  prompt: string,
  options: AIAskOptions = {},
): Promise<AIAskResult> {
  const {
    system,
    history = [],
    context = {},
    sessionId = DEFAULT_SESSION,
    useWebSearch = false,
    signal,
    applyActions = true,
  } = options;

  const snap = context.financeSnapshot;
  const isFinance = context.feature === "finance";
  const enableWeb =
    useWebSearch ||
    context.enableWebSearch === true ||
    isFinance;

  // Instant overview only on a fresh thread — never skip the LLM on follow-ups
  // or when the user asked for live investment analytics / charts.
  const hasPriorTurns = Array.isArray(history) && history.length > 0;
  const wantsCharts = wantsInvestmentAnalytics(prompt);
  if (
    !hasPriorTurns &&
    !wantsCharts &&
    isFinance &&
    snap &&
    typeof snap === "object" &&
    wantsFinanceOverview(prompt)
  ) {
    const text = formatFinanceOverview(snap as Record<string, unknown>);
    return { text, actions: [], intent: "finance" };
  }
  if (
    !hasPriorTurns &&
    !wantsCharts &&
    isFinance &&
    snap &&
    typeof snap === "object" &&
    wantsPortfolioOverview(prompt)
  ) {
    const text = formatPortfolioOverview(snap as Record<string, unknown>);
    return { text, actions: [], intent: "finance" };
  }

  // Keep `message` as the user's raw text so LangGraph intent routing works.
  // System prompt + history travel in `context`. Always stamp feature when known.
  let backendAuthFailed = false;
  let backendHttpError = "";
  try {
    const featureHint =
      typeof context.feature === "string" && context.feature
        ? context.feature
        : sessionId.includes("finance")
          ? "finance"
          : sessionId.includes("productivity") || sessionId.includes("planner")
            ? "planner"
            : sessionId.includes("gmail")
              ? "gmail"
              : sessionId.includes("diary")
                ? "diary"
                : undefined;
    const res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: authHeaders(),
      signal,
      body: JSON.stringify({
        message: prompt,
        session_id: sessionId,
        context: {
          ...context,
          ...(featureHint ? { feature: featureHint } : {}),
          system,
          history,
        },
        use_voice: false,
        // Domain assistants use their own research path; don't force global web_search intent
        use_web_search: Boolean(enableWeb && !featureHint),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const text = extractBackendText(json, snap);
      const actions = extractActions(json);
      if (applyActions && actions.length) {
        applyAgentActions(actions);
      }
      if (text) {
        return {
          text: sanitizeAssistantText(text, snap),
          actions,
          intent: (json?.data ?? json)?.intent,
        };
      }
      backendHttpError = "The AI returned an empty response. Please try again.";
    } else {
      let detail = "";
      try {
        const errJson = await res.json();
        detail =
          typeof errJson?.detail === "string"
            ? errJson.detail
            : typeof errJson?.error === "string"
              ? errJson.error
              : "";
      } catch {
        /* ignore */
      }
      if (res.status === 401 || res.status === 403) {
        backendAuthFailed = true;
        return {
          text:
            detail ||
            "Your session expired. Please sign out and sign in again, then retry ASK AI.",
          actions: [],
        };
      }
      backendHttpError =
        detail || `AI service error (${res.status}). Please try again in a moment.`;
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    // fall through to Perplexity only for network failures
  }

  if (backendAuthFailed) {
    return {
      text: "Your session expired. Please sign out and sign in again, then retry ASK AI.",
      actions: [],
    };
  }

  // Fallback: client-side Perplexity (no agentic writes) — skipped in production builds
  const allowPerplexityFallback = !import.meta.env.PROD;
  if (allowPerplexityFallback) {
    try {
      const messages: PerplexityMessage[] = [];
      let systemText = system || "";
      if (snap && typeof snap === "object") {
        systemText =
          (systemText ? systemText + "\n\n" : "") +
          "Answer in friendly plain English only. Never output JSON. " +
          "Use these facts:\n" +
          JSON.stringify(snap).slice(0, 6000);
      }
      if (systemText) messages.push({ role: "system", content: systemText });
      for (const h of history) messages.push({ role: h.role, content: h.content });
      const text = await searchWithPerplexity(prompt, messages);
      return { text: sanitizeAssistantText(text, snap), actions: [] };
    } catch {
      /* ignore */
    }
  }

  if (snap && typeof snap === "object") {
    return {
      text: formatFinanceOverview(snap as Record<string, unknown>),
      actions: [],
    };
  }
  return {
    text:
      backendHttpError ||
      "I couldn't reach the AI service right now. Please check your connection and try again.",
    actions: [],
  };
}

/**
 * Ask the AI a single question with optional system prompt and history.
 * Always resolves to a string — never throws — so UI stays resilient.
 */
export async function askAI(prompt: string, options: AIAskOptions = {}): Promise<string> {
  const result = await askAIDetailed(prompt, options);
  return result.text;
}

/**
 * Ask the AI to return a JSON array of short strings (e.g. tips, suggestions).
 * Parses defensively and falls back to line-splitting when the model returns prose.
 */
export async function askAIList(prompt: string, options: AIAskOptions = {}): Promise<string[]> {
  const text = await askAI(prompt, options);

  // Try to find a JSON array in the response.
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x)).filter(Boolean).slice(0, 8);
      }
    } catch {
      /* ignore and fall through */
    }
  }

  // Fallback: split bullet / numbered lines.
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);
}
