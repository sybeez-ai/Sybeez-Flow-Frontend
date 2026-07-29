/**
 * Persist assistant chat threads to the FastAPI SQLite store.
 * Messages are never deleted server-side (archive only).
 * Session IDs are prefixed with the signed-in user so threads never collide.
 */

import {
  authHeaders,
  currentUserId,
  stripUserSessionPrefix,
  userSessionId,
} from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const API_URL = getApiBase();

export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface ChatSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  archived: boolean;
}

export const OPEN_CHAT_SESSION_EVENT = "sybeez-open-chat-session";

export type OpenChatSessionDetail = {
  sessionId: string;
  title?: string;
};

export async function loadChatSession(
  sessionId: string,
): Promise<StoredChatMessage[]> {
  const sid = userSessionId(sessionId);
  try {
    const res = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(sid)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const msgs = json?.messages ?? json?.data?.messages ?? [];
    if (!Array.isArray(msgs)) return [];
    return msgs
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim(),
      )
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content),
        timestamp: typeof m.timestamp === "number" ? m.timestamp : undefined,
      }));
  } catch {
    return [];
  }
}

/** Sync full thread to DB (append-only / idempotent). */
export async function persistChatSession(
  sessionId: string,
  messages: StoredChatMessage[],
  title?: string,
): Promise<void> {
  const sid = userSessionId(sessionId);
  try {
    await fetch(`${API_URL}/api/sessions/${encodeURIComponent(sid)}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        title,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* offline — chat still works from local React state */
  }
}

/** Soft-archive a session so UI can start fresh without deleting DB rows. */
export async function archiveChatSession(sessionId: string): Promise<void> {
  const sid = userSessionId(sessionId);
  try {
    await fetch(`${API_URL}/api/sessions/${encodeURIComponent(sid)}`, {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* ignore */
  }
}

export async function unarchiveChatSession(sessionId: string): Promise<void> {
  const sid = userSessionId(sessionId);
  try {
    await fetch(
      `${API_URL}/api/sessions/${encodeURIComponent(sid)}/unarchive`,
      { method: "POST", headers: authHeaders(), signal: AbortSignal.timeout(5000) },
    );
  } catch {
    /* ignore */
  }
}

/** List every chat thread for the current user (including archived). */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const uid = currentUserId();
  const prefix = uid ? `u:${uid}:` : "u:anon:";
  try {
    const res = await fetch(`${API_URL}/api/sessions?include_archived=true`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json?.sessions ?? [];
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r: any) => ({
        sessionId: String(r.session_id || r.sessionKey || ""),
        title: String(r.title || "Chat").trim() || "Chat",
        updatedAt: Number(r.updatedAt || r.updated_at || 0),
        messageCount: Number(r.messageCount || r.message_count || 0),
        archived: Boolean(r.archived),
      }))
      .filter(
        (r: ChatSessionSummary) =>
          r.sessionId &&
          r.messageCount > 0 &&
          r.sessionId.startsWith(prefix),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function openChatSession(sessionId: string, title?: string) {
  window.dispatchEvent(
    new CustomEvent<OpenChatSessionDetail>(OPEN_CHAT_SESSION_EVENT, {
      detail: { sessionId, title },
    }),
  );
}

/** Map a session id to the app module that owns it. */
export function viewForSessionId(
  sessionId: string,
): "home" | "finance" | "planner" | "diary" | "gmail" {
  const id = stripUserSessionPrefix(sessionId).toLowerCase();
  if (id.startsWith("finance")) return "finance";
  if (id.startsWith("productivity") || id.startsWith("planner")) return "planner";
  if (id.startsWith("diary")) return "diary";
  if (id.startsWith("gmail") || id.startsWith("email")) return "gmail";
  return "home";
}

export function baseSessionKey(sessionId: string): string {
  const view = viewForSessionId(sessionId);
  if (view === "finance") return "finance-assistant";
  if (view === "planner") return "productivity-coach";
  if (view === "diary") return "diary-assistant";
  if (view === "gmail") return "gmail-assistant";
  return "home-assistant";
}
