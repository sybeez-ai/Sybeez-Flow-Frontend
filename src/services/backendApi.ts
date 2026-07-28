/**
 * Production API Client for Backend Integration
 * ============================================
 * Handles all frontend-backend communication for:
 * - Finance data persistence
 * - Daily planner data persistence
 * - Life diary entries
 * - Gmail data tracking
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Make API request with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: { ...defaultHeaders, ...options.headers },
      body:
        options.body && (options.method === "POST" || options.method === "PUT")
          ? JSON.stringify(options.body)
          : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `API Error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FINANCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

export const financeApi = {
  /**
   * Get all finance data
   */
  async getData() {
    return apiRequest("/api/features/finance/data");
  },

  /**
   * Update all finance data
   */
  async updateData(data: any) {
    return apiRequest("/api/features/finance/data", {
      method: "POST",
      body: data,
    });
  },

  /**
   * Add a transaction
   */
  async addTransaction(transaction: any) {
    return apiRequest("/api/features/finance/transaction", {
      method: "POST",
      body: transaction,
    });
  },

  /**
   * Get all transactions
   */
  async getTransactions() {
    return apiRequest("/api/features/finance/transactions");
  },
};

// ═══════════════════════════════════════════════════════════════════
// DAILY PLANNER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

export const plannerApi = {
  /**
   * Get all planner data
   */
  async getData() {
    return apiRequest("/api/features/planner/data");
  },

  /**
   * Update all planner data
   */
  async updateData(data: any) {
    return apiRequest("/api/features/planner/data", {
      method: "POST",
      body: data,
    });
  },

  /**
   * Add a new habit
   */
  async addHabit(habit: any) {
    return apiRequest("/api/features/planner/habit", {
      method: "POST",
      body: habit,
    });
  },

  /**
   * Get all habits
   */
  async getHabits() {
    return apiRequest("/api/features/planner/habits");
  },
};

// ═══════════════════════════════════════════════════════════════════
// LIFE DIARY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

export const diaryApi = {
  /** Full diary blob (entries + memories/thoughts/gratitude when synced). */
  async getData() {
    return apiRequest("/api/features/diary/data");
  },

  async saveData(data: any) {
    return apiRequest("/api/features/diary/data", {
      method: "POST",
      body: data,
    });
  },

  async getEntries() {
    return apiRequest("/api/features/diary/entries");
  },

  async createEntry(entry: any) {
    return apiRequest("/api/features/diary/entry", {
      method: "POST",
      body: entry,
    });
  },

  async getEntry(entryId: string) {
    return apiRequest(`/api/features/diary/entry/${entryId}`);
  },

  async updateEntry(entryId: string, entry: any) {
    return apiRequest(`/api/features/diary/entry/${entryId}`, {
      method: "PUT",
      body: entry,
    });
  },
};

// ═══════════════════════════════════════════════════════════════════
// GMAIL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

export const gmailApi = {
  /**
   * Get all Gmail data
   */
  async getData() {
    return apiRequest("/api/features/gmail/data");
  },

  /**
   * Update all Gmail data
   */
  async updateData(data: any) {
    return apiRequest("/api/features/gmail/data", {
      method: "POST",
      body: data,
    });
  },

  /**
   * Add an email (for tracking)
   */
  async addEmail(email: any) {
    return apiRequest("/api/features/gmail/email", {
      method: "POST",
      body: email,
    });
  },

  /**
   * Get all emails
   */
  async getEmails() {
    return apiRequest("/api/features/gmail/emails");
  },
};

// ═══════════════════════════════════════════════════════════════════
// BULK SYNC ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

export const syncApi = {
  /**
   * Bulk sync all feature data
   */
  async syncAll(payload: any) {
    return apiRequest("/api/sync/all", {
      method: "POST",
      body: payload,
    });
  },

  /**
   * Get all feature data
   */
  async getAll() {
    return apiRequest("/api/sync/all");
  },
};

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    console.warn("Backend health check failed");
    return false;
  }
}

/**
 * Initialize all feature data from backend
 */
export async function initializeFromBackend() {
  try {
    const data = await syncApi.getAll();
    console.log("Backend data loaded successfully");
    return data;
  } catch (error) {
    console.error("Failed to load backend data", error);
    return null;
  }
}

/**
 * Sync local data to backend
 */
export async function syncToBackend(payload: {
  finance?: any;
  planner?: any;
  diary?: any;
  gmail?: any;
}) {
  try {
    await syncApi.syncAll(payload);
    console.log("Data synced to backend successfully");
    return true;
  } catch (error) {
    console.error("Failed to sync data to backend", error);
    return false;
  }
}

/**
 * Handle API error with user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export default {
  financeApi,
  plannerApi,
  diaryApi,
  gmailApi,
  syncApi,
  checkBackendHealth,
  initializeFromBackend,
  syncToBackend,
  getErrorMessage,
};
