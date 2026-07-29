import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Trash2, Send, Plug, LogOut, X, Search, Inbox,
  CheckCircle2, Star, Sparkles, Reply, Bell, RefreshCw, Loader2, FolderKanban,
  Pause, Play,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import gmailApi, { type GmailEmail as ApiEmail, type GmailAccount } from "@/services/gmailApi";
import { upsertNotification } from "@/services/notificationService";
import { usGetItem, usRemoveItem, usSetItem } from "@/services/userStorage";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Email {
  id: string;
  accountId: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  body?: string;
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
const GMAIL_SELECTED_KEY = "sybeez_gmail_selected_v1";
const GMAIL_DRAFT_KEY = "sybeez_gmail_draft_v1";
const GMAIL_DRAFT_EVENT = "sybeez:gmail-draft-reply";
const GMAIL_ACTIVE_ACCOUNT_KEY = "sybeez_gmail_active_account_v1";

type AccountFilter = "all" | string;

function loadActiveAccount(): AccountFilter {
  try {
    const raw = usGetItem(GMAIL_ACTIVE_ACCOUNT_KEY);
    if (!raw) return "all";
    return raw === "all" ? "all" : raw.toLowerCase();
  } catch {
    return "all";
  }
}

function persistActiveAccount(id: AccountFilter) {
  try {
    usSetItem(GMAIL_ACTIVE_ACCOUNT_KEY, id);
  } catch {
    /* ignore */
  }
}

function accountShort(email: string): string {
  const e = (email || "").trim();
  if (!e) return "account";
  const at = e.indexOf("@");
  if (at <= 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (local.length <= 12) return e;
  return `${local.slice(0, 10)}…@${domain}`;
}

function persistSelected(email: Email | null) {
  try {
    if (!email) {
      usRemoveItem(GMAIL_SELECTED_KEY);
      return;
    }
    usSetItem(
      GMAIL_SELECTED_KEY,
      JSON.stringify({
        id: email.id,
        accountId: email.accountId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        preview: (email.preview || "").slice(0, 300),
        body: (email.body || email.preview || "").slice(0, 4000),
      }),
    );
  } catch {
    /* ignore */
  }
}

function persistDraft(draft: {
  messageId: string;
  accountEmail?: string;
  draftText: string;
  from?: string;
  subject?: string;
} | null) {
  try {
    if (!draft) {
      usRemoveItem(GMAIL_DRAFT_KEY);
      return;
    }
    usSetItem(GMAIL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

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
    const raw = usGetItem(GMAIL_KEY);
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
    usSetItem(GMAIL_KEY, JSON.stringify(data));
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

type TabId = "inbox" | "organize" | "accounts" | "clean";

interface OrgRule {
  id: string;
  account_email?: string | null;
  match_type?: string;
  match_value?: string;
  from_email?: string;
  label_name: string;
  remove_inbox?: boolean;
  enabled?: boolean;
  applied_count?: number;
  last_applied_at?: string | null;
}

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
  const [orgRules, setOrgRules] = useState<OrgRule[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>(() => cached.labels || []);
  const [settings] = useState(loadLocalSettings);
  const [activeTab, setActiveTab] = useState<TabId>("inbox");
  const [activeAccount, setActiveAccount] = useState<AccountFilter>(() => loadActiveAccount());
  const [searchTerm, setSearchTerm] = useState("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [bodyLoadingId, setBodyLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !(cached.emails && cached.emails.length > 0));
  const [cleanLoading, setCleanLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgApplying, setOrgApplying] = useState(false);
  const [orgRuleBusyId, setOrgRuleBusyId] = useState<string | null>(null);
  const [ruleMatchType, setRuleMatchType] = useState<"from" | "category">("from");
  const [ruleMatchValue, setRuleMatchValue] = useState("");
  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleRemoveInbox, setRuleRemoveInbox] = useState(true);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [configured, setConfigured] = useState(true);
  const hadCacheRef = useRef(Boolean(cached.emails?.length || cached.accounts?.length));
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const activeAccountRef = useRef(activeAccount);
  activeAccountRef.current = activeAccount;
  const lastAutoApplyKeyRef = useRef<string>("");

  const selectAccount = useCallback((id: AccountFilter) => {
    setActiveAccount(id);
    persistActiveAccount(id);
  }, []);

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

      // Keep account filter valid after disconnect
      const current = activeAccountRef.current;
      if (current !== "all" && !mappedAccounts.some((a) => a.id === current)) {
        selectAccount("all");
      }

      // Everyday inbox — all accounts (UI filters by selected account)
      const apiEmails = await gmailApi.getEmails(25);
      const mappedEmails = apiEmails.map(mapApiEmail);
      setEmails(mappedEmails);
      hadCacheRef.current = true;
      syncCache(mappedAccounts, mappedEmails);
      setLoading(false);

      // Labels for the active account (or first connected)
      const labelAccount =
        (activeAccountRef.current !== "all" && activeAccountRef.current) ||
        mappedAccounts[0]?.email;
      void gmailApi
        .getLabels(labelAccount)
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
  }, [settings.notificationsEnabled, syncCache, selectAccount]);

  const loadCleanList = useCallback(async () => {
    if (accounts.length === 0) {
      setCleanEmails([]);
      return;
    }
    setCleanLoading(true);
    try {
      const accountEmail = activeAccount === "all" ? undefined : activeAccount;
      const res = await gmailApi.listCleanEmails(200, accountEmail);
      setCleanEmails((res.emails || []).map(mapApiEmail));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load clean list", {
        position: "top-center",
      });
    } finally {
      setCleanLoading(false);
    }
  }, [accounts.length, activeAccount]);

  const loadOrgRules = useCallback(async () => {
    if (accounts.length === 0) {
      setOrgRules([]);
      return;
    }
    setOrgLoading(true);
    try {
      const accountEmail = activeAccount === "all" ? undefined : activeAccount;
      const res = await gmailApi.listRules(accountEmail);
      setOrgRules((res.rules || []) as OrgRule[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load organize rules", {
        position: "top-center",
      });
    } finally {
      setOrgLoading(false);
    }
  }, [accounts.length, activeAccount]);

  const refreshLabels = useCallback(async (accountEmail?: string) => {
    const target =
      accountEmail ||
      (activeAccount !== "all" ? activeAccount : accounts[0]?.email);
    if (!target) return;
    try {
      const labelsRes = await gmailApi.getLabels(target);
      const mappedLabels: GmailLabel[] = (
        (labelsRes?.labels || []) as Array<{ id?: string; name?: string; type?: string }>
      )
        .filter((l) => l.type === "user" && l.name && l.id)
        .map((l) => ({ id: String(l.id), name: String(l.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setLabels(mappedLabels);
    } catch {
      /* ignore */
    }
  }, [activeAccount, accounts]);

  const applyOrgRulesQuiet = useCallback(async () => {
    if (accounts.length === 0) return;
    const key = `${activeAccount}|${accounts.map((a) => a.id).join(",")}`;
    // Avoid spamming apply on every callback identity change
    if (lastAutoApplyKeyRef.current === key) return;
    lastAutoApplyKeyRef.current = key;
    try {
      const accountEmail = activeAccount === "all" ? undefined : activeAccount;
      const res = await gmailApi.applyRules(accountEmail);
      const moved = Number(res?.applied || 0);
      if (moved > 0) {
        toast.success(`Organized ${moved} email${moved === 1 ? "" : "s"} into labels`, {
          position: "top-center",
          duration: 2500,
        });
        void loadFromBackend({ quiet: true });
        void loadOrgRules();
      }
    } catch {
      /* quiet — rules may be empty */
    }
  }, [accounts, activeAccount, loadFromBackend, loadOrgRules]);

  useEffect(() => {
    void loadFromBackend();
  }, [loadFromBackend]);

  useEffect(() => {
    if (activeTab === "clean") {
      void loadCleanList();
    }
    if (activeTab === "organize") {
      void loadOrgRules();
      void refreshLabels();
    }
  }, [activeTab, loadCleanList, loadOrgRules, activeAccount, refreshLabels]);

  // Auto-apply when accounts / account filter ready (once per key)
  useEffect(() => {
    if (accounts.length === 0) return;
    const t = window.setTimeout(() => {
      void applyOrgRulesQuiet();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [accounts.length, activeAccount, applyOrgRulesQuiet]);

  // When user opens Organize, force one fresh apply pass
  useEffect(() => {
    if (activeTab !== "organize" || accounts.length === 0) return;
    lastAutoApplyKeyRef.current = "";
    const t = window.setTimeout(() => {
      void applyOrgRulesQuiet();
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tab enter / account
  }, [activeTab, activeAccount, accounts.length]);
  // Reload labels when switching which account is active
  useEffect(() => {
    if (accounts.length === 0) return;
    const labelAccount =
      (activeAccount !== "all" && activeAccount) || accounts[0]?.email;
    if (!labelAccount) return;
    let cancelled = false;
    void gmailApi
      .getLabels(labelAccount)
      .then((labelsRes) => {
        if (cancelled) return;
        const mappedLabels: GmailLabel[] = (
          (labelsRes?.labels || []) as Array<{ id?: string; name?: string; type?: string }>
        )
          .filter((l) => l.type === "user" && l.name && l.id)
          .map((l) => ({ id: String(l.id), name: String(l.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setLabels(mappedLabels);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccount, accounts]);

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

  const openEmail = async (email: Email) => {
    const nextExpanded = expandedId === email.id ? null : email.id;
    setExpandedId(nextExpanded);
    if (!nextExpanded) {
      persistSelected(null);
      return;
    }
    void markRead(email.id);
    persistSelected(email);

    if (email.body && email.body.length > (email.preview || "").length) {
      return;
    }

    setBodyLoadingId(email.id);
    try {
      const full = await gmailApi.getEmail(email.id, email.accountId);
      const body = (full.body || full.preview || "").trim();
      setEmails((prev) =>
        prev.map((e) =>
          e.id === email.id
            ? {
                ...e,
                body: body || e.preview,
                preview: e.preview || full.preview || body,
                summary: body.slice(0, 280) || e.summary,
                from: full.from_email || e.from,
                to: full.to || e.to,
                subject: full.subject || e.subject,
              }
            : e,
        ),
      );
      persistSelected({
        ...email,
        body: body || email.preview,
        from: full.from_email || email.from,
        to: full.to || email.to,
        subject: full.subject || email.subject,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open email", {
        position: "top-center",
      });
    } finally {
      setBodyLoadingId(null);
    }
  };

  // Email Assistant drafts → fill reply box (same draft, editable here)
  useEffect(() => {
    const onDraft = (e: Event) => {
      const detail = (e as CustomEvent<{
        messageId?: string;
        accountEmail?: string;
        draftText?: string;
        from?: string;
        subject?: string;
      }>).detail;
      const messageId = detail?.messageId;
      const draftText = (detail?.draftText || "").trim();
      if (!messageId || !draftText) return;

      persistDraft({
        messageId,
        accountEmail: detail.accountEmail,
        draftText,
        from: detail.from,
        subject: detail.subject,
      });

      setExpandedId(messageId);
      setReplyingId(messageId);
      setReplyText(draftText);

      const existing = emails.find((x) => x.id === messageId);
      if (existing) persistSelected(existing);
    };
    window.addEventListener(GMAIL_DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(GMAIL_DRAFT_EVENT, onDraft);
  }, [emails]);

  const toggleImportant = (id: string) =>
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, important: !e.important } : e)));

  const deleteEmail = async (id: string) => {
    const email = emails.find((e) => e.id === id);
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    try {
      if (email) await gmailApi.deleteEmail(id, email.accountId);
      toast.success(`Deleted from ${email?.accountId || "Gmail"}`, {
        position: "top-center",
        duration: 1500,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", { position: "top-center" });
      void loadFromBackend({ quiet: true });
    }
  };

  const cleanInbox = async () => {
    if (cleaning) return;
    const scoped = cleanEmails.filter(
      (e) => activeAccount === "all" || e.accountId === activeAccount,
    );
    const count = scoped.length;
    const scopeLabel = activeAccount === "all" ? "all connected accounts" : activeAccount;
    const ok = window.confirm(
      count > 0
        ? `Delete ${count} promotional / spam / newsletter email${count === 1 ? "" : "s"} from ${scopeLabel}?\n\nThey go to Gmail Trash for 30 days.`
        : `Delete ALL promotional, spam, and newsletter mail from ${scopeLabel}?\n\nMessages go to Gmail Trash for 30 days.`,
    );
    if (!ok) return;

    setCleaning(true);
    toast.info(
      activeAccount === "all"
        ? "Deleting unwanted mail across accounts…"
        : `Deleting unwanted mail from ${activeAccount}…`,
      { position: "top-center", duration: 2500 },
    );
    try {
      const accountEmail = activeAccount === "all" ? undefined : activeAccount;
      const result = await gmailApi.cleanUnwanted(1000, accountEmail);
      const deleted = result.deleted || 0;
      setCleanEmails((prev) =>
        accountEmail ? prev.filter((e) => e.accountId !== accountEmail) : [],
      );
      setEmails((prev) =>
        prev.filter((e) => {
          if (accountEmail && e.accountId !== accountEmail) return true;
          return !e.isSpam && e.category !== "promo" && e.category !== "social";
        }),
      );
      if (deleted === 0) {
        toast.info(`No promotional or spam mail found for ${scopeLabel}`, {
          position: "top-center",
          duration: 2500,
        });
      } else {
        const breakdown = (result.accounts || [])
          .filter((a) => (a.deleted || 0) > 0)
          .map((a) => `${a.deleted} · ${a.account}`)
          .join(" · ");
        toast.success(
          breakdown
            ? `Deleted ${deleted} unwanted message${deleted === 1 ? "" : "s"} (${breakdown})`
            : `Deleted ${deleted} unwanted message${deleted === 1 ? "" : "s"} from ${scopeLabel}`,
          { position: "top-center", duration: 4500 },
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
      toast.success(`Reply sent via ${email.accountId} → ${email.from}`, {
        position: "top-center",
        duration: 2200,
      });
      setReplyingId(null);
      setReplyText("");
      persistDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reply failed", { position: "top-center" });
    }
  };

  const connectedAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.connected).map((a) => a.id)),
    [accounts],
  );

  const matchesActiveAccount = useCallback(
    (accountId: string) => activeAccount === "all" || accountId === activeAccount,
    [activeAccount],
  );

  const groupedEmails = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    // Inbox = everyday mail only (promotions/spam live on Clean tab)
    const filtered = emails
      .filter((e) => connectedAccountIds.size === 0 || connectedAccountIds.has(e.accountId))
      .filter((e) => matchesActiveAccount(e.accountId))
      .filter((e) => !e.isSpam && e.category !== "promo" && e.category !== "social")
      .filter((e) => !importantOnly || e.important)
      .filter(
        (e) =>
          !q ||
          e.subject.toLowerCase().includes(q) ||
          e.from.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q) ||
          e.accountId.toLowerCase().includes(q),
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
  }, [emails, connectedAccountIds, matchesActiveAccount, importantOnly, searchTerm]);

  const visibleCleanEmails = useMemo(
    () => cleanEmails.filter((e) => matchesActiveAccount(e.accountId)),
    [cleanEmails, matchesActiveAccount],
  );

  const unreadCount = emails.filter(
    (e) =>
      !e.isRead &&
      !e.isSpam &&
      e.category !== "promo" &&
      e.category !== "social" &&
      matchesActiveAccount(e.accountId),
  ).length;
  const connectedCount = accounts.filter((a) => a.connected).length;

  const viewingLabel =
    activeAccount === "all"
      ? connectedCount > 1
        ? "All accounts"
        : accounts[0]?.email || "Gmail"
      : activeAccount;

  const ruleAccountEmail =
    activeAccount === "all" ? accounts[0]?.email : activeAccount;

  const visibleOrgRules = useMemo(() => {
    const filtered =
      activeAccount === "all"
        ? orgRules
        : orgRules.filter(
            (r) =>
              !r.account_email ||
              r.account_email === activeAccount ||
              r.account_email === "*",
          );
    return [...filtered].sort((a, b) => {
      const ae = a.enabled === false ? 1 : 0;
      const be = b.enabled === false ? 1 : 0;
      if (ae !== be) return ae - be;
      return String(b.label_name || "").localeCompare(String(a.label_name || ""));
    });
  }, [orgRules, activeAccount]);

  const saveOrgRule = async () => {
    const label = ruleLabel.trim();
    const value =
      ruleMatchType === "category"
        ? (ruleMatchValue.trim() || "promotions")
        : ruleMatchValue.trim();
    if (!label) {
      toast.error("Enter or select a label", { position: "top-center" });
      return;
    }
    if (ruleMatchType === "from" && !value) {
      toast.error("Enter a sender email or domain", { position: "top-center" });
      return;
    }
    const targets =
      activeAccount === "all"
        ? accounts.filter((a) => a.connected).map((a) => a.email)
        : ruleAccountEmail
          ? [ruleAccountEmail]
          : [];
    if (targets.length === 0) {
      toast.error("Connect a Gmail account first", { position: "top-center" });
      return;
    }
    setOrgSaving(true);
    try {
      let totalMoved = 0;
      const createdNew = !labels.some(
        (l) => l.name.toLowerCase() === label.toLowerCase(),
      );
      for (const acc of targets) {
        try {
          await gmailApi.createLabel(label, acc);
        } catch {
          /* label may already exist */
        }
        const result = await gmailApi.upsertRule({
          match_type: ruleMatchType,
          match_value: value,
          from_email: ruleMatchType === "from" ? value : undefined,
          label_name: label,
          account_email: acc,
          remove_inbox: ruleRemoveInbox,
          apply_now: true,
          enabled: true,
        });
        totalMoved += Number(result?.applied?.applied || 0);
      }
      lastAutoApplyKeyRef.current = "";
      const scope =
        targets.length > 1 ? `${targets.length} accounts` : targets[0];
      toast.success(
        totalMoved > 0
          ? `“${label}” ready on ${scope} · moved ${totalMoved} existing · future mail follows`
          : createdNew
            ? `Created “${label}” on ${scope} · future matching mail will move there`
            : `Rule saved on ${scope} · future matching mail → “${label}”`,
        { position: "top-center", duration: 3500 },
      );
      setRuleMatchValue("");
      setRuleLabel("");
      setLabelPickerOpen(false);
      void loadOrgRules();
      void loadFromBackend({ quiet: true });
      void refreshLabels(targets[0]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save rule", {
        position: "top-center",
      });
    } finally {
      setOrgSaving(false);
    }
  };

  const quickPromoRule = async () => {
    setRuleMatchType("category");
    setRuleMatchValue("promotions");
    setRuleRemoveInbox(true);
    const label = ruleLabel.trim() || "Promotions";
    setRuleLabel(label);
    const targets =
      activeAccount === "all"
        ? accounts.filter((a) => a.connected).map((a) => a.email)
        : ruleAccountEmail
          ? [ruleAccountEmail]
          : [];
    if (targets.length === 0) {
      toast.error("Connect a Gmail account first", { position: "top-center" });
      return;
    }
    setOrgSaving(true);
    try {
      let totalMoved = 0;
      for (const acc of targets) {
        try {
          await gmailApi.createLabel(label, acc);
        } catch {
          /* ignore */
        }
        const result = await gmailApi.upsertRule({
          match_type: "category",
          match_value: "promotions",
          label_name: label,
          account_email: acc,
          remove_inbox: true,
          apply_now: true,
          enabled: true,
        });
        totalMoved += Number(result?.applied?.applied || 0);
      }
      lastAutoApplyKeyRef.current = "";
      toast.success(
        totalMoved > 0
          ? `Promotions → “${label}” · moved ${totalMoved}`
          : `Promotions → “${label}” (new + future mail)`,
        { position: "top-center", duration: 3000 },
      );
      void loadOrgRules();
      void loadFromBackend({ quiet: true });
      void refreshLabels(targets[0]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save promo rule", {
        position: "top-center",
      });
    } finally {
      setOrgSaving(false);
    }
  };

  const removeOrgRule = async (id: string) => {
    setOrgRuleBusyId(id);
    try {
      await gmailApi.deleteRule(id);
      setOrgRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule removed", { position: "top-center", duration: 1500 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", {
        position: "top-center",
      });
    } finally {
      setOrgRuleBusyId(null);
    }
  };

  const toggleOrgRule = async (rule: OrgRule) => {
    setOrgRuleBusyId(rule.id);
    const nextEnabled = rule.enabled === false;
    try {
      const res = await gmailApi.patchRule(rule.id, { enabled: nextEnabled });
      const updated = res?.rule as OrgRule | undefined;
      setOrgRules((prev) =>
        prev.map((r) =>
          r.id === rule.id
            ? { ...r, ...(updated || {}), enabled: nextEnabled }
            : r,
        ),
      );
      toast.success(
        nextEnabled ? "Rule active again" : "Rule paused",
        { position: "top-center", duration: 1500 },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update rule", {
        position: "top-center",
      });
    } finally {
      setOrgRuleBusyId(null);
    }
  };

  const applyOneOrgRule = async (rule: OrgRule) => {
    if (rule.enabled === false) {
      toast.error("Resume the rule before applying", { position: "top-center" });
      return;
    }
    setOrgRuleBusyId(rule.id);
    try {
      const accountEmail = rule.account_email || (activeAccount === "all" ? undefined : activeAccount);
      const res = await gmailApi.applyRules(accountEmail || undefined, rule.id);
      const moved = Number(res?.applied || 0);
      toast.success(
        moved > 0
          ? `Moved ${moved} → “${rule.label_name}”`
          : `No new matches for “${rule.label_name}”`,
        { position: "top-center", duration: 2500 },
      );
      void loadOrgRules();
      void loadFromBackend({ quiet: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed", {
        position: "top-center",
      });
    } finally {
      setOrgRuleBusyId(null);
    }
  };

  const applyAllOrgRules = async () => {
    if (orgApplying) return;
    const activeCount = visibleOrgRules.filter((r) => r.enabled !== false).length;
    if (activeCount === 0) {
      toast.error("No active rules to apply", { position: "top-center" });
      return;
    }
    setOrgApplying(true);
    try {
      const accountEmail = activeAccount === "all" ? undefined : activeAccount;
      const res = await gmailApi.applyRules(accountEmail);
      const moved = Number(res?.applied || 0);
      toast.success(
        moved > 0
          ? `Organized ${moved} email${moved === 1 ? "" : "s"} into labels`
          : "No matching mail to organize right now",
        { position: "top-center", duration: 2800 },
      );
      void loadOrgRules();
      void loadFromBackend({ quiet: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed", {
        position: "top-center",
      });
    } finally {
      setOrgApplying(false);
    }
  };

  const ruleSourceLabel = (rule: OrgRule) => {
    const mtype = rule.match_type || "from";
    const mval = rule.match_value || rule.from_email || "";
    if (mtype === "category") {
      const pretty =
        mval === "promotions"
          ? "Promotions"
          : mval === "social"
            ? "Social"
            : mval === "updates"
              ? "Updates"
              : mval === "forums"
                ? "Forums"
                : mval;
      return `Category · ${pretty}`;
    }
    if (mtype === "query") return `Query · ${mval}`;
    return `From · ${mval}`;
  };

  const renderAccountSwitcher = () => {
    if (accounts.length === 0) return null;
    return (
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Account
          </p>
          <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
            Viewing {viewingLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {accounts.length > 1 && (
            <button
              type="button"
              onClick={() => selectAccount("all")}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                activeAccount === "all"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background/60 text-foreground hover:border-foreground/40",
              )}
            >
              All accounts
            </button>
          )}
          {accounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => selectAccount(acc.id)}
              title={acc.email}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                activeAccount === acc.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background/60 text-foreground hover:border-foreground/40",
              )}
            >
              {accountShort(acc.email)}
            </button>
          ))}
        </div>
      </div>
    );
  };

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
                      {activeAccount === acc.id ? " · viewing" : ""}
                    </>
                  ) : (
                    "Disconnected"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {acc.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      selectAccount(acc.id);
                      setActiveTab("inbox");
                    }}
                  >
                    <Inbox className="h-3.5 w-3.5 mr-1" /> Inbox
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => removeAccount(acc.id)}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
                </Button>
              </div>
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
    const bodyText = (email.body || email.preview || "").trim();
    const loadingBody = bodyLoadingId === email.id;
    const showAccount = accounts.length > 1;
    return (
      <div
        key={`${email.accountId}:${email.id}`}
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
              onClick={() => void openEmail(email)}
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{email.from}</p>
                {!email.isRead && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                {email.replied && <Reply className="h-3 w-3 text-green-500 shrink-0" />}
                <span className={cn("h-2 w-2 rounded-full shrink-0 ml-auto", CATEGORY_COLORS[email.category])} />
              </div>
              {showAccount && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={email.accountId}>
                  Inbox · {email.accountId}
                </p>
              )}
              <p className={cn("text-xs truncate mt-0.5", email.isRead ? "text-muted-foreground" : "text-foreground font-medium")}>
                {email.subject}
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-1">{email.preview}</p>
              <span className="text-[10px] text-muted-foreground">{timeLabel(email.timestamp)}</span>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Account: <span className="text-foreground">{email.accountId}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  To: <span className="text-foreground">{email.to || "me"}</span>
                </p>
                <p className="text-xs font-medium text-foreground">{email.subject}</p>
              </div>

              {loadingBody ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading message…
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-border/40 bg-muted/10 p-3">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {bodyText || "No message content."}
                  </p>
                </div>
              )}

              <div className="p-2.5 rounded-md bg-muted/20 border border-border">
                <p className="text-[11px] font-medium text-purple-300 flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3" /> Summary
                </p>
                <p className="text-xs text-foreground">
                  {email.summary || bodyText.slice(0, 220) || email.preview}
                </p>
              </div>

              {replying ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    placeholder={`Reply to ${email.from}...`}
                    value={replyText}
                    onChange={(e) => {
                      const next = e.target.value;
                      setReplyText(next);
                      persistDraft({
                        messageId: email.id,
                        accountEmail: email.accountId,
                        draftText: next,
                        from: email.from,
                        subject: email.subject,
                      });
                    }}
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
                  <Button size="sm" className="bg-white text-black hover:bg-gray-200 h-8 text-xs" onClick={() => {
                    setReplyingId(email.id);
                    try {
                      const raw = usGetItem(GMAIL_DRAFT_KEY);
                      const d = raw ? JSON.parse(raw) : null;
                      if (d?.messageId === email.id && d?.draftText) {
                        setReplyText(String(d.draftText));
                        return;
                      }
                    } catch {
                      /* ignore */
                    }
                    setReplyText("");
                  }}>
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
        {renderAccountSwitcher()}

        {/* Always show Gmail labels on the page (not only in chat) */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Labels</p>
            <span className="text-[10px] text-muted-foreground">
              {labels.length} custom
              {activeAccount !== "all" ? ` · ${accountShort(activeAccount)}` : ""}
            </span>
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

  const renderOrganize = () => {
    if (accounts.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground max-w-sm mx-auto space-y-2">
          <FolderKanban className="h-10 w-10 mx-auto opacity-40" />
          <p className="text-sm font-medium text-foreground">Connect Gmail first</p>
          <p className="text-xs">Then set rules so mail auto-moves into the right labels.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 max-w-2xl">
        {renderAccountSwitcher()}

        <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
          <p className="text-sm font-medium text-foreground">Mail organize</p>
          <p className="text-xs text-muted-foreground">
            When matching mail arrives, it is filed into your label automatically
            {ruleAccountEmail ? ` · rules for ${ruleAccountEmail}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="h-8 text-xs bg-white text-black hover:bg-gray-200"
              onClick={() => void quickPromoRule()}
              disabled={orgSaving}
            >
              {orgSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Move promotions → Promotions
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => void applyAllOrgRules()}
              disabled={orgApplying || visibleOrgRules.length === 0}
            >
              {orgApplying ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Apply rules now
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-black p-3 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            New rule
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setRuleMatchType("from");
                setRuleMatchValue("");
              }}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]",
                ruleMatchType === "from"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background/60 text-foreground",
              )}
            >
              From sender
            </button>
            <button
              type="button"
              onClick={() => {
                setRuleMatchType("category");
                setRuleMatchValue("promotions");
                if (!ruleLabel.trim()) setRuleLabel("Promotions");
              }}
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]",
                ruleMatchType === "category"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background/60 text-foreground",
              )}
            >
              Promotions / category
            </button>
          </div>

          {ruleMatchType === "from" ? (
            <Input
              placeholder="Sender email or domain (e.g. billing@stripe.com)"
              value={ruleMatchValue}
              onChange={(e) => setRuleMatchValue(e.target.value)}
              className="text-sm bg-muted/10 border-border h-9"
            />
          ) : (
            <select
              value={ruleMatchValue || "promotions"}
              onChange={(e) => setRuleMatchValue(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-muted/10 px-2 text-sm text-foreground"
            >
              <option value="promotions">Promotions</option>
              <option value="social">Social</option>
              <option value="updates">Updates</option>
              <option value="forums">Forums</option>
            </select>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">Move to label</p>
            <button
              type="button"
              onClick={() => {
                setLabelPickerOpen((v) => !v);
                if (!labelPickerOpen) void refreshLabels(ruleAccountEmail);
              }}
              className={cn(
                "w-full flex items-center justify-between rounded-md border px-3 h-9 text-left text-sm transition-colors",
                labelPickerOpen
                  ? "border-foreground bg-muted/20"
                  : "border-border bg-muted/10 hover:border-foreground/40",
              )}
            >
              <span className={cn("truncate", ruleLabel ? "text-foreground" : "text-muted-foreground")}>
                {ruleLabel || "Click to choose a label…"}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                {labels.length} label{labels.length === 1 ? "" : "s"}
              </span>
            </button>

            {labelPickerOpen && (
              <div className="rounded-md border border-border/60 bg-muted/10 p-2 max-h-40 overflow-y-auto space-y-1">
                {labels.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1 py-2">
                    No labels yet — type a new name below to create one.
                  </p>
                ) : (
                  labels.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setRuleLabel(l.name);
                        setLabelPickerOpen(false);
                      }}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors",
                        ruleLabel === l.name
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-muted/40",
                      )}
                    >
                      {l.name}
                    </button>
                  ))
                )}
              </div>
            )}

            <Input
              placeholder="Or type a new label name (creates it)"
              value={ruleLabel}
              onChange={(e) => setRuleLabel(e.target.value)}
              className="text-sm bg-muted/10 border-border h-9"
            />
            {ruleLabel.trim() &&
              !labels.some(
                (l) => l.name.toLowerCase() === ruleLabel.trim().toLowerCase(),
              ) && (
                <p className="text-[10px] text-muted-foreground">
                  “{ruleLabel.trim()}” will be created, then matching mail moves there
                  (existing + new).
                </p>
              )}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={ruleRemoveInbox}
              onChange={(e) => setRuleRemoveInbox(e.target.checked)}
              className="rounded border-border"
            />
            Remove from Inbox after filing (keep under the label)
          </label>

          <Button
            size="sm"
            className="w-full h-9 bg-white text-black hover:bg-gray-200 text-xs"
            onClick={() => void saveOrgRule()}
            disabled={orgSaving}
          >
            {orgSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FolderKanban className="h-3.5 w-3.5 mr-1" />}
            {labels.some(
              (l) => l.name.toLowerCase() === ruleLabel.trim().toLowerCase(),
            )
              ? "Save rule · move existing + future"
              : "Create label · move existing + future"}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Active rules
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {visibleOrgRules.filter((r) => r.enabled !== false).length} running ·{" "}
                {visibleOrgRules.filter((r) => r.enabled === false).length} paused
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void loadOrgRules()}
                disabled={orgLoading}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1", orgLoading && "animate-spin")} />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-white text-black hover:bg-gray-200"
                onClick={() => void applyAllOrgRules()}
                disabled={orgApplying || visibleOrgRules.every((r) => r.enabled === false)}
              >
                {orgApplying ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1" />
                )}
                Apply all
              </Button>
            </div>
          </div>

          {orgLoading && visibleOrgRules.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
            </div>
          ) : visibleOrgRules.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-black p-4 text-center space-y-1">
              <FolderKanban className="h-8 w-8 mx-auto opacity-40 text-muted-foreground" />
              <p className="text-sm text-foreground">No organization rules yet</p>
              <p className="text-xs text-muted-foreground">
                Create one above — existing mail moves now, new mail follows automatically.
              </p>
            </div>
          ) : (
            visibleOrgRules.map((rule) => {
              const busy = orgRuleBusyId === rule.id;
              const paused = rule.enabled === false;
              const lastApplied = rule.last_applied_at
                ? new Date(rule.last_applied_at).toLocaleString()
                : null;
              return (
                <div
                  key={rule.id}
                  className={cn(
                    "rounded-lg border bg-black p-3 space-y-2",
                    paused ? "border-border/40 opacity-70" : "border-border/60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">{ruleSourceLabel(rule)}</span>
                          {" "}→{" "}
                          <span className="font-medium">{rule.label_name}</span>
                        </p>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                            paused
                              ? "border-border text-muted-foreground"
                              : "border-green-500/40 text-green-400",
                          )}
                        >
                          {paused ? "Paused" : "Active"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {rule.remove_inbox ? "Removes from Inbox" : "Keeps in Inbox"}
                        {" · "}
                        {rule.account_email || "any account"}
                        {typeof rule.applied_count === "number"
                          ? ` · filed ${rule.applied_count}`
                          : ""}
                        {lastApplied ? ` · last run ${lastApplied}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pl-6">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={busy}
                      onClick={() => void toggleOrgRule(rule)}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : paused ? (
                        <Play className="h-3 w-3 mr-1" />
                      ) : (
                        <Pause className="h-3 w-3 mr-1" />
                      )}
                      {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={busy || paused}
                      onClick={() => void applyOneOrgRule(rule)}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Apply now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-red-400"
                      disabled={busy}
                      onClick={() => void removeOrgRule(rule.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
        {renderAccountSwitcher()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Mails to clean</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Promotional / newsletter / spam for{" "}
              <span className="text-foreground">{viewingLabel}</span> — not everyday Inbox.
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
              disabled={cleaning || cleanLoading || visibleCleanEmails.length === 0}
            >
              {cleaning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              {cleaning ? "Deleting…" : `Delete all (${visibleCleanEmails.length})`}
            </Button>
          </div>
        </div>

        {cleanLoading && visibleCleanEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            <p className="text-sm">Scanning promotional mail…</p>
            <p className="text-xs mt-1 opacity-70">{viewingLabel}</p>
          </div>
        ) : visibleCleanEmails.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50 text-green-500" />
            <p className="text-sm">Nothing to clean for {viewingLabel}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Showing {visibleCleanEmails.length} message
              {visibleCleanEmails.length === 1 ? "" : "s"} ready to remove
              {accounts.length > 1 ? ` · ${viewingLabel}` : ""}
            </p>
            {visibleCleanEmails.map((email) => (
              <div
                key={`${email.accountId}:${email.id}`}
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
                  {accounts.length > 1 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      Account · {email.accountId}
                    </p>
                  )}
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
            {connectedCount > 1 ? ` · ${viewingLabel}` : ""}
            {visibleCleanEmails.length > 0 && activeTab === "clean"
              ? ` · ${visibleCleanEmails.length} to clean`
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
              { id: "organize", label: "Organize", Icon: FolderKanban },
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
              {id === "organize" && visibleOrgRules.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  ({visibleOrgRules.length})
                </span>
              )}
              {id === "clean" && visibleCleanEmails.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  ({visibleCleanEmails.length})
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
              : activeTab === "organize"
                ? renderOrganize()
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
