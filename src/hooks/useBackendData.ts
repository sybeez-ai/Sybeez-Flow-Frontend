/**
 * Backend Connection Hook
 * =======================
 * 
 * Handles connection to backend API with fallback to localStorage
 */

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getApiBase } from '@/services/apiBase';

const API_BASE_URL = getApiBase();

interface UseBackendDataOptions<T> {
  endpoint: string;
  fallbackData: T;
  onError?: (error: Error) => void;
}

interface UseBackendDataReturn<T> {
  data: T;
  setData: (data: T) => void;
  isLoading: boolean;
  error: Error | null;
  isConnected: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing data with backend sync
 */
export function useBackendData<T>({
  endpoint,
  fallbackData,
  onError
}: UseBackendDataOptions<T>): UseBackendDataReturn<T> {
  const [data, setData] = useState<T>(fallbackData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch data from backend
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const result = await response.json();
      setData(result);
      setError(null);
      setIsConnected(true);
      console.log(`✅ Connected: ${endpoint}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsConnected(false);
      console.warn(`⚠️  Backend unavailable for ${endpoint}:`, error.message);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, onError]);

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync data to backend
  const handleDataChange = useCallback(async (newData: T) => {
    setData(newData);
    
    // Save to localStorage immediately
    try {
      const key = `stabee_${endpoint.replace(/\//g, '_')}`;
      localStorage.setItem(key, JSON.stringify(newData));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }

    // Try to sync to backend
    if (isConnected) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData),
        });

        if (!response.ok) {
          console.warn(`Failed to sync to backend: ${response.status}`);
          setIsConnected(false);
        }
      } catch (err) {
        console.warn('Failed to sync to backend:', err);
        setIsConnected(false);
      }
    }
  }, [endpoint, isConnected]);

  return {
    data,
    setData: handleDataChange,
    isLoading,
    error,
    isConnected,
    refetch: fetchData,
  };
}

/**
 * Check backend health
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sync data to backend endpoint
 */
export async function syncToBackend<T>(endpoint: string, data: T): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.warn(`Failed to sync to ${endpoint}:`, error);
    return false;
  }
}
