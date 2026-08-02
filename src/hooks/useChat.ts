/**
 * Socket.IO Chat Client Hook
 * For React frontend integration
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiBase } from '@/services/apiBase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  type?: 'text' | 'image' | 'command';
  data?: any;
}

interface ChatEvent {
  runId: string;
  sessionKey: string;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: Message;
  errorMessage?: string;
}

interface UseChatOptions {
  url?: string;
  sessionKey?: string;
  onMessage?: (message: Message) => void;
  onError?: (error: string) => void;
}

export const useChat = (options: UseChatOptions = {}) => {
  const {
    url = getApiBase(),
    sessionKey = 'main',
    onMessage,
    onError
  } = options;

  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);

  /**
   * Initialize socket connection
   */
  useEffect(() => {
    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Chat connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Chat disconnected');
      setConnected(false);
    });

    // Hello event
    socket.on('hello', (data) => {
      console.log('Chat hello:', data);
    });

    // Chat events
    socket.on('chat.event', (event: ChatEvent) => {
      if (event.state === 'final' && event.message) {
        const msg = event.message;
        setMessages(prev => [...prev, msg]);
        onMessage?.(msg);
      } else if (event.state === 'error') {
        onError?.(event.errorMessage || 'Unknown error');
      }
      
      setIsTyping(false);
    });

    // Typing indicator
    socket.on('chat.typing', ({ typing }) => {
      setIsTyping(typing);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [url, onMessage, onError]);

  /**
   * Load conversation history
   */
  const loadHistory = useCallback(async (limit = 50) => {
    return new Promise<Message[]>((resolve, reject) => {
      socketRef.current?.emit('chat.loadHistory', 
        { sessionKey, limit },
        (response: { ok: boolean; messages: Message[] }) => {
          if (response.ok) {
            setMessages(response.messages);
            resolve(response.messages);
          } else {
            reject(new Error('Failed to load history'));
          }
        }
      );
    });
  }, [sessionKey]);

  /**
   * Send message
   */
  const sendMessage = useCallback(async (
    content: string,
    thinking: 'low' | 'medium' | 'high' = 'low',
    attachments: any[] = []
  ) => {
    if (!socketRef.current || !connected) {
      throw new Error('Not connected');
    }

    // Add user message immediately
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: Date.now(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to server
    return new Promise<{ runId: string }>((resolve, reject) => {
      socketRef.current?.emit('chat.send',
        {
          sessionKey,
          message: content,
          thinking,
          attachments
        },
        (response: { ok: boolean; runId?: string; error?: string }) => {
          if (response.ok && response.runId) {
            setCurrentRunId(response.runId);
            setIsTyping(true);
            resolve({ runId: response.runId });
          } else {
            reject(new Error(response.error || 'Failed to send message'));
          }
        }
      );
    });
  }, [connected, sessionKey]);

  /**
   * Abort current chat
   */
  const abortChat = useCallback(() => {
    if (currentRunId) {
      socketRef.current?.emit('chat.abort', { runId: currentRunId });
      setCurrentRunId(null);
      setIsTyping(false);
    }
  }, [currentRunId]);

  /**
   * Clear messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /**
   * Switch session
   */
  const switchSession = useCallback((newSessionKey: string) => {
    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('session.switch',
        { sessionKey: newSessionKey },
        (response: { ok: boolean }) => {
          if (response.ok) {
            setMessages([]);
            resolve();
          } else {
            reject(new Error('Failed to switch session'));
          }
        }
      );
    });
  }, []);

  return {
    connected,
    messages,
    isTyping,
    sendMessage,
    loadHistory,
    abortChat,
    clearMessages,
    switchSession
  };
};
