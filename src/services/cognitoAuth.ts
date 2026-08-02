/**
 * AWS Cognito Hosted UI — Google login via authorization code + PKCE.
 */

import { getApiBase } from "@/services/apiBase";

const BACKEND_URL = getApiBase();

const PKCE_VERIFIER_KEY = "sybeez_cognito_pkce_verifier";
const PKCE_STATE_KEY = "sybeez_cognito_oauth_state";
const OAUTH_MODE_KEY = "sybeez_oauth_mode";

export type CognitoAuthConfig = {
  cognito_enabled: boolean;
  cognito_google_enabled: boolean;
  cognito_app_client_id: string;
  cognito_domain: string;
  cognito_redirect_uri: string;
  google_sign_in_enabled: boolean;
  google_client_id: string;
};

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer);
}

async function sha256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export async function fetchAuthConfig(): Promise<CognitoAuthConfig | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/config`);
    if (!res.ok) return null;
    return (await res.json()) as CognitoAuthConfig;
  } catch {
    return null;
  }
}

/** Start Cognito Hosted UI Google login (redirects away). */
export async function startCognitoGoogleLogin(
  mode: "signin" | "signup" = "signin",
): Promise<void> {
  const verifier = randomString(32);
  const state = randomString(16);
  const challenge = await sha256Challenge(verifier);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_MODE_KEY, mode);

  const res = await fetch(`${BACKEND_URL}/api/auth/cognito/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      code_challenge: challenge,
      identity_provider: "Google",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Cognito Google login is not configured",
    );
  }
  const url = data?.authorize_url as string | undefined;
  if (!url) throw new Error("Missing Cognito authorize URL");
  window.location.assign(url);
}

export async function completeCognitoCallback(params: {
  code: string;
  state: string;
}): Promise<{
  access_token: string;
  expires_in: number;
  is_new_user?: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string | null;
    email_verified?: boolean;
  };
}> {
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const modeRaw = sessionStorage.getItem(OAUTH_MODE_KEY) || "signin";
  const mode = modeRaw === "signup" ? "signup" : "signin";
  if (!verifier) {
    throw new Error("Missing PKCE verifier — restart Google sign-in");
  }
  if (expectedState && params.state && expectedState !== params.state) {
    throw new Error("Invalid OAuth state — try signing in again");
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/cognito/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: params.code,
      code_verifier: verifier,
      state: params.state,
      mode,
    }),
  });
  const data = await res.json().catch(() => ({}));
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(OAUTH_MODE_KEY);

  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string" ? data.detail : "Cognito sign-in failed",
    );
  }
  return data;
}
