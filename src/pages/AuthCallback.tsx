import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { completeCognitoCallback } from "@/services/cognitoAuth";

/**
 * Cognito Hosted UI redirect target.
 * URL: /auth/callback?code=...&state=...
 */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuthSession } = useAuth();
  const [message, setMessage] = useState("Completing Google sign-in…");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const err = params.get("error_description") || params.get("error");
      if (err) {
        toast.error(err);
        navigate("/signin", { replace: true });
        return;
      }

      const code = params.get("code");
      const state = params.get("state") || "";
      if (!code) {
        toast.error("Missing authorization code");
        navigate("/signin", { replace: true });
        return;
      }

      try {
        setMessage("Verifying with Cognito…");
        const session = await completeCognitoCallback({ code, state });
        if (cancelled) return;
        await completeOAuthSession(session);
        toast.success(
          session.is_new_user ? "Welcome to Sybeez Flow" : "Signed in with Google",
        );
        navigate("/", { replace: true });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Google sign-in failed";
        toast.error(msg);
        const lower = msg.toLowerCase();
        if (lower.includes("already exists")) {
          navigate("/signin", { replace: true });
        } else if (lower.includes("no account") || lower.includes("sign up")) {
          navigate("/signup", { replace: true });
        } else {
          navigate("/signin", { replace: true });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params, navigate, completeOAuthSession]);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
