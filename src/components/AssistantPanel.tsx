import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUp, Loader2, Plus, Send } from "lucide-react";
import { AssistantMarkdown } from "@/components/chat/AssistantMarkdown";
import { Textarea } from "@/components/ui/textarea";
import { askAIDetailed } from "@/services/aiService";
import { chatHistory } from "@/services/chatHistory";
import { sanitizeAssistantText } from "@/services/financeChatFormat";
import gmailApi from "@/services/gmailApi";
import { toast } from "sonner";
import {
  OPEN_CHAT_SESSION_EVENT,
  archiveChatSession,
  baseSessionKey,
  loadChatSession,
  persistChatSession,
  type OpenChatSessionDetail,
} from "@/services/chatSessionStore";
import ChatHistoryPopover from "@/components/ChatHistoryPopover";
import { SybeezChatAvatar, UserChatAvatar } from "@/components/ChatAvatars";
import InvestmentAnalyticsChart, {
  type InvestmentAnalyticsPayload,
} from "@/components/InvestmentAnalyticsChart";
import { currentUserId, usGetItem, usRemoveItem, usSetItem, userSessionId } from "@/services/userStorage";
import { USER_SCOPE_CHANGED_EVENT } from "@/services/persistSync";
import { cn } from "@/lib/utils";

const PANEL_WIDTH_KEY = "sybeez_assistant_panel_width";
const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 720;

function clampPanelWidth(width: number) {
  const viewportCap =
    typeof window !== "undefined"
      ? Math.floor(window.innerWidth * 0.55)
      : MAX_PANEL_WIDTH;
  const max = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewportCap));
  return Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, width)));
}

function readStoredPanelWidth() {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) return clampPanelWidth(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_PANEL_WIDTH;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Optional inline investment analytics charts (session UI) */
  analytics?: InvestmentAnalyticsPayload;
  /** Suggested follow-up prompts under the reply */
  followups?: string[];
}

interface GmailDraft {
  messageId: string;
  accountEmail?: string;
  draftText: string;
  from?: string;
  subject?: string;
}

