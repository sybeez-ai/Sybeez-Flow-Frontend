import { authHeaders, usGetItem, usSetItem } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const BASE = () => `${getApiBase()}/api/feedback`;

export type FeedbackStatus = {
  submitted: boolean;
  count?: number;
  can_submit?: boolean;
  is_admin: boolean;
};

export type FeedbackSubmitBody = {
  satisfaction: number;
  issues: string;
  improve: string;
  category: string;
  recommend: boolean;
};

export type FeedbackAdminItem = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  satisfaction: number;
  issues: string;
  improve: string;
  category: string;
  recommend: boolean;
  created_at: string;
};

const LOCAL_FLAG = "sybeez_feedback_submitted";

export function markFeedbackSubmittedLocal() {
  usSetItem(LOCAL_FLAG, "1");
}

export function isFeedbackSubmittedLocal(): boolean {
  return usGetItem(LOCAL_FLAG) === "1";
}

export async function fetchFeedbackStatus(): Promise<FeedbackStatus> {
  const res = await fetch(`${BASE()}/status`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load feedback status");
  const data = (await res.json()) as FeedbackStatus;
  if (data.submitted) markFeedbackSubmittedLocal();
  return {
    ...data,
    can_submit: data.can_submit !== false,
  };
}

export async function submitFeedback(body: FeedbackSubmitBody): Promise<void> {
  const res = await fetch(`${BASE()}/submit`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.detail === "string" ? err.detail : "Failed to submit feedback",
    );
  }
  markFeedbackSubmittedLocal();
}

export async function fetchAdminFeedback(): Promise<FeedbackAdminItem[]> {
  const res = await fetch(`${BASE()}/admin`, { headers: authHeaders() });
  if (res.status === 403) return [];
  if (!res.ok) throw new Error("Could not load feedback inbox");
  return (await res.json()) as FeedbackAdminItem[];
}
