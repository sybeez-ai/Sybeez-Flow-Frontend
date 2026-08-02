import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { detectLoginCountry, sendSignupOtp, verifySignupOtp } from "@/services/authService";
import {
  fetchAuthConfig,
  startCognitoGoogleLogin,
  type CognitoAuthConfig,
} from "@/services/cognitoAuth";
import {
  buildRegionProfile,
  consentCopy,
  type RegionProfile,
} from "@/services/regionService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthMode = "signin" | "signup";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l.1.1 6.3 5.3C39.1 37.3 44 33 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}

function BrandMark({ failed, onFail, size = "md" }: { failed: boolean; onFail: () => void; size?: "sm" | "md" | "lg" }) {
  const box =
    size === "lg" ? "h-14 w-14 rounded-2xl text-xl" : size === "sm" ? "h-8 w-8 rounded-xl text-sm" : "h-10 w-10 rounded-xl text-base";

  if (!failed) {
    return (
      <img
        src="/logo.png?v=7"
        alt=""
        className={cn(box, "object-contain bg-transparent")}
        onError={onFail}
      />
    );
  }

  return (
    <div className={cn(box, "bg-white text-black flex items-center justify-center font-bold tracking-tight")}>
      S
    </div>
  );
}

const fieldClass =
  "h-11 rounded-xl bg-white/[0.04] border-white/10 placeholder:text-muted-foreground/45 focus-visible:ring-offset-0";

