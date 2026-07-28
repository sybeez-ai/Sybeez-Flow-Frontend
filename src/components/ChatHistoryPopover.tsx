import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, MessageSquare, Search } from "lucide-react";
import {
  baseSessionKey,
  listChatSessions,
  unarchiveChatSession,
  type ChatSessionSummary,
} from "@/services/chatSessionStore";

function formatWhen(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChatHistoryPopoverProps {
  baseSessionId: string;
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}

/**
 * Floating chat history near the panel header (+).
 * Hover peeks recent chats; click pins the full list open.
 */
const ChatHistoryPopover = ({
  baseSessionId,
  activeSessionId,
  onSelect,
}: ChatHistoryPopoverProps) => {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const all = await listChatSessions();
      setSessions(all.filter((s) => baseSessionKey(s.sessionId) === baseSessionId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onSaved = () => void refresh();
    window.addEventListener("sybeez-chat-saved", onSaved);
    window.addEventListener("focus", onSaved);
    return () => {
      window.removeEventListener("sybeez-chat-saved", onSaved);
      window.removeEventListener("focus", onSaved);
    };
  }, [baseSessionId]);

  // Click outside closes when pinned
  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
        setQuery("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const clearHoverClose = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  const scheduleHoverClose = () => {
    if (pinned) return;
    clearHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  const pick = async (s: ChatSessionSummary) => {
    if (s.archived) await unarchiveChatSession(s.sessionId);
    onSelect(s.sessionId);
    setPinned(false);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        clearHoverClose();
        setOpen(true);
        void refresh();
      }}
      onMouseLeave={scheduleHoverClose}
    >
      <button
        type="button"
        onClick={() => {
          clearHoverClose();
          if (pinned) {
            setPinned(false);
            setOpen(false);
            setQuery("");
          } else {
            setPinned(true);
            setOpen(true);
            void refresh();
          }
        }}
        title="Chat history"
        aria-label="Chat history"
        aria-expanded={open}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          open || pinned
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Clock className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] origin-top-right animate-in fade-in-0 zoom-in-95 duration-150"
          onMouseEnter={clearHoverClose}
          onMouseLeave={scheduleHoverClose}
        >
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
              <div>
                <p className="text-[13px] font-semibold text-foreground">History</p>
                <p className="text-[10px] text-muted-foreground">
                  {pinned ? "All saved chats" : "Hover preview · click to pin"}
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {sessions.length}
              </span>
            </div>

            {pinned && (
              <div className="border-b border-border/50 px-3 py-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search chats…"
                    className="h-8 w-full rounded-lg border border-border/60 bg-background/60 pl-8 pr-3 text-[12.5px] outline-none placeholder:text-muted-foreground/50 focus:border-foreground/25"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className={`overflow-y-auto ${pinned ? "max-h-[360px]" : "max-h-[220px]"}`}>
              {loading && sessions.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                  Loading…
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
                  No chats yet — start a conversation and it will stay saved here.
                </p>
              ) : (
                <ul className="p-1.5">
                  {(pinned ? filtered : filtered.slice(0, 6)).map((s) => {
                    const active = s.sessionId === activeSessionId;
                    return (
                      <li key={s.sessionId}>
                        <button
                          type="button"
                          onClick={() => void pick(s)}
                          className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                            active
                              ? "bg-foreground text-background"
                              : "hover:bg-muted/80"
                          }`}
                        >
                          <MessageSquare
                            className={`mt-0.5 h-3.5 w-3.5 flex-none ${
                              active ? "opacity-80" : "text-muted-foreground"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium leading-snug">
                              {s.title}
                            </p>
                            <p
                              className={`mt-0.5 truncate text-[10px] ${
                                active ? "opacity-70" : "text-muted-foreground"
                              }`}
                            >
                              {s.messageCount} messages
                              {s.updatedAt ? ` · ${formatWhen(s.updatedAt)}` : ""}
                              {s.archived ? " · archived" : ""}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!pinned && filtered.length > 6 && (
              <button
                type="button"
                onClick={() => {
                  setPinned(true);
                  setOpen(true);
                }}
                className="w-full border-t border-border/60 px-3.5 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                View all {filtered.length} chats
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatHistoryPopover;
