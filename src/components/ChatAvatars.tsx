/**
 * Shared chat avatars: Sybeez logo for AI, user profile for questions.
 */

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/** Previous Sybeez Flow mark used across chat UIs. */
export const SYBEEZ_LOGO_SRC = "/logo.png?v=7";

export function SybeezChatAvatar({
  className,
  size = 28,
  /** Extra top offset for message rows (not headers). */
  messageAlign = false,
}: {
  className?: string;
  size?: number;
  messageAlign?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center justify-center overflow-hidden rounded-lg bg-background ring-1 ring-border",
        messageAlign && "mt-0.5",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden={false}
    >
      <img
        src={SYBEEZ_LOGO_SRC}
        alt="Sybeez"
        className="block object-contain"
        style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }}
      />
    </span>
  );
}

export function useChatUserProfile() {
  const { user } = useAuth();
  return useMemo(() => {
    const authName = (user?.name || "").trim();
    if (authName || user?.picture) {
      return {
        name: authName || "You",
        initial: (authName || "U").charAt(0).toUpperCase(),
        picture: user?.picture || "",
      };
    }
    try {
      const raw = localStorage.getItem("sybeez_settings");
      if (!raw) return { name: "You", initial: "U", picture: "" };
      const parsed = JSON.parse(raw);
      const name = (parsed?.account?.displayName || "").trim() || "You";
      return {
        name,
        initial: name.charAt(0).toUpperCase() || "U",
        picture: (parsed?.account?.avatar || "") as string,
      };
    } catch {
      return { name: "You", initial: "U", picture: "" };
    }
  }, [user?.name, user?.picture]);
}

export function UserChatAvatar({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  const profile = useChatUserProfile();
  if (profile.picture) {
    return (
      <img
        src={profile.picture}
        alt={profile.name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={cn(
          "mt-0.5 flex-none rounded-full object-cover ring-1 ring-border",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        "mt-0.5 flex flex-none items-center justify-center rounded-full bg-muted ring-1 ring-border text-[11px] font-semibold text-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      title={profile.name}
    >
      {profile.initial}
    </div>
  );
}
