import { usGetItem, usSetItem } from "@/services/userStorage";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import FeedbackSection from "@/components/FeedbackSection";
import { CURRENCIES } from "@/services/currencyService";
import { setAppCurrency, appCurrencyCode } from "@/services/regionService";
import { toast } from "sonner";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
  inline?: boolean;
}

type ProfileSettings = {
  account: {
    displayName: string;
    email: string;
    avatar: string;
    twoFactorEnabled: boolean;
  };
  preferences: {
    currency: string;
  };
};

const defaultProfile: ProfileSettings = {
  account: {
    displayName: "",
    email: "",
    avatar: "",
    twoFactorEnabled: false,
  },
  preferences: {
    currency: "EUR",
  },
};

function loadProfile(): ProfileSettings {
  try {
    const raw = usGetItem("sybeez_settings");
    if (!raw) {
      return {
        ...defaultProfile,
        preferences: { currency: appCurrencyCode() || "EUR" },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      account: {
        ...defaultProfile.account,
        ...(parsed?.account || {}),
      },
      preferences: {
        currency:
          parsed?.preferences?.currency || appCurrencyCode() || "EUR",
      },
    };
  } catch {
    return {
      ...defaultProfile,
      preferences: { currency: appCurrencyCode() || "EUR" },
    };
  }
}

function persistProfile(profile: ProfileSettings) {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(usGetItem("sybeez_settings") || "{}") || {};
  } catch {
    existing = {};
  }
  const next = {
    ...existing,
    account: {
      ...((existing.account as object) || {}),
      ...profile.account,
    },
    preferences: {
      ...((existing.preferences as object) || {}),
      currency: profile.preferences.currency,
    },
  };
  usSetItem("sybeez_settings", JSON.stringify(next));
}

const SettingsPanel = ({
  isOpen,
  onClose,
  inline = false,
}: SettingsPanelProps) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<ProfileSettings>(defaultProfile);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setSettings(loadProfile());
  }, []);

  useEffect(() => {
    if (!user) return;
    setSettings((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        displayName: user.name || prev.account.displayName,
        email: user.email || prev.account.email,
        avatar: user.picture || prev.account.avatar,
      },
    }));
  }, [user]);

  const saveSettings = () => {
    persistProfile(settings);
    setHasChanges(false);
    toast.success("Profile saved");
  };

  const updateAccount = (key: keyof ProfileSettings["account"], value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      account: { ...prev.account, [key]: value },
    }));
    setHasChanges(true);
  };

  if (!isOpen) return null;

  const content = (
    <div className="space-y-8 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Manage your account, currency, and profile information
      </p>

      <div className="p-6 bg-foreground/5 rounded-xl space-y-6">
        <div className="flex items-center gap-6">
          {settings.account.avatar || user?.picture ? (
            <img
              src={settings.account.avatar || user?.picture || ""}
              alt={settings.account.displayName || "Profile"}
              className="w-24 h-24 rounded-full object-cover ring-1 ring-white/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center text-2xl font-semibold">
              {(settings.account.displayName || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold">
              {settings.account.displayName || "Your name"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {settings.account.email || "Add your email"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Display Name</span>
            <Input
              value={settings.account.displayName}
              onChange={(e) => updateAccount("displayName", e.target.value)}
              className="mt-2 bg-foreground/5 border-border"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Email Address</span>
            <Input
              value={settings.account.email}
              onChange={(e) => updateAccount("email", e.target.value)}
              className="mt-2 bg-foreground/5 border-border"
            />
          </label>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Currency
        </h3>
        <div className="p-4 bg-foreground/5 rounded-xl">
          <label className="block">
            <span className="text-sm font-medium">Display currency</span>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Applies across the entire Finance Manager (dashboard, bills, net worth, charts, and reports).
            </p>
            <select
              value={settings.preferences.currency || appCurrencyCode()}
              onChange={(e) => {
                const code = setAppCurrency(e.target.value);
                setSettings((prev) => ({
                  ...prev,
                  preferences: { ...prev.preferences, currency: code },
                }));
                persistProfile({
                  ...settings,
                  preferences: { currency: code },
                });
                setHasChanges(false);
                toast.success(`Currency set to ${code} for all Finance`);
              }}
              className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <Separator />

      <FeedbackSection />

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Security
        </h3>

        <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
          <div>
            <div className="font-medium">Two-Factor Authentication</div>
            <div className="text-sm text-muted-foreground">
              Add extra security to your account
            </div>
          </div>
          <Button
            variant={settings.account.twoFactorEnabled ? "outline" : "default"}
            size="sm"
            onClick={() =>
              updateAccount("twoFactorEnabled", !settings.account.twoFactorEnabled)
            }
          >
            {settings.account.twoFactorEnabled ? "Disable" : "Enable"}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
          <div>
            <div className="font-medium">Change Password</div>
            <div className="text-sm text-muted-foreground">
              Update your password regularly
            </div>
          </div>
          <Button variant="outline" size="sm">
            Update
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Session
        </h3>
        <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-xl">
          <div>
            <div className="font-medium">Sign out</div>
            <div className="text-sm text-muted-foreground">
              End your session on this device
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              signOut();
              toast.success("Signed out");
              navigate("/signin", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-red-500">
          Danger Zone
        </h3>
        <div className="flex items-center justify-between p-4 border border-red-500/20 rounded-xl bg-red-500/5">
          <div>
            <div className="font-medium text-red-500">Delete Account</div>
            <div className="text-sm text-muted-foreground">
              Permanently delete your account and all data
            </div>
          </div>
          <Button variant="destructive" size="sm">
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="h-full w-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-8 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <Button onClick={saveSettings} size="sm" className="gap-2">
                <Check className="h-4 w-4" />
                Save Changes
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-8">{content}</div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full w-full flex flex-col">
        <div className="flex items-center justify-between px-8 py-4 border-b border-border bg-card/50">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <Button onClick={saveSettings} size="sm" className="gap-2">
                <Check className="h-4 w-4" />
                Save Changes
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-foreground/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-8">{content}</div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default SettingsPanel;
