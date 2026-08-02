/**
 * AgentService — Frontend WebSocket Client
 * ==========================================
 *
 * Connects to  {wsBase}/api/agent/ws/{sessionId}
 */

import { getApiBase, getWsBase } from "@/services/apiBase";

const BACKEND_WS = getWsBase();
const BACKEND_HTTP = getApiBase();

const WS_RECONNECT_MAX   = 8;
const WS_PING_INTERVAL   = 20_000;  // ms
const WS_RECONNECT_BASE  = 500;     // ms — doubles each retry

// ── Event Types ──────────────────────────────────────────────────────────────

export interface PipelineEvent {
  type: "pipeline";
  stage: "plan" | "review" | "execute" | "done" | "error" | "clarify";
  detail: string;
  data?: Record<string, unknown>;
}

export interface ScreenshotEvent {
  type: "screenshot";
  screenshot: string;    // base64 JPEG
  description: string;
  url: string;
}

export interface StepEvent {
  type: "step_done";
  step: number;
  description: string;
  action: string;
}

export interface DataEvent {
  type: "data";
  data: Record<string, string[]>;
}

export interface TranscriptEvent {
  type: "transcript";
  text: string;
}

export interface SecuritySummaryEvent {
  type: "security_summary";
  data: {
    session_id: string;
    action_count: number;
    risk_score: number;
    blocked_count: number;
    duration_s: number;
  };
}

export interface ErrorEvent  { type: "error";  detail: string; }
export interface HistoryEvent{ type: "history"; history: Array<{role:string;content:string}>; }

export type AgentEvent =
  | PipelineEvent
  | ScreenshotEvent
  | StepEvent
  | DataEvent
  | TranscriptEvent
  | SecuritySummaryEvent
  | ErrorEvent
  | HistoryEvent;

export type EventType = AgentEvent["type"] | "pong";

// ── Utility ───────────────────────────────────────────────────────────────────

/** Generate a new unique session ID (UUID v4 style). */
export function createSession(): string {
  return (
    "sid-" +
    ([1e7] as unknown as number)
      .toString()
      .replace(/[018]/g, (c: string) =>
        (
          +c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
        ).toString(16)
      )
  );
}

// ── AgentService ──────────────────────────────────────────────────────────────

export class AgentService {
  private sessionId: string;
  private ws: WebSocket | null = null;
  private _connected = false;
  private _reconnects = 0;
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;

  // Simple event bus: event → set of handlers
  private _handlers = new Map<string, Set<(ev: unknown) => void>>();

