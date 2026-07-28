import { createContext, useContext, useState, ReactNode } from "react";
import { Tab, Bookmark, HistoryItem, Download } from "@/types/browser";

interface BrowserContextType {
  tabs: Tab[];
  activeTabId: string | null;
  bookmarks: Bookmark[];
  history: HistoryItem[];
  downloads: Download[];
  createTab: (url?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabUrl: (tabId: string, url: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  navigateToUrl: (url: string) => void;
  addBookmark: (bookmark: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (bookmarkId: string) => void;
  addToHistory: (item: Omit<HistoryItem, "id" | "visitedAt">) => void;
  clearHistory: () => void;
  showPanel: string | null;
  setShowPanel: (panel: string | null) => void;
}

const BrowserContext = createContext<BrowserContextType | undefined>(undefined);

export const useBrowser = () => {
  const context = useContext(BrowserContext);
  if (!context) throw new Error("useBrowser must be used within BrowserProvider");
  return context;
};

export const BrowserProvider = ({ children }: { children: ReactNode }) => {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: "tab-1",
      url: "fashion://assistant",
      title: "Sybeez Flow",
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([
    { id: "1", title: "Google", url: "https://google.com", createdAt: new Date() },
    { id: "2", title: "GitHub", url: "https://github.com", createdAt: new Date() },
    { id: "3", title: "YouTube", url: "https://youtube.com", createdAt: new Date() },
  ]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [showPanel, setShowPanel] = useState<string | null>(null);

  const createTab = (url = "") => {
    const newTab: Tab = {
      id: `tab-${Date.now()}`,
      url,
      title: url || "New Tab",
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter((t) => t.id !== tabId);
    if (newTabs.length === 0) {
      createTab();
      return;
    }
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const setActiveTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const updateTabUrl = (tabId: string, url: string) => {
    setTabs(tabs.map((t) => (t.id === tabId ? { ...t, url, isLoading: true } : t)));
    // Add to history
    addToHistory({ title: url, url });
  };

  const updateTabTitle = (tabId: string, title: string) => {
    setTabs(tabs.map((t) => (t.id === tabId ? { ...t, title, isLoading: false } : t)));
  };

  const addBookmark = (bookmark: Omit<Bookmark, "id" | "createdAt">) => {
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}`,
      createdAt: new Date(),
    };
    setBookmarks([...bookmarks, newBookmark]);
  };

  const removeBookmark = (bookmarkId: string) => {
    setBookmarks(bookmarks.filter((b) => b.id !== bookmarkId));
  };

  const addToHistory = (item: Omit<HistoryItem, "id" | "visitedAt">) => {
    const historyItem: HistoryItem = {
      ...item,
      id: `history-${Date.now()}`,
      visitedAt: new Date(),
    };
    setHistory([historyItem, ...history]);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const navigateToUrl = (url: string) => {
    if (!activeTabId) {
      createTab(url);
      return;
    }
    updateTabUrl(activeTabId, url);
  };

  return (
    <BrowserContext.Provider
      value={{
        tabs,
        activeTabId,
        bookmarks,
        history,
        downloads,
        createTab,
        closeTab,
        setActiveTab,
        updateTabUrl,
        updateTabTitle,
        navigateToUrl,
        addBookmark,
        removeBookmark,
        addToHistory,
        clearHistory,
        showPanel,
        setShowPanel,
      }}
    >
      {children}
    </BrowserContext.Provider>
  );
};
