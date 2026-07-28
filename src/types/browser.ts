export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  folder?: string;
  createdAt: Date;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  visitedAt: Date;
}

export interface Download {
  id: string;
  filename: string;
  url: string;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
  size: string;
  startedAt: Date;
}