function readGmailDraft(): GmailDraft | null {
  try {
    const raw = usGetItem("sybeez_gmail_draft_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.messageId || !parsed?.draftText) return null;
    return parsed as GmailDraft;
  } catch {
    return null;
  }
}

export interface AssistantPanelProps {
  title: string;
  subtitle?: string;
  system: string;
  sessionId: string;
  placeholder?: string;
  emptyHint?: string;
  suggestions?: string[];
  /** Returns live structured context injected with every message (sync or async). */
  getContext?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Allow live web search / RAG on the backend. */
  useWebSearch?: boolean;
}

const AssistantPanel = ({
  title,
  subtitle,
  system,
  sessionId: baseSessionId,
  placeholder = "Ask anything…",
  emptyHint = "Ask me anything to get started.",
  suggestions = [],
  getContext,
  useWebSearch = false,
}: AssistantPanelProps) => {
  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      const scopedBase = userSessionId(baseSessionId);
      return localStorage.getItem(`sybeez_chat_sid_${scopedBase}`) || scopedBase;
    } catch {
      return userSessionId(baseSessionId);
    }
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [gmailDraft, setGmailDraft] = useState<GmailDraft | null>(() =>
    baseSessionId === "gmail-assistant" ? readGmailDraft() : null,
  );
  const [sendingReply, setSendingReply] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelWidthRef = useRef(panelWidth);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const hydratedRef = useRef(hydrated);
  const isLoadingRef = useRef(isLoading);
  const pendingAskRef = useRef<{
    prompt: string;
    displayText?: string;
    contextExtra?: Record<string, unknown>;
  } | null>(null);
  const sendRef = useRef<(
    text: string,
    opts?: { displayText?: string; contextExtra?: Record<string, unknown> },
  ) => Promise<void>>(async () => {});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const resizeComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 160)}px`;
  };

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  const persistPanelWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, []);

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (e: PointerEvent) => {
      const next = clampPanelWidth(window.innerWidth - e.clientX);
      panelWidthRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      setIsResizing(false);
      persistPanelWidth(panelWidthRef.current);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isResizing, persistPanelWidth]);

  useEffect(() => {
    const onWindowResize = () => {
      setPanelWidth((w) => {
        const next = clampPanelWidth(w);
        if (next !== w) persistPanelWidth(next);
        return next;
      });
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [persistPanelWidth]);

  // Remember active thread so reload continues the same conversation
  useEffect(() => {
    try {
      localStorage.setItem(`sybeez_chat_sid_${userSessionId(baseSessionId)}`, activeSessionId.startsWith("u:") ? activeSessionId : userSessionId(activeSessionId));
    } catch {
      /* ignore */
    }
  }, [baseSessionId, activeSessionId]);

  // Load persisted chat from SQLite when panel opens / session changes
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    (async () => {
      const stored = await loadChatSession(activeSessionId);
      if (cancelled) return;
      if (stored.length) {
        setMessages(stored);
      } else {
        setMessages([]);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  useEffect(() => {
    // Only reset when the panel's base session type changes (e.g. finance → planner)
    try {
      const scopedBase = userSessionId(baseSessionId);
      const saved = localStorage.getItem(`sybeez_chat_sid_${scopedBase}`);
      setActiveSessionId(saved || scopedBase);
    } catch {
      setActiveSessionId(userSessionId(baseSessionId));
    }
  }, [baseSessionId]);

  // When another user signs in, remount chat under that user's namespace
  useEffect(() => {
    const onScope = () => {
      const scopedBase = userSessionId(baseSessionId);
      try {
        const saved = localStorage.getItem(`sybeez_chat_sid_${scopedBase}`);
        setActiveSessionId(saved || scopedBase);
      } catch {
        setActiveSessionId(scopedBase);
      }
      setMessages([]);
      setHydrated(false);
    };
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScope);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScope);
  }, [baseSessionId]);

  // Open a full chat thread from History sidebar
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatSessionDetail>).detail;
      if (!detail?.sessionId) return;
      if (baseSessionKey(detail.sessionId) !== baseSessionId) return;
      setActiveSessionId(detail.sessionId);
    };
    window.addEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_SESSION_EVENT, onOpen);
  }, [baseSessionId]);

  // (Weekly review from History uses sybeez:coach-ask → chat only)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    resizeComposer();
  }, [input]);

  // Keep Send button in sync when Email Assistant fills the draft
  useEffect(() => {
    if (baseSessionId !== "gmail-assistant") return;
    const sync = () => setGmailDraft(readGmailDraft());
    const onDraft = () => sync();
    window.addEventListener("sybeez:gmail-draft-reply", onDraft);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sybeez:gmail-draft-reply", onDraft);
      window.removeEventListener("storage", sync);
    };
  }, [baseSessionId]);

  const startNewChat = async () => {
    // Keep prior messages in DB; open a fresh session id for the UI
    if (messages.length) {
      await persistChatSession(activeSessionId, messages, title);
      await archiveChatSession(activeSessionId);
      window.dispatchEvent(new Event("sybeez-chat-saved"));
    }
    const nextId = `${baseSessionId}-${Date.now().toString(36)}`;
    setActiveSessionId(nextId);
    setMessages([]);
    setInput("");
  };

  const flushPendingAsk = () => {
    const pending = pendingAskRef.current;
    if (!pending?.prompt) return;
    if (!hydratedRef.current || isLoadingRef.current) return;
    pendingAskRef.current = null;
    void sendRef.current(pending.prompt, {
      displayText: pending.displayText,
      contextExtra: pending.contextExtra,
    });
  };

  const send = async (
    text: string,
    opts?: { displayText?: string; contextExtra?: Record<string, unknown> },
  ) => {
    const prompt = text.trim();
    if (!prompt) return;

    // Queue Ask-AI / suggestions until chat is ready or current reply finishes
    if (!hydratedRef.current || isLoadingRef.current) {
      pendingAskRef.current = {
        prompt,
        displayText: opts?.displayText,
        contextExtra: opts?.contextExtra,
      };
      return;
    }

    const nextHistory = [...messagesRef.current];
    const displayText = (opts?.displayText || prompt).trim();
    const withUser: ChatMessage[] = [
      ...nextHistory,
      { role: "user", content: displayText },
    ];
    setMessages(withUser);
    setInput("");
    setIsLoading(true);
    isLoadingRef.current = true;

    if (nextHistory.length === 0) {
      chatHistory.add(displayText, activeSessionId, title);
    }

    try {
      let context: Record<string, unknown> = {};
      try {
        const raw = getContext?.();
        context = (raw && typeof (raw as Promise<unknown>).then === "function"
          ? await (raw as Promise<Record<string, unknown>>)
          : (raw as Record<string, unknown>)) ?? {};
      } catch {
        /* ignore */
      }
      if (opts?.contextExtra && typeof opts.contextExtra === "object") {
        context = { ...context, ...opts.contextExtra };
      }
      const web =
        useWebSearch ||
        context.enableWebSearch === true ||
        context.feature === "finance";
      const { text: reply, actions } = await askAIDetailed(prompt, {
        system,
        sessionId: activeSessionId,
        history: nextHistory,
        context,
        useWebSearch: web,
        applyActions: true,
      });
      const safe =
        context.feature === "finance"
          ? sanitizeAssistantText(reply, context.financeSnapshot)
          : reply;
      const analyticsAction = actions.find(
        (a) => a.type === "show_investment_analytics" && a.ok !== false,
      );
      const analytics: InvestmentAnalyticsPayload | undefined = analyticsAction
        ? {
            type: "show_investment_analytics",
            ok: true,
            empty: Boolean(analyticsAction.empty),
            portfolio_series: analyticsAction.portfolio_series,
            holdings: analyticsAction.holdings as InvestmentAnalyticsPayload["holdings"],
            summary: analyticsAction.summary,
            projections: analyticsAction.projections as InvestmentAnalyticsPayload["projections"],
          }
        : undefined;
      const followAction = actions.find(
        (a) => a.type === "suggest_followups" && Array.isArray(a.suggestions),
      );
      const followups = (followAction?.suggestions || [])
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 4);
      const withAssistant: ChatMessage[] = [
        ...withUser,
        {
          role: "assistant",
          content: safe,
          analytics,
          followups: followups.length ? followups : undefined,
        },
      ];
      setMessages(withAssistant);
      if (baseSessionId === "gmail-assistant") {
        const draftAction = actions.find(
          (a) => a.type === "gmail_draft_reply" && a.ok && a.draft_text,
        );
        if (draftAction) {
          setGmailDraft({
            messageId: String(draftAction.message_id || ""),
            accountEmail: draftAction.account_email
              ? String(draftAction.account_email)
              : undefined,
            draftText: String(draftAction.draft_text),
            from: draftAction.to ? String(draftAction.to) : undefined,
            subject: draftAction.subject ? String(draftAction.subject) : undefined,
          });
        }
        if (actions.some((a) => a.type === "gmail_send_reply" && a.ok)) {
          setGmailDraft(null);
        }
      }
      const threadTitle = displayText.slice(0, 100);
      // Persist full thread (SQLite append-only)
      void persistChatSession(activeSessionId, withAssistant, threadTitle).then(() => {
        window.dispatchEvent(new Event("sybeez-chat-saved"));
      });
    } catch {
      const errMsg =
        "Sorry, I couldn't reach the assistant just now. Please try again.";
      const withErr: ChatMessage[] = [
        ...withUser,
        { role: "assistant", content: errMsg },
      ];
      setMessages(withErr);
      void persistChatSession(
        activeSessionId,
        withErr,
        displayText.slice(0, 100),
      );
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      // Run any Ask-AI that arrived while we were loading / hydrating
      queueMicrotask(() => flushPendingAsk());
    }
  };
  sendRef.current = send;

  // Flush queued Ask-AI once chat history has hydrated
  useEffect(() => {
    if (hydrated && !isLoading) flushPendingAsk();
  }, [hydrated, isLoading]);

  // Goals / Reports / other panels can ask the coach with a ready prompt
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          sessionId?: string;
          prompt?: string;
          displayPrompt?: string;
          contextExtra?: Record<string, unknown>;
        }>
      ).detail;
      if (!detail?.prompt) return;
      if (detail.sessionId && detail.sessionId !== baseSessionId) return;
      void sendRef.current(detail.prompt, {
        displayText: detail.displayPrompt,
        contextExtra: detail.contextExtra,
      });
    };
    window.addEventListener("sybeez:coach-ask", onAsk);
    return () => window.removeEventListener("sybeez:coach-ask", onAsk);
  }, [baseSessionId]);

  const sendGmailDraft = async () => {
    const draft = readGmailDraft() || gmailDraft;
    if (!draft?.messageId || !draft.draftText?.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await gmailApi.sendReply(
        draft.messageId,
        draft.draftText.trim(),
        draft.accountEmail,
      );
      try {
        usRemoveItem("sybeez_gmail_draft_v1");
      } catch {
        /* ignore */
      }
      setGmailDraft(null);
      window.dispatchEvent(new CustomEvent("sybeez:gmail-refresh"));
      toast.success("Reply sent", { position: "top-center", duration: 2000 });
      const note: ChatMessage = {
        role: "assistant",
        content: `Reply sent${draft.from ? ` to ${draft.from}` : ""}.`,
      };
      setMessages((prev) => {
        const next = [...prev, note];
        void persistChatSession(activeSessionId, next, "Reply sent");
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply", {
        position: "top-center",
      });
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <aside
      className="relative flex-none flex flex-col border-l border-border bg-card/30"
      style={{ width: panelWidth }}
      aria-label={`${title} panel`}
    >
      {/* Drag handle — resize chat width */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        aria-valuenow={panelWidth}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        title="Drag to resize · double-click to reset"
        onPointerDown={onResizePointerDown}
        onDoubleClick={() => {
          setPanelWidth(DEFAULT_PANEL_WIDTH);
          persistPanelWidth(DEFAULT_PANEL_WIDTH);
        }}
        className={cn(
          "absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none",
          "flex items-center justify-center group",
        )}
      >
        <span
          className={cn(
            "h-10 w-[3px] rounded-full transition-colors",
            isResizing
              ? "bg-foreground/50"
              : "bg-border group-hover:bg-foreground/35",
          )}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-[57px] border-b border-border/60">
        <div className="flex min-w-0 items-center gap-2.5">
          <SybeezChatAvatar size={32} className="shrink-0 rounded-lg" />
          <div className="min-w-0 flex flex-col justify-center leading-tight">
            <p className="text-sm font-semibold truncate">{title}</p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ChatHistoryPopover
            baseSessionId={baseSessionId}
            activeSessionId={activeSessionId}
            onSelect={(sessionId) => setActiveSessionId(sessionId)}
          />
          <button
            onClick={() => void startNewChat()}
            title="New chat (keeps history in database)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {!hydrated ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chat…
          </div>
        ) : messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-2">
            <SybeezChatAvatar size={48} className="mb-4 rounded-2xl mx-auto" />
            <p className="text-sm text-muted-foreground max-w-[240px] mx-auto">{emptyHint}</p>
            {suggestions.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 w-full">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 items-start ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <SybeezChatAvatar messageAlign />}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.role === "user"
                      ? "max-w-[82%] bg-foreground text-background whitespace-pre-wrap"
                      : m.analytics
                        ? "max-w-[95%] border border-border bg-background text-foreground"
                        : "max-w-[82%] border border-border bg-background text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <>
                      <AssistantMarkdown content={m.content} />
                      {m.analytics && !m.analytics.empty && (
                        <InvestmentAnalyticsChart data={m.analytics} />
                      )}
                      {!!m.followups?.length && (
                        <div className="mt-3 flex flex-col gap-1.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Ask next
                          </p>
                          {m.followups.map((q) => (
                            <button
                              key={q}
                              type="button"
                              disabled={isLoading}
                              onClick={() => void send(q)}
                              className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === "user" && <UserChatAvatar />}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 justify-start items-start">
                <SybeezChatAvatar messageAlign />
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
            {baseSessionId === "gmail-assistant" && gmailDraft?.draftText && !isLoading && (
              <div className="flex justify-start pl-9">
                <button
                  type="button"
                  onClick={() => void sendGmailDraft()}
                  disabled={sendingReply}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {sendingReply ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {sendingReply ? "Sending…" : "Send reply"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="relative flex items-end gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 transition-colors focus-within:border-foreground/30"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="min-h-[24px] max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-0.5 pl-1.5 pr-1 shadow-none focus-visible:ring-0 text-[13.5px] leading-relaxed caret-foreground"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !hydrated}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </aside>
  );
};

export default AssistantPanel;
