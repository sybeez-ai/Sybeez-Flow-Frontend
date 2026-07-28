/**
 * Real Gmail API client — Web OAuth connect + inbox operations.
 */

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

  async getStatus(): Promise<GmailStatus> {
    const response = await fetch(`${this.apiUrl}/api/gmail/status`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  /** Start Google OAuth — returns URL to open (no email typing). */
  async startOAuth(): Promise<{ authorization_url: string; state: string }> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/api/gmail/oauth/start`);
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
    const response = await fetch(`${this.apiUrl}/api/gmail/accounts`);
    if (!response.ok) throw new Error(await parseError(response));
    const data = await response.json();
    return data.accounts || [];
  }

  async disconnectAccount(email: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/gmail/accounts/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error(await parseError(response));
  }

  async getEmails(maxResults: number = 25, accountEmail?: string): Promise<GmailEmail[]> {
    const params = new URLSearchParams({
      max_results: String(Math.min(maxResults, 100)),
    });
    if (accountEmail) params.set("account_email", accountEmail);
    const response = await fetch(`${this.apiUrl}/api/gmail/emails?${params}`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async markAsRead(messageId: string, accountEmail?: string): Promise<void> {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/emails/${messageId}/read${params}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await parseError(response));
  }

  async deleteEmail(messageId: string, accountEmail?: string): Promise<void> {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/emails/${messageId}/delete${params}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await parseError(response));
  }

  /** Trash all promotions / spam / newsletter junk across connected accounts. */
  async cleanUnwanted(maxPerQuery = 1000): Promise<{
    success: boolean;
    deleted: number;
    found: number;
    accounts?: Array<{ account?: string; deleted?: number; found?: number }>;
  }> {
    const params = new URLSearchParams({
      max_per_query: String(Math.min(Math.max(maxPerQuery, 50), 2000)),
    });
    const response = await fetch(`${this.apiUrl}/api/gmail/emails/clean?${params}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  /** List mail that Clean would remove (all dates — promotions/newsletters/spam). */
  async listCleanEmails(maxPerQuery = 200): Promise<{ count: number; emails: GmailEmail[] }> {
    const params = new URLSearchParams({
      max_per_query: String(Math.min(Math.max(maxPerQuery, 20), 500)),
    });
    const response = await fetch(`${this.apiUrl}/api/gmail/emails/clean-list?${params}`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async sendReply(messageId: string, replyText: string, accountEmail?: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/api/gmail/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: messageId,
        reply_text: replyText,
        account_email: accountEmail || null,
      }),
    });
    if (!response.ok) throw new Error(await parseError(response));
  }

  async searchEmails(query: string, maxResults = 30, accountEmail?: string) {
    const response = await fetch(`${this.apiUrl}/api/gmail/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        account_email: accountEmail || null,
      }),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getLabels(accountEmail?: string) {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/labels${params}`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async createLabel(name: string, accountEmail?: string) {
    const response = await fetch(`${this.apiUrl}/api/gmail/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, account_email: accountEmail || null }),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async upsertRule(payload: {
    from_email: string;
    label_name: string;
    account_email?: string;
    remove_inbox?: boolean;
    apply_now?: boolean;
  }) {
    const response = await fetch(`${this.apiUrl}/api/gmail/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async listRules(accountEmail?: string) {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/rules${params}`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async applyRules(accountEmail?: string) {
    const params = accountEmail ? `?account_email=${encodeURIComponent(accountEmail)}` : "";
    const response = await fetch(`${this.apiUrl}/api/gmail/rules/apply${params}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async getEvents() {
    const response = await fetch(`${this.apiUrl}/api/gmail/events`);
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }

  async markEventsReminded(ids: string[]) {
    const response = await fetch(`${this.apiUrl}/api/gmail/events/reminded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
}

const gmailApi = new GmailApiService();
export default gmailApi;
export { gmailApi };
