import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  AppNotification,
  NOTIFICATIONS_CHANGED,
  clearAllNotifications,
  clearReadNotifications,
  clearToastedNotificationKeys,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
  scanAndEmitNotifications,
  unreadCount as getUnreadCount,
  upsertNotification,
  type UpsertInput,
} from "@/services/notificationService";
import { USER_SCOPE_CHANGED_EVENT } from "@/services/persistSync";

interface NotificationContextValue {
  items: AppNotification[];
  unread: number;
  refresh: () => void;
  scan: () => void;
  notify: (input: UpsertInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearRead: () => void;
  clearAll: () => void;
  remove: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>(() => listNotifications());
  const [unread, setUnread] = useState(() => getUnreadCount());

  const refresh = useCallback(() => {
    setItems(listNotifications());
    setUnread(getUnreadCount());
  }, []);

  const scan = useCallback(() => {
    scanAndEmitNotifications({
      toastFn: (title, opts) => toast(title, { description: opts?.description, position: "top-center" }),
    });
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  // Never show another account's in-memory notifications after login/logout
  useEffect(() => {
    const onScope = () => {
      clearToastedNotificationKeys();
      setItems([]);
      setUnread(0);
      refresh();
      scan();
    };
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScope);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScope);
  }, [refresh, scan]);

  // Initial + periodic scan
  useEffect(() => {
    scan();
    const id = window.setInterval(scan, 60_000);
    const onFocus = () => scan();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [scan]);

  const notify = useCallback(
    (input: UpsertInput) => {
      upsertNotification({
        ...input,
        toastOnce: input.toastOnce ?? true,
        toastFn:
          input.toastFn ||
          ((title, opts) => toast(title, { description: opts?.description, position: "top-center" })),
      });
      refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      items,
      unread,
      refresh,
      scan,
      notify,
      markRead: (id: string) => {
        markNotificationRead(id);
        refresh();
      },
      markAllRead: () => {
        markAllNotificationsRead();
        refresh();
      },
      clearRead: () => {
        clearReadNotifications();
        refresh();
      },
      clearAll: () => {
        clearAllNotifications();
        refresh();
      },
      remove: (id: string) => {
        removeNotification(id);
        refresh();
      },
    }),
    [items, unread, refresh, scan, notify],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
