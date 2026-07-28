import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Trash2, Send, Plug, LogOut, X, Search, Inbox,
  CheckCircle2, Star, Sparkles, Reply, Bell, RefreshCw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import gmailApi, { type GmailEmail as ApiEmail, type GmailAccount } from "@/services/gmailApi";
import { upsertNotification } from "@/services/notificationService";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Email {
  id: string;
  accountId: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  isSpam: boolean;
  important: boolean;
  replied?: boolean;
  category: "work" | "personal" | "billing" | "social" | "promo" | "other";
  summary?: string;
  actionItems?: string[];
  cleanReason?: string;
}

interface EmailAccount {
  id: string;
  email: string;
  connected: boolean;
}

interface GmailLabel {
  id: string;
  name: string;
}

interface GmailData {
  accounts: EmailAccount[];
  emails: Email[];
  labels: GmailLabel[];
  settings: { notificationsEnabled: boolean };
}

const GMAIL_KEY = "sybeez_gmail_data_v2";

function categorize(subject: string, from: string): Email["category"] {
  const s = `${subject} ${from}`.toLowerCase();
  if (/invoice|receipt|payment|billing|statement/.test(s)) return "billing";
  if (/noreply|no-reply|newsletter|promo|deal|offer|unsubscribe/.test(s)) return "promo";
  if (/linkedin|facebook|instagram|twitter|x\.com/.test(s)) return "social";
  if (/@.*(corp|inc|ltd|company|team)/.test(s) || /meeting|agenda|project/.test(s)) return "work";
  return "other";
}

function mapApiEmail(e: ApiEmail): Email {
  const accountId = (e.account_email || e.account_id || "gmail").toLowerCase();
  const reason = e.clean_reason || undefined;
  let category = categorize(e.subject, e.from_email);
  if (reason === "promotions") category = "promo";
  if (reason === "spam" || e.is_spam) category = "promo";
  if (reason === "newsletters") category = "promo";
  return {
    id: e.id,
    accountId,
    from: e.from_email,
    to: e.to,
    subject: e.subject,
    preview: e.preview,
    timestamp: e.timestamp,
    isRead: e.is_read,
    isSpam: e.is_spam,
    important: Boolean(e.important),
    category,
    summary: e.preview,
    cleanReason: reason,
  };
}

function loadLocalCache(): Partial<GmailData> {
  try {
    const raw = localStorage.getItem(GMAIL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
      emails: Array.isArray(parsed?.emails) ? parsed.emails : [],
      labels: Array.isArray(parsed?.labels) ? parsed.labels : [],
      settings: parsed?.settings,
    };
  } catch {
    return {};
  }
}

function loadLocalSettings(): { notificationsEnabled: boolean } {
  const cache = loadLocalCache();
  if (cache.settings) return cache.settings;
  return { notificationsEnabled: true };
}