  // Pending transcript resolvers (keyed by correlation id, or just FIFO)
  private _transcriptResolvers: Array<(text: string) => void> = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected;
  }

  /** Open the WebSocket and return a promise that resolves on first connect. */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this._connected) { resolve(); return; }
      this._openWs(resolve, reject);
    });
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event: string, handler: (ev: unknown) => void): () => void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler);
    return () => this._handlers.get(event)?.delete(handler);
  }

  /** Send a natural-language goal to the OpenClaw pipeline. */
  run(text: string, context: Record<string, unknown> = {}): void {
    this._send({ type: "run", text, context });
  }

  /** Confirm a high-risk action that NemoClaw flagged. */
  confirm(text: "confirm" | "cancel" = "confirm"): void {
    this._send({ type: "confirm", text });
  }

  /**
   * Transcribe audio blob.
   * Strategy:
   *  1. Send as base64 over the open WebSocket → wait for "transcript" event.
   *  2. If WS not connected → POST multipart/form-data to /api/agent/transcribe.
   */
  async transcribe(blob: Blob): Promise<string> {
    if (this._connected) {
      return this._transcribeViaWs(blob);
    }
    return this._transcribeViaHttp(blob);
  }

  /** Gracefully close the connection and stop timers. */
  destroy(): void {
    this._destroyed = true;
    this._stopPing();
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, "destroy");
      this.ws = null;
    }
    this._connected = false;
  }

  // ── Internal — WebSocket ────────────────────────────────────────────────────

  private _openWs(
    onFirstOpen?: () => void,
    onFirstFail?: (e: Error) => void
  ): void {
    if (this._destroyed) return;

    const url = `${BACKEND_WS}/api/agent/ws/${this.sessionId}`;
    let firstEvent = true;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      onFirstFail?.(err instanceof Error ? err : new Error(String(err)));
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._connected = true;
      this._reconnects = 0;
      this._startPing();
      if (firstEvent) { firstEvent = false; onFirstOpen?.(); }
      this._emit("connected", { sessionId: this.sessionId });
      console.info(`[AgentService] Connected to ${url}`);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg: AgentEvent & { type: string } = JSON.parse(ev.data as string);

        // Resolve pending transcript promises
        if (msg.type === "transcript") {
          const resolver = this._transcriptResolvers.shift();
          if (resolver) resolver((msg as TranscriptEvent).text);
        }

        this._emit(msg.type, msg);
      } catch (e) {
        console.warn("[AgentService] Bad WS message:", e);
      }
    };

    this.ws.onerror = (err) => {
      console.warn("[AgentService] WS error:", err);
      if (firstEvent) {
        firstEvent = false;
        onFirstFail?.(new Error("WebSocket connection failed"));
      }
    };

    this.ws.onclose = (ev) => {
      this._connected = false;
      this._stopPing();
      this._emit("disconnected", { code: ev.code, reason: ev.reason });
      console.info(`[AgentService] Disconnected (code=${ev.code})`);

      if (!this._destroyed && ev.code !== 1000) {
        this._scheduleReconnect();
      }
    };
  }

  private _scheduleReconnect(): void {
    if (this._destroyed || this._reconnects >= WS_RECONNECT_MAX) {
      console.warn("[AgentService] Max reconnects reached");
      return;
    }
    const delay = Math.min(WS_RECONNECT_BASE * 2 ** this._reconnects, 8000);
    this._reconnects++;
    console.info(
      `[AgentService] Reconnecting in ${delay}ms (attempt ${this._reconnects})`
    );
    this._reconnectTimer = setTimeout(() => this._openWs(), delay);
  }

  private _startPing(): void {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this._connected) this._send({ type: "ping" });
    }, WS_PING_INTERVAL);
  }

  private _stopPing(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  private _send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[AgentService] WS not open — message dropped:", payload.type);
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private _emit(event: string, data: unknown): void {
    this._handlers.get(event)?.forEach((h) => {
      try { h(data); }
      catch (e) { console.warn(`[AgentService] Handler error for '${event}':`, e); }
    });
  }

  // ── Internal — Transcription ────────────────────────────────────────────────

  /** Transcribe via WebSocket (fast path — same connection). */
  private _transcribeViaWs(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove our resolver on timeout
        const idx = this._transcriptResolvers.indexOf(resolver);
        if (idx !== -1) this._transcriptResolvers.splice(idx, 1);
        reject(new Error("Transcription timeout"));
      }, 15_000);

      const resolver = (text: string) => {
        clearTimeout(timeout);
        resolve(text);
      };

      this._transcriptResolvers.push(resolver);

      // Convert blob to base64 then send
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1] ?? reader.result as string;
        this._send({ type: "transcribe", audio_b64: b64 });
      };
      reader.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("FileReader error"));
      };
      reader.readAsDataURL(blob);
    });
  }

  /** Transcribe via HTTP POST fallback. */
  private async _transcribeViaHttp(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("session_id", this.sessionId);

    const resp = await fetch(`${BACKEND_HTTP}/api/agent/transcribe`, {
      method: "POST",
      body: form,
    });

    if (!resp.ok) {
      throw new Error(`Transcription HTTP error ${resp.status}`);
    }

    const json = await resp.json() as { transcript?: string };
    return json.transcript ?? "";
  }
}

// ── Singleton pool ────────────────────────────────────────────────────────────

const _pool = new Map<string, AgentService>();

/**
 * Get (or create) an AgentService for the given session.
 * Reuses the same instance across React re-renders.
 */
export function getAgentService(sessionId: string): AgentService {
  if (!_pool.has(sessionId)) {
    _pool.set(sessionId, new AgentService(sessionId));
  }
  return _pool.get(sessionId)!;
}

/**
 * Destroy and remove a session's AgentService from the pool.
 * Call this when the component using it unmounts.
 */
export function destroyAgentService(sessionId: string): void {
  const svc = _pool.get(sessionId);
  if (svc) {
    svc.destroy();
    _pool.delete(sessionId);
  }
}
