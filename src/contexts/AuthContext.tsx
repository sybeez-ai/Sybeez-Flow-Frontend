import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthUser,
  clearSession,
  clearTourPending,
  deleteAccountOnServer,
  exchangeGoogleCredential,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  isLocalToken,
  detectLoginCountry,
  markTourPending,
  persistSession,
  recordLoginCountry,
  removeLocalAccountMirror,
  signInLocal as signInLocalAccount,
  signUpLocal as signUpLocalAccount,
  syncProfileToSettings,
  tourDoneKey,
} from "@/services/authService";
import {
  applyRegionProfile,
  buildRegionProfile,
  getRegionProfile,
  saveLegalConsent,
  type ConsentKind,
} from "@/services/regionService";
import { hydrateFromBackend, notifyUserScopeChanged } from "@/services/persistSync";
import { clearAllUserLocalData } from "@/services/userStorage";
import { deleteUserDocumentsDatabase } from "@/services/documentService";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    verificationToken?: string;
    country?: string;
    countryCode?: string;
    consentKind?: ConsentKind;
    consentAccepted?: boolean;
  }) => Promise<void>;
  signInWithGoogle: (credential: string, mode?: "signin" | "signup") => Promise<void>;
  /** Finish Cognito / OAuth redirect session */
  completeOAuthSession: (session: {
    access_token: string;
    expires_in?: number;
    user: AuthUser;
  }) => Promise<void>;
  signOut: () => void;
  /** Permanently delete account + local data, then sign out */
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const storedToken = getStoredToken();
      const storedUser = getStoredUser();

      if (!storedToken || !storedUser) {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setLoading(false);
        }
        return;
      }

      if (isLocalToken(storedToken)) {
        // Opaque local.* tokens are legacy — require re-login for signed JWT
        if (import.meta.env.PROD || import.meta.env.VITE_APP_ENV === "production") {
          clearSession();
          if (!cancelled) {
            setUser(null);
            setToken(null);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setUser(storedUser);
          setToken(storedToken);
          syncProfileToSettings(storedUser);
          setLoading(false);
          void hydrateFromBackend();
        }
        return;
      }

      try {
        const me = await fetchCurrentUser(storedToken);
        if (cancelled) return;
        setUser(me);
        setToken(storedToken);
        syncProfileToSettings(me);
        localStorage.setItem("sybeez_auth_user", JSON.stringify(me));
        void hydrateFromBackend();
      } catch {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = useCallback(
    async (
      session: { access_token: string; user: AuthUser; is_new_user?: boolean },
      opts?: {
        isRegistration?: boolean;
        country?: string;
        countryCode?: string;
        consentKind?: ConsentKind;
        consentAccepted?: boolean;
      },
    ) => {
      const isFresh = Boolean(opts?.isRegistration || session.is_new_user);
      // After account deletion, Google may reuse the same user id — wipe leftovers first
      if (isFresh && session.user?.id) {
        clearAllUserLocalData(session.user.id);
        deleteUserDocumentsDatabase(session.user.id);
        try {
          localStorage.removeItem(tourDoneKey(session.user.id));
        } catch {
          /* ignore */
        }
        clearTourPending();
      }

      persistSession(session as Parameters<typeof persistSession>[0]);
      syncProfileToSettings(session.user);
      setUser(session.user);
      setToken(session.access_token);
      notifyUserScopeChanged();
      void hydrateFromBackend();

      if (isFresh) {
        markTourPending(session.user.id);
      }

      // On register: set currency / locale / consent from detected country
      if (opts?.isRegistration || isFresh) {
        let country = opts?.country || "";
        let countryCode = opts?.countryCode || "";
        if (!countryCode) {
          try {
            const geo = await detectLoginCountry();
            country = geo.country || country;
            countryCode = geo.country_code || countryCode;
          } catch {
            /* ignore */
          }
        }
        const profile = buildRegionProfile({
          country: country || "Unknown",
          countryCode,
        });
        applyRegionProfile(profile);
        saveLegalConsent({
          kind: opts?.consentKind || profile.consentKind,
          accepted: opts?.consentAccepted !== false,
          acceptedAt: new Date().toISOString(),
          country: profile.country,
          countryCode: profile.countryCode,
        });
      }

      // Always record login country silently (not shown in Settings)
      try {
        const withCountry = await recordLoginCountry(session.user);
        setUser(withCountry);
        syncProfileToSettings(withCountry);
      } catch {
        /* ignore geo failures */
      }
    },
    [],
  );

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const session = await signInLocalAccount(input);
      await applySession(session);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      verificationToken?: string;
      country?: string;
      countryCode?: string;
      consentKind?: ConsentKind;
      consentAccepted?: boolean;
    }) => {
      const session = await signUpLocalAccount(input);
      await applySession(session, {
        isRegistration: true,
        country: input.country,
        countryCode: input.countryCode,
        consentKind: input.consentKind,
        consentAccepted: input.consentAccepted,
      });
    },
    [applySession],
  );

  const signInWithGoogle = useCallback(
    async (credential: string, mode: "signin" | "signup" = "signin") => {
      const session = await exchangeGoogleCredential(credential, mode);
      persistSession(session);
      const needsRegion = !getRegionProfile() || Boolean(session.is_new_user);
      await applySession(session, { isRegistration: needsRegion });
    },
    [applySession],
  );

  const completeOAuthSession = useCallback(
    async (session: {
      access_token: string;
      expires_in?: number;
      user: AuthUser;
      is_new_user?: boolean;
    }) => {
      persistSession(session as Parameters<typeof persistSession>[0]);
      const needsRegion = !getRegionProfile() || Boolean(session.is_new_user);
      await applySession(session, { isRegistration: needsRegion });
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    // Keep per-user data under u:<id>:… keys so the same user gets it back on next login.
    clearSession();
    setUser(null);
    setToken(null);
    notifyUserScopeChanged();
  }, []);

  const deleteAccount = useCallback(async () => {
    const uid = user?.id || getStoredUser()?.id || "";
    const email = user?.email || getStoredUser()?.email || "";
    const tok = token || getStoredToken();
    if (!tok) {
      throw new Error("You must be signed in to delete your account.");
    }
    const result = await deleteAccountOnServer(tok);
    removeLocalAccountMirror({ email: result.email || email, userId: uid });
    if (uid) {
      clearAllUserLocalData(uid);
      deleteUserDocumentsDatabase(uid);
      try {
        localStorage.removeItem(tourDoneKey(uid));
      } catch {
        /* ignore */
      }
    }
    clearTourPending();
    clearSession();
    setUser(null);
    setToken(null);
    notifyUserScopeChanged();
  }, [token, user?.email, user?.id]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      completeOAuthSession,
      signOut,
      deleteAccount,
    }),
    [
      user,
      token,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      completeOAuthSession,
      signOut,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
