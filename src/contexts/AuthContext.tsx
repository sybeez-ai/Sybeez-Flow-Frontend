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
  exchangeGoogleCredential,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  isLocalToken,
  detectLoginCountry,
  persistSession,
  recordLoginCountry,
  signInLocal as signInLocalAccount,
  signUpLocal as signUpLocalAccount,
  syncProfileToSettings,
} from "@/services/authService";
import {
  applyRegionProfile,
  buildRegionProfile,
  getRegionProfile,
  saveLegalConsent,
  type ConsentKind,
} from "@/services/regionService";

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
  signInWithGoogle: (credential: string) => Promise<void>;
  /** Finish Cognito / OAuth redirect session */
  completeOAuthSession: (session: {
    access_token: string;
    expires_in?: number;
    user: AuthUser;
  }) => Promise<void>;
  signOut: () => void;
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
        if (!cancelled) {
          setUser(storedUser);
          setToken(storedToken);
          syncProfileToSettings(storedUser);
          setLoading(false);
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
      session: { access_token: string; user: AuthUser },
      opts?: {
        isRegistration?: boolean;
        country?: string;
        countryCode?: string;
        consentKind?: ConsentKind;
        consentAccepted?: boolean;
      },
    ) => {
      persistSession(session as Parameters<typeof persistSession>[0]);
      syncProfileToSettings(session.user);
      setUser(session.user);
      setToken(session.access_token);

      // On register: set currency / locale / consent from detected country
      if (opts?.isRegistration) {
        let country = opts.country || "";
        let countryCode = opts.countryCode || "";
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
          kind: opts.consentKind || profile.consentKind,
          accepted: opts.consentAccepted !== false,
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
    async (credential: string) => {
      const session = await exchangeGoogleCredential(credential);
      // First Google session with no region yet → treat like registration
      await applySession(session, { isRegistration: !getRegionProfile() });
    },
    [applySession],
  );

  const completeOAuthSession = useCallback(
    async (session: {
      access_token: string;
      expires_in?: number;
      user: AuthUser;
    }) => {
      await applySession(session, { isRegistration: !getRegionProfile() });
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

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
