import { usGetJSON, usSetJSON } from "@/services/userStorage";
import { getApiBase } from "@/services/apiBase";

const BACKEND_URL = getApiBase();

export const AUTH_TOKEN_KEY = "sybeez_auth_token";
export const AUTH_USER_KEY = "sybeez_auth_user";
export const ACCOUNTS_KEY = "sybeez_local_accounts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  email_verified?: boolean;
  /** Country detected on last login (IP-based) */
  lastLoginCountry?: string | null;
  lastLoginCountryCode?: string | null;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  access_token: string;
  expires_in: number;
  user: AuthUser;
  /** True when this auth call created the account (signup / first OAuth). */
  is_new_user?: boolean;
}

const TOUR_PENDING_KEY = "sybeez_tour_pending";

export function markTourPending(userId?: string | null): void {
  try {
    localStorage.setItem(TOUR_PENDING_KEY, userId || "1");
  } catch {
    /* ignore */
  }
}

export function clearTourPending(): void {
  try {
    localStorage.removeItem(TOUR_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function isTourPending(userId?: string | null): boolean {
  try {
    const v = localStorage.getItem(TOUR_PENDING_KEY);
    if (!v) return false;
    if (!userId) return true;
    return v === userId || v === "1";
  } catch {
    return false;
  }
}

export function tourDoneKey(userId: string): string {
  return `sybeez_tour_done:${userId}`;
}

export function isTourDone(userId: string): boolean {
  try {
    return localStorage.getItem(tourDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTourDone(userId: string): void {
  try {
    localStorage.setItem(tourDoneKey(userId), "1");
    clearTourPending();
  } catch {
    /* ignore */
  }
}

export interface LoginCountry {
  country: string;
  country_code: string;
  ip?: string;
}

interface LocalAccount {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  lastLoginCountry?: string;
  lastLoginCountryCode?: string;
  lastLoginAt?: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

function readAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: LocalAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Remove browser mirror of a deleted account so Sign-in cannot soft-recreate it. */
export function removeLocalAccountMirror(opts: { email?: string; userId?: string }): void {
  const email = (opts.email || "").trim().toLowerCase();
  const userId = (opts.userId || "").trim();
  if (!email && !userId) return;
  try {
    const next = readAccounts().filter((a) => {
      if (email && a.email === email) return false;
      if (userId && a.id === userId) return false;
      return true;
    });
    writeAccounts(next);
  } catch {
    /* ignore */
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function persistSession(session: AuthSession): void {
  localStorage.setItem(AUTH_TOKEN_KEY, session.access_token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));
}

export function isLocalToken(token: string | null | undefined): boolean {
  return Boolean(token && token.startsWith("local."));
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function syncProfileToSettings(user: AuthUser): void {
  try {
    const settings = usGetJSON<Record<string, any>>("sybeez_settings", {});
    settings.account = {
      ...(settings.account || {}),
      displayName: user.name || settings.account?.displayName || "",
      email: user.email || settings.account?.email || "",
      avatar: user.picture || settings.account?.avatar || "",
    };
    usSetJSON("sybeez_settings", settings);
  } catch {
    // non-fatal
  }
}

function sessionFromAccount(account: LocalAccount): AuthSession {
  const user: AuthUser = {
    id: account.id,
    name: account.name,
    email: account.email,
    picture: null,
    email_verified: false,
    lastLoginCountry: account.lastLoginCountry || null,
    lastLoginCountryCode: account.lastLoginCountryCode || null,
    lastLoginAt: account.lastLoginAt || null,
  };
  return {
    access_token: `local.${account.id}`,
    expires_in: 60 * 60 * 24 * 365,
    user,
  };
}

/** Detect login country from IP (backend first, then public fallback). */
export async function detectLoginCountry(): Promise<LoginCountry> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/country`);
    if (res.ok) {
      const data = (await res.json()) as LoginCountry;
      if (data?.country && data.country !== "Unknown") {
        return {
          country: data.country,
          country_code: data.country_code || "",
          ip: data.ip,
        };
      }
    }
  } catch {
    /* fall through */
  }

  // Browser sees the user's public IP (works even when API is localhost)
  try {
    const res = await fetch("https://ipwho.is/");
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        country?: string;
        country_code?: string;
        ip?: string;
      };
      if (data?.success !== false && data?.country) {
        return {
          country: data.country,
          country_code: data.country_code || "",
          ip: data.ip,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return { country: "Unknown", country_code: "" };
}

function updateLocalAccountLogin(
  userId: string,
  geo: LoginCountry,
  at: string,
): LocalAccount | null {
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.id === userId);
  if (idx === -1) return null;
  accounts[idx] = {
    ...accounts[idx],
    lastLoginCountry: geo.country,
    lastLoginCountryCode: geo.country_code,
    lastLoginAt: at,
  };
  writeAccounts(accounts);
  return accounts[idx];
}

/** After successful login/signup: store country on account + backend log. */
export async function recordLoginCountry(user: AuthUser): Promise<AuthUser> {
  const at = new Date().toISOString();
  const geo = await detectLoginCountry();

  updateLocalAccountLogin(user.id, geo, at);

  try {
    await fetch(`${BACKEND_URL}/api/auth/login-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        email: user.email,
        country: geo.country,
        country_code: geo.country_code,
        ip: geo.ip || "",
        at,
      }),
    });
  } catch {
    /* non-fatal */
  }

  const next: AuthUser = {
    ...user,
    lastLoginCountry: geo.country,
    lastLoginCountryCode: geo.country_code,
    lastLoginAt: at,
  };
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export async function signUpLocal(input: {
  name: string;
  email: string;
  password: string;
  verificationToken?: string;
  country?: string;
  countryCode?: string;
  consentKind?: string;
}): Promise<AuthSession> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (name.length < 2) throw new Error("Enter your full name");
  if (!email.includes("@")) throw new Error("Enter a valid email");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!input.verificationToken) {
    throw new Error("Verify your email with the OTP code before creating an account");
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/local/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email,
      password,
      verification_token: input.verificationToken,
      country: input.country || "",
      country_code: input.countryCode || "",
      consent_kind: input.consentKind || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Could not create account. Try again.",
    );
  }

  // Mirror account locally for offline display (password never stored in cleartext path after migrate)
  try {
    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    const accounts = readAccounts().filter((a) => a.email !== email);
    writeAccounts([
      ...accounts,
      {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        salt,
        passwordHash,
        createdAt: new Date().toISOString(),
      },
    ]);
  } catch {
    /* ignore mirror failures */
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 60 * 60 * 24 * 7,
    user: data.user as AuthUser,
    is_new_user: data.is_new_user !== false,
  };
}

/** Request a signup OTP for the given email. */
export async function sendSignupOtp(email: string): Promise<{
  ok: boolean;
  email: string;
  expires_in: number;
  emailed: boolean;
  delivery?: string;
  message: string;
  dev_code?: string;
}> {
  const res = await fetch(`${BACKEND_URL}/api/auth/signup/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Could not send code");
  }
  return data;
}

/** Verify signup OTP → verification_token for create account. */
export async function verifySignupOtp(
  email: string,
  code: string,
): Promise<{
  ok: boolean;
  email: string;
  verification_token: string;
  message: string;
}> {
  const res = await fetch(`${BACKEND_URL}/api/auth/signup/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      code: code.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Invalid code");
  }
  return data;
}

export async function signInLocal(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email) throw new Error("Enter your email");
  if (!password) throw new Error("Enter your password");

  const res = await fetch(`${BACKEND_URL}/api/auth/local/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 60 * 60 * 24 * 7,
      user: data.user as AuthUser,
      is_new_user: false,
    };
  }

  const detail =
    typeof data?.detail === "string"
      ? data.detail
      : "Could not sign in. Check your email and password.";

  // Legacy mirror: only authenticate if the server already has the account —
  // never create a new user from Sign in.
  if (/no account/i.test(detail) || /sign up to create/i.test(detail)) {
    removeLocalAccountMirror({ email });
    throw new Error("No account found for this email. Sign up to create one.");
  }

  const account = readAccounts().find((a) => a.email === email);
  if (account && res.status >= 500) {
    const passwordHash = await hashPassword(password, account.salt);
    if (passwordHash === account.passwordHash) {
      const migrateRes = await fetch(`${BACKEND_URL}/api/auth/local/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: account.name,
          email: account.email,
          password,
        }),
      });
      const migrateData = await migrateRes.json().catch(() => ({}));
      if (migrateRes.ok) {
        return {
          access_token: migrateData.access_token,
          expires_in: migrateData.expires_in || 60 * 60 * 24 * 7,
          user: migrateData.user as AuthUser,
          is_new_user: false,
        };
      }
    }
  }

  throw new Error(detail);
}

/** @deprecated Prefer signUpLocal / signInLocal */
export function createLocalSession(input: { name: string; email?: string }): AuthSession {
  const name = (input.name || "User").trim() || "User";
  const email = (input.email || "").trim().toLowerCase();
  const id = `local_${Date.now().toString(36)}`;
  const user: AuthUser = {
    id,
    name,
    email: email || `${name.toLowerCase().replace(/\s+/g, ".")}@local`,
    picture: null,
    email_verified: false,
  };
  return {
    access_token: `local.${id}`,
    expires_in: 60 * 60 * 24 * 365,
    user,
  };
}

export async function exchangeGoogleCredential(
  credential: string,
  mode: "signin" | "signup" = "signin",
): Promise<AuthSession> {
  const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, mode }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(", ")
          : mode === "signup"
            ? "Google sign-up failed"
            : "Google sign-in failed";
    throw new Error(message || "Google sign-in failed");
  }

  return data as AuthSession;
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || "Session invalid");
  }
  return data as AuthUser;
}

/** Permanently delete the signed-in account on the server. */
export async function deleteAccountOnServer(token: string): Promise<{ email?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Could not delete account. Please try again.",
    );
  }
  return { email: typeof data?.email === "string" ? data.email : undefined };
}