function persistCache(data: GmailData) {
  try {
    localStorage.setItem(GMAIL_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  work: "bg-blue-500",
  personal: "bg-green-500",
  billing: "bg-purple-500",
  social: "bg-pink-500",
  promo: "bg-yellow-500",
  other: "bg-gray-500",
};

const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

type TabId = "inbox" | "accounts" | "clean";

interface GmailIntegrationSidebarProps {
  onClose: () => void;
}

const REASON_LABEL: Record<string, string> = {
  promotions: "Promotion",
  spam: "Spam",
  newsletters: "Newsletter",
  promo_senders: "Promo",
};

const GmailIntegrationSidebar: React.FC<GmailIntegrationSidebarProps> = ({ onClose }) => {
  const cached = useMemo(() => loadLocalCache(), []);
  const [accounts, setAccounts] = useState<EmailAccount[]>(() => cached.accounts || []);
  const [emails, setEmails] = useState<Email[]>(() => cached.emails || []);
  const [cleanEmails, setCleanEmails] = useState<Email[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>(() => cached.labels || []);
  const [settings] = useState(loadLocalSettings);
  const [activeTab, setActiveTab] = useState<TabId>("inbox");
  const [searchTerm, setSearchTerm] = useState("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(() => !(cached.emails && cached.emails.length > 0));
  const [cleanLoading, setCleanLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [configured, setConfigured] = useState(true);
  const hadCacheRef = useRef(Boolean(cached.emails?.length || cached.accounts?.length));
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const syncCache = useCallback(
    (nextAccounts: EmailAccount[], nextEmails: Email[], nextLabels?: GmailLabel[]) => {
      persistCache({
        accounts: nextAccounts,
        emails: nextEmails,
        labels: nextLabels ?? labelsRef.current,
        settings,
      });
    },
    [settings],
  );

  const loadFromBackend = useCallback(async (opts?: { quiet?: boolean }) => {
    // Quiet / cached: refresh in background without hiding the inbox
    if (!opts?.quiet && !hadCacheRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const status = await gmailApi.getStatus();
      setConfigured(status.configured !== false && status.available !== false);

      const apiAccounts = status.accounts?.length
        ? status.accounts
        : await gmailApi.getAccounts();

      const mappedAccounts: EmailAccount[] = (apiAccounts as GmailAccount[]).map((a) => ({
        id: (a.email || a.id).toLowerCase(),
        email: a.email,
        connected: a.connected !== false,
      }));
      setAccounts(mappedAccounts);

      if (mappedAccounts.length === 0) {
        setEmails([]);
        setLabels([]);
        syncCache([], [], []);
        return;
      }

      // Everyday inbox first — small page, no labels on the critical path
      const apiEmails = await gmailApi.getEmails(25);
      const mappedEmails = apiEmails.map(mapApiEmail);
      setEmails(mappedEmails);
      hadCacheRef.current = true;
      syncCache(mappedAccounts, mappedEmails);
      setLoading(false);

      // Labels in background (not required to show mail)
      void gmailApi
        .getLabels()
        .then((labelsRes) => {
          const mappedLabels: GmailLabel[] = (
            (labelsRes?.labels || []) as Array<{ id?: string; name?: string; type?: string }>
          )
            .filter((l) => l.type === "user" && l.name && l.id)
            .map((l) => ({ id: String(l.id), name: String(l.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setLabels(mappedLabels);
          syncCache(mappedAccounts, mappedEmails, mappedLabels);
        })
        .catch(() => {
          /* ignore */
        });

      if (settings.notificationsEnabled) {
        const important = mappedEmails.filter((e) => e.important && !e.isRead);
        if (important.length > 0) {
          upsertNotification({
            sourceKey: `gmail:important-live:${important.map((e) => e.id).sort().join(",")}`,
            module: "gmail",
            title: `${important.length} important email${important.length > 1 ? "s" : ""}`,
            body: important.slice(0, 2).map((e) => e.subject || "No subject").join(" · "),
            target: "gmail",
            severity: "urgent",
            toastOnce: true,
            toastFn: (title, o) =>
              toast(title, { description: o?.description, position: "top-center", duration: 4000 }),
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Gmail";
      if (!opts?.quiet) {
        // Not connected yet is normal
        if (!/not connected|not configured|401/i.test(message)) {
          toast.error(message, { position: "top-center" });
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [settings.notificationsEnabled, syncCache]);

  const loadCleanList = useCallback(async () => {
    if (accounts.length === 0) {
      setCleanEmails([]);
      return;
    }
    setCleanLoading(true);
    try {
      const res = await gmailApi.listCleanEmails(200);
      setCleanEmails((res.emails || []).map(mapApiEmail));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load clean list", {
        position: "top-center",
      });
    } finally {
      setCleanLoading(false);
    }
  }, [accounts.length]);

  useEffect(() => {
    void loadFromBackend();
  }, [loadFromBackend]);

  useEffect(() => {
    if (activeTab === "clean") {
      void loadCleanList();
    }
  }, [activeTab, loadCleanList]);

  // Refresh when Email Assistant creates labels / rules / moves mail
  useEffect(() => {
    const onRefresh = () => {
      void loadFromBackend({ quiet: true });
    };
    window.addEventListener("sybeez:gmail-refresh", onRefresh);
    window.addEventListener("sybeez:data-changed", onRefresh);
    return () => {
      window.removeEventListener("sybeez:gmail-refresh", onRefresh);
      window.removeEventListener("sybeez:data-changed", onRefresh);
    };
  }, [loadFromBackend]);

  // Pull email event reminders (renewals / meetings) so nothing is missed
  useEffect(() => {
    let cancelled = false;
    const pullEvents = async () => {
      try {
        const data = await gmailApi.getEvents();
        if (cancelled || !data?.events?.length) return;
        const pending = (data.events as Array<Record<string, unknown>>).filter(
          (e) => !e.reminded,
        );
        const remindedIds: string[] = [];
        for (const ev of pending.slice(0, 20)) {
          const id = String(ev.id || ev.source_key || "");
          if (!id) continue;
          upsertNotification({
            sourceKey: String(ev.source_key || id),
            module: "gmail",
            title: `Reminder: ${String(ev.date_hint || "soon")}`,
            body: `${String(ev.title || "Email event")} · ${String(ev.from_email || "")}`,
            target: "gmail",
            severity: ev.priority === "high" ? "urgent" : "warning",
            toastOnce: true,
            toastFn: (title, o) =>
              toast(title, { description: o?.description, position: "top-center", duration: 5000 }),
          });
          remindedIds.push(id);
        }
        if (remindedIds.length) {
          await gmailApi.markEventsReminded(remindedIds).catch(() => undefined);
        }
      } catch {
        /* ignore until connected */
      }
    };
    void pullEvents();
    const t = window.setInterval(pullEvents, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Handle return from Google OAuth (?gmail=connected)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    if (!gmail) return;

    if (gmail === "connected") {
      const email = params.get("email") || "your Gmail";
      toast.success(`Connected ${email}`, { position: "top-center" });
      setActiveTab("inbox");
      void loadFromBackend();
    } else if (gmail === "error") {
      toast.error(params.get("message") || "Gmail connection failed", { position: "top-center" });
      setActiveTab("accounts");
    }

    params.delete("gmail");
    params.delete("email");
    params.delete("message");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [loadFromBackend]);

  const connectWithGoogle = async () => {
    setConnecting(true);
    try {
      const status = await gmailApi.getStatus().catch(() => null);
      if (status && status.configured === false) {
        throw new Error(
          "Gmail OAuth is not configured. Add GOOGLE_CLIENT_SECRET (and Client ID) in fastapibackend/.env, then restart the backend.",
        );
      }
      const { authorization_url } = await gmailApi.startOAuth();
      if (!authorization_url) throw new Error("No authorization URL returned from server");
      window.location.href = authorization_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start Google connection";
      toast.error(message, { position: "top-center", duration: 6000 });
      setConnecting(false);
    }
  };

  const removeAccount = async (id: string) => {
    try {
      await gmailApi.disconnectAccount(id);
      const nextAccounts = accounts.filter((a) => a.id !== id);
      const nextEmails = emails.filter((e) => e.accountId !== id);
      setAccounts(nextAccounts);
      setEmails(nextEmails);
      syncCache(nextAccounts, nextEmails, labels);
      toast.success("Account disconnected", { position: "top-center", duration: 1500 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect", { position: "top-center" });
    }
  };

  const markRead = async (id: string) => {
    const email = emails.find((e) => e.id === id);
    if (!email || email.isRead) {
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: true } : e)));
      return;
    }
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: true } : e)));
    try {
      await gmailApi.markAsRead(id, email.accountId);
    } catch {
      /* keep optimistic UI */
    }
  };

  const toggleImportant = (id: string) =>
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, important: !e.important } : e)));

  const deleteEmail = async (id: string) => {
    const email = emails.find((e) => e.id === id);
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      if (email) await gmailApi.deleteEmail(id, email.accountId);
      toast.success("Email deleted", { position: "top-center", duration: 1500 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", { position: "top-center" });
      void loadFromBackend({ quiet: true });
    }
  };

  const cleanInbox = async () => {
    if (cleaning) return;
    const count = cleanEmails.length;
    const ok = window.confirm(
      count > 0
        ? `Delete all ${count} listed promotional / spam / newsletter emails?\n\nThey go to Gmail Trash for 30 days.`
        : "Delete ALL promotional, spam, and newsletter mail from Gmail?\n\nMessages go to Gmail Trash for 30 days.",
    );
    if (!ok) return;

    setCleaning(true);
    toast.info("Deleting unwanted mail…", { position: "top-center", duration: 2500 });
    try {
      const result = await gmailApi.cleanUnwanted(1000);
      const deleted = result.deleted || 0;
      setCleanEmails([]);
      setEmails((prev) =>
        prev.filter((e) => !e.isSpam && e.category !== "promo" && e.category !== "social"),
      );
      if (deleted === 0) {
        toast.info("No promotional or spam mail found to clean", {
          position: "top-center",
          duration: 2500,
        });
      } else {
        toast.success(
          `Deleted ${deleted} unwanted message${deleted === 1 ? "" : "s"}`,
          { position: "top-center", duration: 4000 },
        );
      }
      void loadFromBackend({ quiet: true });
      void loadCleanList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clean failed", {
        position: "top-center",
      });
    } finally {
      setCleaning(false);
    }
  };

  const sendReply = async (email: Email) => {
    if (!replyText.trim()) {
      toast.error("Write your reply first", { position: "top-center" });
      return;
    }
    try {
      await gmailApi.sendReply(email.id, replyText.trim(), email.accountId);
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, replied: true, isRead: true } : e)),
      );
      toast.success(`Reply sent to ${email.from}`, { position: "top-center", duration: 2000 });
      setReplyingId(null);
      setReplyText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reply failed", { position: "top-center" });
    }
  };

  const connectedAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.connected).map((a) => a.id)),
    [accounts],
  );

  const groupedEmails = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    // Inbox = everyday mail only (promotions/spam live on Clean tab)
    const filtered = emails
      .filter((e) => connectedAccountIds.size === 0 || connectedAccountIds.has(e.accountId))
      .filter((e) => !e.isSpam && e.category !== "promo" && e.category !== "social")
      .filter((e) => !importantOnly || e.important)
      .filter(
        (e) =>
          !q ||
          e.subject.toLowerCase().includes(q) ||
          e.from.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const groups: { label: string; emails: Email[] }[] = [];
    for (const email of filtered) {
      const label = dayLabel(email.timestamp);
      const group = groups.find((g) => g.label === label);
      if (group) group.emails.push(email);
      else groups.push({ label, emails: [email] });
    }
    return groups;
  }, [emails, connectedAccountIds, importantOnly, searchTerm]);

  const unreadCount = emails.filter(
    (e) => !e.isRead && !e.isSpam && e.category !== "promo" && e.category !== "social",
  ).length;
  const connectedCount = accounts.filter((a) => a.connected).length;

  const renderAccounts = () => (
    <div className="space-y-4 max-w-xl">
      <Card className="border-border bg-black">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connect Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Click Connect — Google will ask which account to authorize. After you approve,
            Sybeez Flow can read and manage that inbox.
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p className="font-medium text-foreground">If Google shows “hasn’t verified this app”</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Click <span className="text-foreground">Advanced</span></li>
              <li>Click <span className="text-foreground">Go to flow (unsafe)</span></li>
              <li>Allow Gmail access</li>
            </ol>
            <p>
              This is Google’s normal screen until the app is verified. For your own accounts, add
              them as Test users in Google Cloud → OAuth consent screen.
            </p>
          </div>
          {!configured && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Gmail OAuth is not configured on the server. Add your Google Web client ID & secret
              (`GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`) and restart the backend.
            </div>
          )}
          <Button
            onClick={connectWithGoogle}
            disabled={connecting}
            className="w-full h-11 bg-white text-black hover:bg-gray-200"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening Google…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" /> Connect with Google
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Connected accounts ({connectedCount})
        </h3>
        {accounts.map((acc) => (
          <Card key={acc.id} className="border-border/50 bg-muted/10">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg shrink-0", acc.connected ? "bg-green-500/15" : "bg-muted/30")}>
                <Mail className={cn("h-4 w-4", acc.connected ? "text-green-500" : "text-muted-foreground")} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{acc.email}</p>
                <p className={cn("text-xs flex items-center gap-1", acc.connected ? "text-green-500" : "text-muted-foreground")}>
                  {acc.connected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Connected · live inbox
                    </>
                  ) : (
                    "Disconnected"
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => removeAccount(acc.id)}
              >
                <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
              </Button>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No Gmail account connected yet.
          </p>
        )}
      </div>
    </div>
  );

  const renderEmailCard = (email: Email) => {
    const expanded = expandedId === email.id;
    const replying = replyingId === email.id;
    return (
      <div
        key={email.id}
        className={cn(
          "rounded-lg border transition-all bg-black",
          email.isRead ? "border-border/50" : "border-border",
          email.important && "border-l-2 border-l-yellow-500",
        )}
      >
        <div className="p-3">
          <div className="flex items-start gap-2">
            <button onClick={() => toggleImportant(email.id)} title="Mark important" className="shrink-0 mt-0.5">
              <Star className={cn("h-4 w-4", email.important ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} />
            </button>
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => {
                void markRead(email.id);
                setExpandedId(expanded ? null : email.id);
              }}
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{email.from}</p>
                {!email.isRead && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                {email.replied && <Reply className="h-3 w-3 text-green-500 shrink-0" />}
                <span className={cn("h-2 w-2 rounded-full shrink-0 ml-auto", CATEGORY_COLORS[email.category])} />
              </div>
              <p className={cn("text-xs truncate mt-0.5", email.isRead ? "text-muted-foreground" : "text-foreground font-medium")}>
                {email.subject}
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-1">{email.preview}</p>
              <span className="text-[10px] text-muted-foreground">{timeLabel(email.timestamp)}</span>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{email.preview}</p>

              <div className="p-2.5 rounded-md bg-muted/20 border border-border">
                <p className="text-[11px] font-medium text-purple-300 flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3" /> Summary
                </p>
                <p className="text-xs text-foreground">{email.summary || email.preview}</p>
              </div>

              {replying ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    placeholder={`Reply to ${email.from}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full h-24 p-2 text-xs bg-muted/10 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-white text-black hover:bg-gray-200 h-8" onClick={() => void sendReply(email)}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Send
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { setReplyingId(null); setReplyText(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-white text-black hover:bg-gray-200 h-8 text-xs" onClick={() => { setReplyingId(email.id); setReplyText(""); }}>
                    <Reply className="h-3.5 w-3.5 mr-1" /> Reply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-red-400" onClick={() => void deleteEmail(email.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderInbox = () => {
    if (loading && emails.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mb-3" />
          <p className="text-sm">Loading inbox…</p>
        </div>
      );
    }

    if (accounts.length === 0) {
      return (
        <div className="text-center py-12 max-w-sm mx-auto space-y-4">
          <Inbox className="h-12 w-12 mx-auto opacity-50 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Connect Gmail to see your inbox</p>
            <p className="text-xs text-muted-foreground">
              No email typing needed — Google handles account selection and authorization.
            </p>
          </div>
          <Button onClick={connectWithGoogle} disabled={connecting} className="bg-white text-black hover:bg-gray-200">
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Connect with Google
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4 max-w-2xl">
        {/* Always show Gmail labels on the page (not only in chat) */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Labels</p>
            <span className="text-[10px] text-muted-foreground">{labels.length} custom</span>
          </div>
          {labels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No custom labels yet — ask the Email Assistant: “Create label Bills”
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center rounded-md border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] text-foreground"
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-sm bg-muted/10 border-border h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 text-xs"
              onClick={() => void loadFromBackend({ quiet: true })}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant={importantOnly ? "default" : "outline"}
              className={cn("h-9 text-xs", importantOnly && "bg-white text-black hover:bg-gray-200")}
              onClick={() => setImportantOnly((v) => !v)}
            >
              <Star className={cn("h-3.5 w-3.5 mr-1", importantOnly && "fill-black")} /> Important
            </Button>
          </div>
        </div>

        {groupedEmails.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{searchTerm || importantOnly ? "No matching mail" : "Your inbox is empty"}</p>
          </div>
        ) : (
          groupedEmails.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</h3>
                <span className="text-[10px] text-muted-foreground">({group.emails.length})</span>
              </div>
              {group.emails.map(renderEmailCard)}
            </div>
          ))
        )}
      </div>
    );
  };

  const renderClean = () => {
    if (accounts.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground max-w-sm mx-auto space-y-2">
          <Sparkles className="h-10 w-10 mx-auto opacity-40" />
          <p className="text-sm font-medium text-foreground">Connect Gmail first</p>
          <p className="text-xs">Then open Clean to list promotions and unwanted mail.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Mails to clean</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All promotional / newsletter / spam mail (any day) — not your everyday Inbox.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void loadCleanList()}
              disabled={cleanLoading || cleaning}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", cleanLoading && "animate-spin")} />
              Refresh list
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-white text-black hover:bg-gray-200"
              onClick={() => void cleanInbox()}
              disabled={cleaning || cleanLoading || cleanEmails.length === 0}
            >
              {cleaning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              {cleaning ? "Deleting…" : `Delete all (${cleanEmails.length})`}
            </Button>
          </div>
        </div>

        {cleanLoading && cleanEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            <p className="text-sm">Scanning all promotional mail…</p>
            <p className="text-xs mt-1 opacity-70">Not just today — older promotions included</p>
          </div>
        ) : cleanEmails.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50 text-green-500" />
            <p className="text-sm">Nothing to clean — inbox looks tidy</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Showing {cleanEmails.length} message{cleanEmails.length === 1 ? "" : "s"} ready to remove
            </p>
            {cleanEmails.map((email) => (
              <div
                key={email.id}
                className="rounded-lg border border-border/60 bg-black p-3 flex items-start gap-2"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{email.from}</p>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {REASON_LABEL[email.cleanReason || ""] || email.cleanReason || "Unwanted"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 truncate mt-0.5">{email.subject}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{email.preview}</p>
                  <span className="text-[10px] text-muted-foreground">{timeLabel(email.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-background flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-background flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg text-foreground flex items-center gap-2">Gmail Manager</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {connectedCount} account{connectedCount !== 1 ? "s" : ""} · {unreadCount} unread
            {cleanEmails.length > 0 && activeTab === "clean"
              ? ` · ${cleanEmails.length} to clean`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
              <Bell className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs text-red-300 font-medium">{unreadCount} new</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-muted/20">
        <div className="flex px-4">
          {(
            [
              { id: "inbox", label: "Inbox", Icon: Inbox },
              { id: "accounts", label: "Accounts", Icon: Plug },
              { id: "clean", label: "Clean", Icon: Sparkles },
            ] as { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[]
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 py-3 px-4 transition-all border-b-2 text-sm font-medium",
                activeTab === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
              {id === "clean" && cleanEmails.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  ({cleanEmails.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-6 py-4">
            {activeTab === "inbox"
              ? renderInbox()
              : activeTab === "accounts"
                ? renderAccounts()
                : renderClean()}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default GmailIntegrationSidebar;
