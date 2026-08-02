import { authHeaders, usGetItem, usSetItem } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const BASE = () => `${getApiBase()}/api/feedback`;

export type FeedbackStatus = {
  submitted: boolean;
  count?: number;
  can_submit?: boolean;
  is_admin: boolean;
};

export type WillingnessToPay = "yes" | "maybe" | "no";
export type PriceRange = "5_10" | "10_20" | "20_30" | "30_plus" | "wouldnt_pay";

export type FeedbackSubmitBody = {
  satisfaction: number;
  issues: string;
  improve: string;
  category: string;
  recommend: boolean;
  willingness_to_pay: WillingnessToPay;
  price_range: PriceRange;
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
  willingness_to_pay?: string;
  price_range?: string;
  created_at: string;
};

const LOCAL_FLAG = "sybeez_feedback_submitted";

export const WILLINGNESS_OPTIONS: { value: WillingnessToPay; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

export const PRICE_OPTIONS: { value: PriceRange; label: string }[] = [
  { value: "5_10", label: "€5–10" },
  { value: "10_20", label: "€10–20" },
  { value: "20_30", label: "€20–30" },
  { value: "30_plus", label: "More than €30" },
  { value: "wouldnt_pay", label: "I wouldn't pay" },
];

export function labelWillingness(v?: string): string {
  return WILLINGNESS_OPTIONS.find((o) => o.value === v)?.label || v || "—";
}

export function labelPriceRange(v?: string): string {
  return PRICE_OPTIONS.find((o) => o.value === v)?.label || v || "—";
}

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
  let res: Response;
  try {
    res = await fetch(`${BASE()}/submit`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Could not reach the API. Make sure the backend is running on localhost:8000.",
    );
  }
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
