import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { currentUserId, usGetItem, usRemoveItem, usSetItem, userSessionId } from "@/services/userStorage";
import { USER_SCOPE_CHANGED_EVENT } from "@/services/persistSync";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  /** Omit to keep the panel pinned (no close button). */
  onClose?: () => void;
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
  onClose,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 160)}px`;
  };

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

  // Review tab → inject AI weekly review into Productivity Coach chat
  useEffect(() => {
    if (baseSessionId !== "productivity-coach") return;
    const onReview = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string; week?: string }>).detail;
      const text = (detail?.text || "").trim();
      if (!text) return;
      setMessages((prev) => {
        const next: ChatMessage[] = [
          ...prev,
          { role: "user", content: "Generate my weekly review" },
          { role: "assistant", content: text },
        ];
        void persistChatSession(
          activeSessionId,
          next,
          `Weekly review${detail?.week ? ` (${detail.week})` : ""}`,
        ).then(() => window.dispatchEvent(new Event("sybeez-chat-saved")));
        return next;
      });
    };
    window.addEventListener("sybeez-planner-review", onReview);
    return () => window.removeEventListener("sybeez-planner-review", onReview);
  }, [baseSessionId, activeSessionId]);

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

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || isLoading || !hydrated) return;

    const nextHistory = [...messages];
    const withUser: ChatMessage[] = [...nextHistory, { role: "user", content: prompt }];
    setMessages(withUser);
    setInput("");
    setIsLoading(true);

    if (nextHistory.length === 0) {
      chatHistory.add(prompt, activeSessionId, title);
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
      const withAssistant: ChatMessage[] = [
        ...withUser,
        { role: "assistant", content: safe },
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
      const threadTitle =
        (nextHistory.find((m) => m.role === "user")?.content || prompt).slice(0, 100);
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
        (nextHistory.find((m) => m.role === "user")?.content || prompt).slice(0, 100),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Goals / other panels can ask the coach with a ready prompt
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId?: string; prompt?: string }>).detail;
      if (!detail?.prompt) return;
      if (detail.sessionId && detail.sessionId !== baseSessionId) return;
      void send(detail.prompt);
    };
    window.addEventListener("sybeez:coach-ask", onAsk);
    return () => window.removeEventListener("sybeez:coach-ask", onAsk);
  });

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
    <aside className="w-[420px] flex-none flex flex-col border-l border-border bg-card/30">
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
          {onClose && (
            <button
              onClick={onClose}
              title="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-foreground text-background whitespace-pre-wrap"
                      : "border border-border bg-background text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="assistant-md [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1:first-child]:mt-0 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_h3:first-child]:mt-0 [&_ul]:my-2 [&_ul]:space-y-1.5 [&_ol]:my-2 [&_ol]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-none [&_ul]:pl-0 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:underline [&_hr]:my-3 [&_hr]:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
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
            className="min-h-[24px] max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-[13.5px] leading-relaxed"
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
