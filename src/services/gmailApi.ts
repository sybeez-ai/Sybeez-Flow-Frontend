/**
 * Real Gmail API client — Web OAuth connect + inbox operations.
 * All requests send the Sybeez auth token so the backend scopes Gmail to this user.
 */

import { authHeaders } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const API_URL = (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

export interface GmailEmail {
  id: string;
  from_email: string;
  to: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_read: boolean;
  is_spam: boolean;
  important?: boolean;
  labels: string[];
  account_id?: string | null;
  account_email?: string | null;
  clean_reason?: string | null;
  body?: string | null;
}

export interface GmailAccount {
  id: string;
  email: string;
  connected: boolean;
  connected_at?: string;
}

export interface GmailStatus {
  available: boolean;
  configured?: boolean;
  authenticated: boolean;
  user_email: string | null;
  accounts?: GmailAccount[];
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail ?? data?.error;
    if (typeof detail === "string") {
      if (res.status === 404 && /not found|endpoint/i.test(detail)) {
        return "Gmail API is not loaded on the backend. Restart backend with: cd fastapibackend && ./start.sh";
      }
      return detail;
    }
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(", ");
    return res.statusText || "Request failed";
  } catch {
    if (res.status === 404) {
      return "Gmail API is not loaded on the backend. Restart backend with: cd fastapibackend && ./start.sh";
    }
    return res.statusText || "Request failed";
  }
}

class GmailApiService {
  private apiUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.apiUrl = baseUrl;
  }

  private req(init: RequestInit = {}): RequestInit {
    const extra = (init.headers || {}) as Record<string, string>;
    return {
      ...init,
      headers: authHeaders(extra),
    };
  }

  async getStatus(): Promise<GmailStatus> {
    const response = await fetch(`${this.apiUrl}/api/gmail/status`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  /** Start Google OAuth — returns URL to open (no email typing). */
  async startOAuth(): Promise<{ authorization_url: string; state: string }> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/api/gmail/oauth/start`, this.req());
    } catch {
      throw new Error(
        "Cannot reach backend at " +
          this.apiUrl +
          ". Start it with: python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload",
      );
    }
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getAccounts(): Promise<GmailAccount[]> {
    const response = await fetch(`${this.apiUrl}/api/gmail/accounts`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    const data = await response.json();
    return data.accounts || [];
  }

  async disconnectAccount(email: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/accounts/${encodeURIComponent(email)}`,
      this.req({ method: "DELETE" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  async getEmails(maxResults: number = 25, accountEmail?: string): Promise<GmailEmail[]> {
    const params = new URLSearchParams({
      max_results: String(Math.min(maxResults, 100)),
    });
    if (accountEmail) params.set("account_email", accountEmail);
    const response = await fetch(`${this.apiUrl}/api/gmail/emails?${params}`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getEmail(messageId: string, accountEmail?: string): Promise<GmailEmail> {
    const params = accountEmail
      ? `?account_email=${encodeURIComponent(accountEmail)}`
      : "";
    const response = await fetch(
      `${this.apiUrl}/api/gmail/emails/${encodeURIComponent(messageId)}${params}`,
      this.req(),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async markAsRead(messageId: string, accountEmail?: string): Promise<void> {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(
      `${this.apiUrl}/api/gmail/emails/${messageId}/read${params}`,
      this.req({ method: "POST" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  async deleteEmail(messageId: string, accountEmail?: string): Promise<void> {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(
      `${this.apiUrl}/api/gmail/emails/${messageId}/delete${params}`,
      this.req({ method: "POST" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  /** Trash all promotions / spam / newsletter junk across connected accounts. */
  async cleanUnwanted(
    maxPerQuery = 1000,
    accountEmail?: string,
  ): Promise<{
    success: boolean;
    deleted: number;
    found: number;
    accounts?: Array<{ account?: string; deleted?: number; found?: number }>;
  }> {
    const params = new URLSearchParams({
      max_per_query: String(Math.min(Math.max(maxPerQuery, 50), 2000)),
    });
    if (accountEmail) params.set("account_email", accountEmail);
    const response = await fetch(
      `${this.apiUrl}/api/gmail/emails/clean?${params}`,
      this.req({ method: "POST" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  /** List mail that Clean would remove (all dates — promotions/newsletters/spam). */
  async listCleanEmails(
    maxPerQuery = 200,
    accountEmail?: string,
  ): Promise<{ count: number; emails: GmailEmail[] }> {
    const params = new URLSearchParams({
      max_per_query: String(Math.min(Math.max(maxPerQuery, 20), 500)),
    });
    if (accountEmail) params.set("account_email", accountEmail);
    const response = await fetch(
      `${this.apiUrl}/api/gmail/emails/clean-list?${params}`,
      this.req(),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async sendReply(messageId: string, replyText: string, accountEmail?: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/reply`,
      this.req({
        method: "POST",
        body: JSON.stringify({
          message_id: messageId,
          reply_text: replyText,
          account_email: accountEmail || null,
        }),
      }),
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  async searchEmails(query: string, maxResults = 30, accountEmail?: string) {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/search`,
      this.req({
        method: "POST",
        body: JSON.stringify({
          query,
          max_results: maxResults,
          account_email: accountEmail || null,
        }),
      }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getLabels(accountEmail?: string) {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/labels${params}`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async createLabel(name: string, accountEmail?: string) {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/labels`,
      this.req({
        method: "POST",
        body: JSON.stringify({ name, account_email: accountEmail || null }),
      }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async upsertRule(payload: {
    from_email?: string;
    label_name: string;
    match_type?: "from" | "category" | "query";
    match_value?: string;
    account_email?: string;
    remove_inbox?: boolean;
    apply_now?: boolean;
    enabled?: boolean;
    id?: string;
  }) {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/rules`,
      this.req({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async listRules(accountEmail?: string) {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/rules${params}`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async deleteRule(ruleId: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/rules/${encodeURIComponent(ruleId)}`,
      this.req({ method: "DELETE" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  async patchRule(
    ruleId: string,
    updates: { enabled?: boolean; remove_inbox?: boolean },
  ) {
    const params = new URLSearchParams();
    if (typeof updates.enabled === "boolean") {
      params.set("enabled", String(updates.enabled));
    }
    if (typeof updates.remove_inbox === "boolean") {
      params.set("remove_inbox", String(updates.remove_inbox));
    }
    const response = await fetch(
      `${this.apiUrl}/api/gmail/rules/${encodeURIComponent(ruleId)}?${params}`,
      this.req({ method: "PATCH" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async applyRules(accountEmail?: string, ruleId?: string) {
    const params = new URLSearchParams();
    if (accountEmail) params.set("account_email", accountEmail);
    if (ruleId) params.set("rule_id", ruleId);
    const qs = params.toString();
    const response = await fetch(
      `${this.apiUrl}/api/gmail/rules/apply${qs ? `?${qs}` : ""}`,
      this.req({ method: "POST" }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getEvents() {
    const response = await fetch(`${this.apiUrl}/api/gmail/events`, this.req());
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async markEventsReminded(ids: string[]) {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/events/reminded`,
      this.req({
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
}

const gmailApi = new GmailApiService();
export default gmailApi;
export { gmailApi };