export default function SignIn({ mode = "signin" }: { mode?: AuthMode }) {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const viteGoogleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [entered, setEntered] = useState(false);
  const [region, setRegion] = useState<RegionProfile | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [authConfig, setAuthConfig] = useState<CognitoAuthConfig | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [shownOtp, setShownOtp] = useState(""); // shown on-form when email delivery fails

  const isSignUp = mode === "signup";
  const from = (location.state as { from?: string } | null)?.from || "/";
  const legal = useMemo(
    () => consentCopy(region?.consentKind || "terms_general"),
    [region?.consentKind],
  );
  // Prefer GIS (works for SPA). Cognito Hosted UI is optional fallback.
  const googleClientId =
    authConfig?.google_client_id || viteGoogleClientId || "";
  const gisGoogleOn = Boolean(googleClientId);
  const cognitoGoogleOn = Boolean(authConfig?.cognito_google_enabled && !gisGoogleOn);
  const isProdBuild =
    import.meta.env.PROD || import.meta.env.VITE_APP_ENV === "production";

  useEffect(() => {
    document.title = `${isSignUp ? "Sign up" : "Sign in"} · Sybeez Flow`;
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, [isSignUp]);

  useEffect(() => {
    // Reset OTP when switching modes
    setOtpSent(false);
    setOtpCode("");
    setEmailVerified(false);
    setVerificationToken("");
    setShownOtp("");
  }, [isSignUp]);

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      setErrors((p) => ({ ...p, email: "Enter a valid email address" }));
      return;
    }
    setOtpSending(true);
    setErrors((p) => ({ ...p, email: "", otp: "" }));
    setShownOtp("");
    try {
      const res = await sendSignupOtp(trimmedEmail);
      setOtpSent(true);
      setEmailVerified(false);
      setVerificationToken("");
      setOtpCode("");
      if (res.dev_code && !isProdBuild) {
        setShownOtp(res.dev_code);
        setOtpCode(res.dev_code);
        toast.success(`Your code is ${res.dev_code}`, { duration: 15000 });
      } else if (res.emailed) {
        toast.success(`Code sent to ${trimmedEmail} — check your inbox`);
      } else if (res.dev_code && isProdBuild) {
        // Never surface OTP on production UI
        toast.success(`Code sent to ${trimmedEmail} — check your inbox`);
      } else {
        toast.success(res.message || "Check your email for the code");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send code";
      toast.error(message);
      setErrors((p) => ({ ...p, email: message }));
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode).trim();
    if (code.length < 6) {
      setErrors((p) => ({ ...p, otp: "Enter the 6-digit code" }));
      return;
    }
    setOtpVerifying(true);
    setErrors((p) => ({ ...p, otp: "" }));
    try {
      const res = await verifySignupOtp(email.trim(), code);
      setEmailVerified(true);
      setVerificationToken(res.verification_token);
      toast.success("Email verified — you can create your account");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid code";
      setEmailVerified(false);
      setVerificationToken("");
      setErrors((p) => ({ ...p, otp: message }));
      toast.error(message);
    } finally {
      setOtpVerifying(false);
    }
  };

  useEffect(() => {
    setErrors({});
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setConsentAccepted(false);
    if (!loading && !user) {
      firstFieldRef.current?.focus();
    }
  }, [mode, loading, user]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig().then((cfg) => {
      if (!cancelled) setAuthConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // On signup: detect country → currency + GDPR / Terms UI
  useEffect(() => {
    if (!isSignUp) return;
    let cancelled = false;
    setRegionLoading(true);
    void detectLoginCountry()
      .then((geo) => {
        if (cancelled) return;
        setRegion(
          buildRegionProfile({
            country: geo.country,
            countryCode: geo.country_code,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRegion(
            buildRegionProfile({ country: "Unknown", countryCode: "" }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRegionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignUp]);

  const passwordHint = useMemo(() => {
    if (!isSignUp || !password) return "";
    if (password.length < 8) return "Use at least 8 characters";
    return "";
  }, [isSignUp, password]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const validate = () => {
    const next: Record<string, string> = {};
    const trimmedEmail = email.trim().toLowerCase();

    if (isSignUp) {
      const trimmedName = name.trim();
      if (!trimmedName) next.name = "Enter your full name";
      else if (trimmedName.length < 2) next.name = "Name must be at least 2 characters";
    }

    if (!trimmedEmail) next.email = "Enter your email";
    else if (!EMAIL_RE.test(trimmedEmail)) next.email = "Enter a valid email address";

    if (!password) next.password = "Enter your password";
    else if (isSignUp && password.length < 8) next.password = "Password must be at least 8 characters";

    if (isSignUp) {
      if (!confirm) next.confirm = "Confirm your password";
      else if (confirm !== password) next.confirm = "Passwords do not match";
      if (!emailVerified || !verificationToken) {
        next.otp = "Verify your email with the OTP code first";
      }
      if (!consentAccepted) {
        next.consent =
          region?.consentKind === "gdpr"
            ? "Please accept GDPR consent to continue"
            : "Please accept the terms to continue";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp({
          name: name.trim(),
          email: email.trim(),
          password,
          verificationToken,
          country: region?.country,
          countryCode: region?.countryCode,
          consentKind: region?.consentKind,
          consentAccepted: true,
        });
        toast.success(`Welcome to Sybeez Flow, ${email.trim().toLowerCase()}`);
      } else {
        await signIn({ email: email.trim(), password });
        toast.success(`Welcome to Sybeez Flow, ${email.trim().toLowerCase()}`);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
      if (message.toLowerCase().includes("already exists")) {
        setErrors((prev) => ({ ...prev, email: message }));
      } else if (
        message.toLowerCase().includes("no account") ||
        message.toLowerCase().includes("sign up to create")
      ) {
        setErrors((prev) => ({ ...prev, email: message }));
      } else if (
        message.toLowerCase().includes("incorrect") ||
        message.toLowerCase().includes("password")
      ) {
        setErrors((prev) => ({ ...prev, password: message }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 70% 45% at 20% 0%, rgba(255,255,255,0.06) 0%, transparent 60%)",
            "radial-gradient(ellipse 50% 40% at 90% 100%, rgba(255,255,255,0.03) 0%, transparent 55%)",
          ].join(","),
        }}
      />

      <div className="relative z-10 min-h-[100dvh] grid lg:grid-cols-2">
        {/* Left brand panel — desktop */}
        <aside
          className={cn(
            "hidden lg:flex flex-col justify-between px-12 xl:px-16 py-10 border-r border-white/[0.06] transition-all duration-700",
            entered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3",
          )}
        >
          <div className="flex items-center gap-2.5">
            <BrandMark failed={logoFailed} onFail={() => setLogoFailed(true)} size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">Sybeez Flow</span>
          </div>

          <div className="max-w-md space-y-5">
            <BrandMark failed={logoFailed} onFail={() => setLogoFailed(true)} size="lg" />
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight leading-[1.1] text-foreground">
                Your personal
                <br />
                assistant, in one place.
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Finance, planning, diary, documents, and mail — organized so you can move through your day with clarity.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Private on this device until cloud sync is enabled</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground/50">
            © {new Date().getFullYear()} Sybeez Flow
          </p>
        </aside>

        {/* Right form panel */}
        <section className="flex flex-col min-h-[100dvh] lg:min-h-0">
          {/* Mobile top bar */}
          <header
            className={cn(
              "lg:hidden flex items-center justify-between px-5 h-14 border-b border-white/[0.06] transition-opacity duration-500",
              entered ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex items-center gap-2">
              <BrandMark failed={logoFailed} onFail={() => setLogoFailed(true)} size="sm" />
              <span className="text-sm font-semibold tracking-tight">Sybeez Flow</span>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center px-5 py-6 sm:px-8">
            <div
              className={cn(
                "w-full max-w-[400px] transition-all duration-700 delay-75",
                entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
              )}
            >
              <div className="mb-6 space-y-1.5 lg:mb-7">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {isSignUp ? "Create account" : "Welcome back"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isSignUp
                    ? "New here? Verify your email and set up your workspace."
                    : "Already have an account? Sign in to continue."}
                </p>
              </div>

              {/* Mode switch */}
              <div
                className="grid grid-cols-2 p-1 mb-6 rounded-xl bg-white/[0.04] border border-white/10"
                role="tablist"
                aria-label="Authentication mode"
              >
                <Link
                  to="/signin"
                  role="tab"
                  aria-selected={!isSignUp}
                  className={cn(
                    "h-9 rounded-lg text-sm font-medium flex items-center justify-center transition-colors",
                    !isSignUp
                      ? "bg-white text-black"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  role="tab"
                  aria-selected={isSignUp}
                  className={cn(
                    "h-9 rounded-lg text-sm font-medium flex items-center justify-center transition-colors",
                    isSignUp
                      ? "bg-white text-black"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Sign up
                </Link>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
                {isSignUp && (
                  <div className="space-y-1.5">
                    <label htmlFor={nameId} className="text-[13px] font-medium text-foreground/90">
                      Full name
                    </label>
                    <Input
                      ref={firstFieldRef}
                      id={nameId}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                      }}
                      placeholder="Alex Morgan"
                      className={cn(fieldClass, errors.name && "border-red-500/50")}
                      autoComplete="name"
                      disabled={submitting}
                      aria-invalid={Boolean(errors.name)}
                    />
                    {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor={emailId} className="text-[13px] font-medium text-foreground/90">
                    Email
                  </label>
                  <div className={cn(isSignUp && "flex gap-2")}>
                    <Input
                      ref={isSignUp ? undefined : firstFieldRef}
                      id={emailId}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                        if (isSignUp && (otpSent || emailVerified)) {
                          setOtpSent(false);
                          setOtpCode("");
                          setEmailVerified(false);
                          setVerificationToken("");
                          setShownOtp("");
                        }
                      }}
                      placeholder="you@example.com"
                      className={cn(fieldClass, "flex-1", errors.email && "border-red-500/50")}
                      autoComplete="email"
                      inputMode="email"
                      disabled={submitting || otpSending || otpVerifying}
                      aria-invalid={Boolean(errors.email)}
                    />
                    {isSignUp && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 rounded-xl border-white/10 bg-white/[0.04] px-3 text-xs"
                        onClick={() => void handleSendOtp()}
                        disabled={submitting || otpSending || otpVerifying || emailVerified}
                      >
                        {otpSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : otpSent ? (
                          "Resend"
                        ) : (
                          "Send code"
                        )}
                      </Button>
                    )}
                  </div>
                  {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
                </div>

                {isSignUp && otpSent && !emailVerified && (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[13px] font-medium text-foreground/90">
                      Enter the 6-digit code sent to your email
                    </p>
                    {shownOtp && !isProdBuild && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
                        <p className="text-[11px] text-amber-200/80 mb-1">Your verification code</p>
                        <p className="text-2xl font-semibold tracking-[0.35em] text-amber-100 tabular-nums">
                          {shownOtp}
                        </p>
                        <p className="text-[10px] text-amber-200/60 mt-1">
                          Email delivery wasn’t available — use this code
                        </p>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={(v) => {
                          setOtpCode(v);
                          if (errors.otp) setErrors((p) => ({ ...p, otp: "" }));
                          if (v.length === 6) void handleVerifyOtp(v);
                        }}
                        disabled={otpVerifying || submitting}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} className="bg-white/[0.04] border-white/10" />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                      <Button
                        type="button"
                        className="h-10 rounded-xl bg-white text-black hover:bg-white/90 text-xs"
                        onClick={() => void handleVerifyOtp()}
                        disabled={otpVerifying || otpCode.length < 6 || submitting}
                      >
                        {otpVerifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </div>
                    {errors.otp && <p className="text-xs text-red-400">{errors.otp}</p>}
                  </div>
                )}

                {isSignUp && emailVerified && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    Email verified — you can create your account
                  </div>
                )}

                {isSignUp && errors.otp && !otpSent && (
                  <p className="text-xs text-red-400">{errors.otp}</p>
                )}

                <div className="space-y-1.5">
                  <label htmlFor={passwordId} className="text-[13px] font-medium text-foreground/90">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id={passwordId}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                      }}
                      placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                      className={cn(fieldClass, "pr-11", errors.password && "border-red-500/50")}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      disabled={submitting}
                      aria-invalid={Boolean(errors.password)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {(errors.password || passwordHint) && (
                    <p className={cn("text-xs", errors.password ? "text-red-400" : "text-muted-foreground")}>
                      {errors.password || passwordHint}
                    </p>
                  )}
                </div>

                {isSignUp && (
                  <div className="space-y-1.5">
                    <label htmlFor={confirmId} className="text-[13px] font-medium text-foreground/90">
                      Confirm password
                    </label>
                    <Input
                      id={confirmId}
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                        if (errors.confirm) setErrors((p) => ({ ...p, confirm: "" }));
                      }}
                      placeholder="Repeat password"
                      className={cn(fieldClass, errors.confirm && "border-red-500/50")}
                      autoComplete="new-password"
                      disabled={submitting}
                      aria-invalid={Boolean(errors.confirm)}
                    />
                    {errors.confirm && <p className="text-xs text-red-400">{errors.confirm}</p>}
                  </div>
                )}

                {isSignUp && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground/90">{legal.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                          {regionLoading
                            ? "Detecting your country…"
                            : region?.country && region.country !== "Unknown"
                              ? `${legal.body} Detected: ${region.country} · currency ${region.currency}.`
                              : legal.body}
                        </p>
                      </div>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-white"
                        checked={consentAccepted}
                        onChange={(e) => {
                          setConsentAccepted(e.target.checked);
                          if (errors.consent) setErrors((p) => ({ ...p, consent: "" }));
                        }}
                        disabled={submitting || regionLoading}
                      />
                      <span className="text-[12px] text-foreground/80 leading-snug">
                        {legal.checkbox}
                      </span>
                    </label>
                    {errors.consent && (
                      <p className="text-xs text-red-400">{errors.consent}</p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={
                    submitting ||
                    (isSignUp && regionLoading) ||
                    (isSignUp && !emailVerified)
                  }
                  className="w-full h-11 rounded-xl text-sm font-medium gap-2 mt-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isSignUp ? "Creating account…" : "Signing in…"}
                    </>
                  ) : (
                    <>
                      {isSignUp ? "Create account" : "Sign in"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground/70 bg-background">
                    or
                  </span>
                </div>
              </div>

              {cognitoGoogleOn ? (
                <button
                  type="button"
                  disabled={submitting || googleBusy || (isSignUp && !consentAccepted)}
                  onClick={async () => {
                    if (isSignUp && !consentAccepted) {
                      setErrors((p) => ({
                        ...p,
                        consent:
                          region?.consentKind === "gdpr"
                            ? "Please accept GDPR consent to continue"
                            : "Please accept the terms to continue",
                      }));
                      return;
                    }
                    setGoogleBusy(true);
                    try {
                      await startCognitoGoogleLogin(isSignUp ? "signup" : "signin");
                    } catch (err) {
                      const message =
                        err instanceof Error ? err.message : "Google sign-in failed";
                      toast.error(message);
                      setGoogleBusy(false);
                    }
                  }}
                  className="relative w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-foreground flex items-center justify-center gap-2.5 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                  title={isSignUp ? "Sign up with Google" : "Sign in with Google"}
                >
                  {googleBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleMark />
                  )}
                  <span>{isSignUp ? "Sign up with Google" : "Sign in with Google"}</span>
                </button>
              ) : gisGoogleOn && googleClientId ? (
                <div className="w-full flex justify-center [&_iframe]:!w-full">
                  <GoogleOAuthProvider clientId={googleClientId}>
                    <GoogleLogin
                      onSuccess={async (res) => {
                        if (!res.credential) {
                          toast.error("Google did not return a credential");
                          return;
                        }
                        if (isSignUp && !consentAccepted) {
                          setErrors((p) => ({
                            ...p,
                            consent:
                              region?.consentKind === "gdpr"
                                ? "Please accept GDPR consent to continue"
                                : "Please accept the terms to continue",
                          }));
                          return;
                        }
                        setGoogleBusy(true);
                        try {
                          await signInWithGoogle(
                            res.credential,
                            isSignUp ? "signup" : "signin",
                          );
                          toast.success(
                            isSignUp
                              ? "Welcome to Sybeez Flow"
                              : "Signed in with Google",
                          );
                          navigate(from, { replace: true });
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Google sign-in failed",
                          );
                        } finally {
                          setGoogleBusy(false);
                        }
                      }}
                      onError={() => toast.error("Google sign-in failed")}
                      theme="filled_black"
                      shape="rectangular"
                      width="360"
                      text={isSignUp ? "signup_with" : "signin_with"}
                      useOneTap={false}
                    />
                  </GoogleOAuthProvider>
                </div>
              ) : (
                <button
                  type="button"
                  disabled
                  className="relative w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-white/55 flex items-center justify-center gap-2.5 cursor-not-allowed"
                  title="Configure Cognito or VITE_GOOGLE_CLIENT_ID"
                >
                  <GoogleMark />
                  <span>Continue with Google</span>
                  <span className="absolute right-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 border border-white/10 rounded-md px-1.5 py-0.5">
                    Setup
                  </span>
                </button>
              )}

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {isSignUp ? (
                  <>
                    Already have an account?{" "}
                    <Link to="/signin" className="text-foreground font-medium hover:underline underline-offset-4">
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    New here?{" "}
                    <Link to="/signup" className="text-foreground font-medium hover:underline underline-offset-4">
                      Create an account
                    </Link>
                  </>
                )}
              </p>

              <p className="mt-4 text-center text-[11px] text-muted-foreground/55 leading-relaxed lg:hidden">
                © {new Date().getFullYear()} Sybeez Flow
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
