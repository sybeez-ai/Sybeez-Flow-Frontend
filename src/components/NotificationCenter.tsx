import {
  Bell,
  CheckCheck,
  Trash2,
  Wallet,
  CalendarDays,
  BookOpen,
  Mail,
  Timer,
  Info,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import type { AppView } from "@/components/AppSidebar";
import type { NotificationModule } from "@/services/notificationService";
import { cn } from "@/lib/utils";

const MODULE_META: Record<
  NotificationModule,
  { label: string; icon: typeof Bell; color: string }
> = {
  finance: { label: "Finance", icon: Wallet, color: "text-emerald-400" },
  planner: { label: "Planner", icon: CalendarDays, color: "text-sky-400" },
  diary: { label: "Diary", icon: BookOpen, color: "text-amber-400" },
  gmail: { label: "Gmail", icon: Mail, color: "text-red-400" },
  focus: { label: "Focus", icon: Timer, color: "text-violet-400" },
  system: { label: "System", icon: Info, color: "text-white/60" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface NotificationCenterProps {
  onNavigate: (view: AppView) => void;
}

export default function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const { items, unread, markRead, markAllRead, clearAll, remove } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all text-white/50 hover:bg-white/[0.05] hover:text-white/90"
        >
          <Bell className="h-[17px] w-[17px] flex-none" />
          <span>Notifications</span>
          {unread > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-white text-black text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={10}
        className="w-[340px] sm:w-[380px] p-0 border-white/10 bg-[#0c0c0c]/95 backdrop-blur-xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
              disabled={unread === 0}
              title="Mark all read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAll}
              disabled={items.length === 0}
              title="Clear all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[min(420px,55vh)]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Alerts from finance, planner, diary, and mail will show up here.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {items.map((n) => {
                const meta = MODULE_META[n.module] || MODULE_META.system;
                const Icon = meta.icon;
                return (
                  <li key={n.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => {
                        markRead(n.id);
                        if (n.target) onNavigate(n.target as AppView);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04]",
                        !n.read && "bg-white/[0.025]",
                      )}
                    >
                      <div className="flex gap-3">
                        <div
                          className={cn(
                            "mt-0.5 h-8 w-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0",
                            meta.color,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p
                              className={cn(
                                "text-[13px] leading-snug truncate",
                                n.read ? "text-foreground/80" : "text-foreground font-medium",
                              )}
                            >
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {n.body}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">·</span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {timeAgo(n.createdAt)}
                            </span>
                            {n.severity === "urgent" && (
                              <>
                                <span className="text-[10px] text-muted-foreground/50">·</span>
                                <span className="text-[10px] text-red-400">Urgent</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-opacity"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
