import { usGetItem, usSetItem } from "@/services/userStorage";
// Lightweight conversation-history store shared across the app.
// Records the first user message of each chat session so the History
// panel can list real conversations (persisted in localStorage).

export interface HistoryEntry {
  id: string;
  query: string;
  sessionId: string;
  source: string;
  timestamp: number;
}

const STORAGE_KEY = "stabee_chat_history";
const MAX_ENTRIES = 100;
const EVENT = "stabee-history-updated";

function read(): HistoryEntry[] {
  try {
    const raw = usGetItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]) {
  try {
    usSetItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export const chatHistory = {
  getAll(): HistoryEntry[] {
    return read().sort((a, b) => b.timestamp - a.timestamp);
  },

  /** Record a new conversation. Skips duplicates of the most recent entry. */
  add(query: string, sessionId: string, source: string) {
    const text = query.trim();
    if (!text) return;
    const entries = read();
    if (entries.length && entries[0].query === text && entries[0].sessionId === sessionId) {
      return;
    }
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: text,
      sessionId,
      source,
      timestamp: Date.now(),
    };
    write([entry, ...entries]);
  },

  remove(id: string) {
    write(read().filter((e) => e.id !== id));
  },

  clear() {
    write([]);
  },

  subscribe(listener: () => void): () => void {
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", listener);
    return () => {
      window.removeEventListener(EVENT, listener);
      window.removeEventListener("storage", listener);
    };
  },
};
