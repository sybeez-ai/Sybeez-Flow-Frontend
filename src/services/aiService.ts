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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  const hasPriorTurns = Array.isArray(history) && history.length > 0;
  if (
    !hasPriorTurns &&
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
    isFinance &&
    snap &&
    typeof snap === "object" &&
    wantsPortfolioOverview(prompt)
  ) {
    const text = formatPortfolioOverview(snap as Record<string, unknown>);
    return { text, actions: [], intent: "finance" };
  }

  // Keep `message` as the user's raw text so LangGraph intent routing works.
  // System prompt + history travel in `context`.
  try {
    const res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        message: prompt,
        session_id: sessionId,
        context: { ...context, system, history },
        use_voice: false,
        use_web_search: enableWeb,
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
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    // fall through to Perplexity
  }

  // Fallback: client-side Perplexity (no agentic writes)
  try {
    const messages: PerplexityMessage[] = [];
    let systemText = system || "";
    // Keep snapshot out of the user-visible echo path — only brief instruction
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
    if (snap && typeof snap === "object") {
      return {
        text: formatFinanceOverview(snap as Record<string, unknown>),
        actions: [],
      };
    }
    return {
      text: "I couldn't reach the AI service right now. Please check your connection and try again.",
      actions: [],
    };
  }
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
