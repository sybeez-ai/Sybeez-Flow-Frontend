import { useMemo } from "react";
import {
  CalendarDays,
  Wallet,
  Home as HomeIcon,
  BookOpen,
  Mail,
  Files,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import NotificationCenter from "@/components/NotificationCenter";

export type AppView =
  | "home"
  | "finance"
  | "planner"
  | "diary"
  | "gmail"
  | "documents"
  | "settings";

interface AppSidebarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onNewChat: () => void;
  isHistoryOpen?: boolean;
  onToggleHistory?: () => void;
}

const NAV_ITEMS: { id: AppView; label: string; icon: typeof HomeIcon }[] = [
  { id: "finance", label: "Finance Manager", icon: Wallet },
  { id: "planner", label: "Life Planner", icon: CalendarDays },
  { id: "diary", label: "Life Diary", icon: BookOpen },
  { id: "gmail", label: "Gmail Manager", icon: Mail },
  { id: "documents", label: "Documents", icon: Files },
];

const AppSidebar = ({ activeView, onNavigate, onNewChat }: AppSidebarProps) => {
  const { user } = useAuth();

  const profile = useMemo(() => {
    const authName = (user?.name || "").trim();
    if (authName) {
      return {
        name: authName,
        initial: authName.charAt(0).toUpperCase() || "U",
        picture: user?.picture || "",
      };
    }
    try {
      const raw = localStorage.getItem("sybeez_settings");
      if (!raw) return { name: "User", initial: "U", picture: "" };
      const parsed = JSON.parse(raw);
      const name = (parsed?.account?.displayName || "").trim() || "User";
      return {
        name,
        initial: name.charAt(0).toUpperCase() || "U",
        picture: (parsed?.account?.avatar || "") as string,
      };
    } catch {
      return { name: "User", initial: "U", picture: "" };
    }
  }, [activeView, user]);

  return (
    <aside
      className="w-[216px] h-full flex-none flex flex-col glass border-r-0"
      style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}
    >
      <button
        onClick={onNewChat}
        className="flex items-center gap-2.5 px-4 h-16 transition-colors hover:bg-white/[0.04]"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <img
          src="/logo.png?v=6"
          alt="Sybeez Flow"
          className="h-8 w-8 object-contain bg-transparent"
        />
        <span className="text-[15px] font-semibold tracking-tight">Sybeez Flow</span>
      </button>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-2">
        <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Workspace
        </p>
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
                  isActive
                    ? "glass-subtle font-medium text-white"
                    : "text-white/50 hover:bg-white/[0.05] hover:text-white/90"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-0.5 rounded-full bg-foreground" />
                )}
                <Icon className="h-[17px] w-[17px] flex-none" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="px-3 pb-3 pt-2 space-y-0.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <NotificationCenter onNavigate={onNavigate} />

        <button
          onClick={() => onNavigate("settings")}
          className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-all hover:bg-white/[0.05]"
        >
          <div className="relative">
            {profile.picture ? (
              <img
                src={profile.picture}
                alt={profile.name}
                className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 text-sm font-semibold text-white">
                {profile.initial}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-black bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-medium text-foreground">{profile.name}</p>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
