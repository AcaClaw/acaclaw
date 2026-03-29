/**
 * WebSocket client for communicating with the OpenClaw gateway.
 * Uses the OpenClaw gateway protocol (type/id/method frames, NOT JSON-RPC).
 * Shared by all views — import `gateway` singleton.
 */

export type GatewayState = "connected" | "connecting" | "disconnected";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Read gateway auth token from the meta tag injected into index.html at deploy time. */
function resolveAuthToken(): string | undefined {
  // Primary: meta tag injected by install.sh / start.sh into the served HTML.
  // This is always current because the gateway reads index.html from disk on each request.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="oc-token"]')
    ?? document.querySelector<HTMLMetaElement>('meta[name="gateway-token"]');
  if (meta?.content) {
    console.log("[gateway] auth: resolved from meta tag");
    return meta.content;
  }
  // Fallback: URL hash (e.g. opened via start.sh with #token=...)
  const hash = location.hash;
  if (hash.includes("token=")) {
    const match = hash.match(/token=([^&]+)/);
    if (match) {
      console.log("[gateway] auth: resolved from URL hash");
      return match[1];
    }
  }
  // Fallback: sessionStorage (set by gateway control-ui bootstrap)
  const stored = sessionStorage.getItem("openclaw.control.token");
  if (stored) {
    console.log("[gateway] auth: resolved from sessionStorage");
    return stored;
  }
  console.warn("[gateway] auth: no token found");
  return undefined;
}

/**
 * Re-fetch the HTML page to get a fresh auth token after a mismatch.
 * Updates the meta tag in-place so subsequent resolveAuthToken() calls use it.
 */
async function refreshAuthToken(): Promise<string | undefined> {
  try {
    const res = await fetch(location.href, { cache: "no-store" });
    if (!res.ok) return undefined;
    const html = await res.text();
    const match = html.match(/name="oc-token"\s+content="([^"]*)"/);
    if (match?.[1]) {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="oc-token"]');
      if (meta) meta.content = match[1];
      console.log("[gateway] auth: refreshed token from server");
      return match[1];
    }
  } catch { /* network failure — keep old token */ }
  return undefined;
}

class GatewayController extends EventTarget {
  private _ws: WebSocket | null = null;
  private _state: GatewayState = "disconnected";
  private _pending = new Map<string, PendingRequest>();
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners = new Map<string, Set<(data: unknown) => void>>();
  private _authenticated = false;
  private _connectNonce: string | null = null;
  private _connectSent = false;
  private _challengeTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private _tokenRefreshPending: Promise<void> | null = null;

  get state(): GatewayState {
    return this._state;
  }

  get authenticated(): boolean {
    return this._authenticated;
  }

  /** Open WebSocket to the gateway on the same host */
  connect() {
    if (this._ws) return;
    this._setState("connecting");

    // Use gateway URL from meta tag (for dev/proxy setups) or same host
    const gwMeta = document.querySelector<HTMLMetaElement>('meta[name="oc-gateway-url"]');
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = gwMeta?.content
      ? gwMeta.content
      : `${protocol}//${location.host}/`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      // Wait for the connect.challenge event before sending connect.
      // The gateway sends it immediately on open; we reply with our connect frame.
      this._connectSent = false;
      this._connectNonce = null;

      // Timeout: if no challenge arrives within 10s, close and retry.
      this._challengeTimer = setTimeout(() => {
        console.error("[gateway] connect.challenge timeout");
        this._ws?.close(1008, "connect challenge timeout");
      }, 10_000);
    };

    this._ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this._handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      this._cleanup();
      this._setState("disconnected");
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      this._ws?.close();
    };
  }

  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._ws?.close();
    this._ws = null;
    this._cleanup();
    this._setState("disconnected");
  }

  /** Send a request using the OpenClaw gateway protocol and return the payload. */
  async call<T = unknown>(method: string, params?: unknown, opts?: { timeoutMs?: number }): Promise<T> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway not connected");
    }

    const id = uuid();
    const frame = { type: "req", id, method, params: params ?? {} };
    this._ws.send(JSON.stringify(frame));

    const timeout = opts?.timeoutMs ?? 30_000;
    return new Promise<T>((resolve, reject) => {
      this._pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, timeout);
    });
  }

  /** Subscribe to server-pushed event notifications. */
  onNotification(method: string, handler: (data: unknown) => void) {
    let set = this._listeners.get(method);
    if (!set) {
      set = new Set();
      this._listeners.set(method, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Send the mandatory connect handshake as first frame. */
  private _sendConnectFrame() {
    const token = resolveAuthToken();
    console.log(`[gateway] connect: token=${token ? token.slice(0, 8) + "..." + token.slice(-4) + " (len=" + token.length + ")" : "NONE"}`);

    const connectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui",
        version: "acaclaw-1.0.0",
        platform: navigator.platform ?? "web",
        mode: "ui",
      },
      role: "operator",
      scopes: [
        "operator.admin",
        "operator.read",
        "operator.write",
        "operator.approvals",
        "operator.pairing",
      ],
      auth: token ? { token } : undefined,
    };

    const id = uuid();
    const frame = { type: "req", id, method: "connect", params: connectParams };
    this._ws!.send(JSON.stringify(frame));

    // Register handler for the connect response
    this._pending.set(id, {
      resolve: () => {
        this._authenticated = true;
        this._reconnectAttempts = 0;
        this._setState("connected");
        this._startHeartbeat();
      },
      reject: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[gateway] connect handshake failed:", msg);
        this._authenticated = false;
        this._reconnectAttempts++;
        this._setState("disconnected");
        this._ws?.close();

        // On token mismatch, re-fetch token from server before next reconnect
        if (msg.includes("token mismatch") || msg.includes("token_mismatch")) {
          // After 3 consecutive mismatches, force full page reload to get new JS+token
          if (this._reconnectAttempts >= 3) {
            console.warn("[gateway] persistent token mismatch — reloading page");
            location.reload();
            return;
          }
          this._tokenRefreshPending = refreshAuthToken().then(() => {}).catch(() => {}).finally(() => {
            this._tokenRefreshPending = null;
          });
        }
      },
    });
  }

  private _handleMessage(msg: Record<string, unknown>) {
    // Response frame: { type: "res", id, ok, payload?, error? }
    if (msg.type === "res" && typeof msg.id === "string") {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);

      if (msg.ok) {
        pending.resolve(msg.payload);
      } else {
        const err = msg.error as { code?: string; message?: string } | undefined;
        pending.reject(new Error(err?.message ?? "request failed"));
      }
      return;
    }

    // Event frame: { type: "event", event, payload? }
    if (msg.type === "event") {
      const eventName = msg.event as string;
      if (!eventName) return;

      // Handle connect.challenge — gateway sends a nonce on open; respond with connect
      if (eventName === "connect.challenge") {
        if (!this._connectSent && !this._authenticated) {
          if (this._challengeTimer) {
            clearTimeout(this._challengeTimer);
            this._challengeTimer = null;
          }
          const payload = msg.payload as { nonce?: string } | undefined;
          this._connectNonce = payload?.nonce ?? null;
          this._connectSent = true;
          this._sendConnectFrame();
        }
        return;
      }

      const handlers = this._listeners.get(eventName);
      if (handlers) {
        for (const h of handlers) h(msg.payload);
      }
      this.dispatchEvent(
        new CustomEvent("notification", {
          detail: { method: eventName, params: msg.payload },
        }),
      );
    }
  }

  private _setState(state: GatewayState) {
    this._state = state;
    this.dispatchEvent(
      new CustomEvent("state-change", { detail: { state } }),
    );
  }

  private _cleanup() {
    this._ws = null;
    this._authenticated = false;
    this._connectNonce = null;
    this._connectSent = false;
    this._stopHeartbeat();
    if (this._challengeTimer) {
      clearTimeout(this._challengeTimer);
      this._challengeTimer = null;
    }
    for (const [, p] of this._pending) {
      p.reject(new Error("Connection closed"));
    }
    this._pending.clear();
  }

  /** Immediately attempt reconnection (cancels any pending auto-reconnect). */
  reconnectNow() {
    if (this._state === "connected" || this._state === "connecting") return;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempts = 0;
    this._ws?.close();
    this._ws = null;
    this.connect();
  }

  private _scheduleReconnect() {
    if (this._reconnectTimer) return;
    // Exponential backoff: 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts), 30_000);
    console.log(`[gateway] reconnect in ${delay}ms (attempt ${this._reconnectAttempts + 1})`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      // Wait for any in-flight token refresh to finish before reconnecting
      if (this._tokenRefreshPending) {
        await this._tokenRefreshPending;
      }
      this.connect();
    }, delay);
  }

  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this.call("health", undefined, { timeoutMs: 10_000 }).catch(() => {
          console.warn("[gateway] heartbeat failed — forcing reconnect");
          this._ws?.close(1000, "heartbeat timeout");
        });
      }
    }, 30_000);
  }

  private _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}

/** Singleton gateway instance */
export const gateway = new GatewayController();

// ── Auto-reconnect on tab focus / network recovery ──
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && gateway.state === "disconnected") {
    console.log("[gateway] tab visible — reconnecting");
    gateway.reconnectNow();
  }
});
window.addEventListener("online", () => {
  if (gateway.state === "disconnected") {
    console.log("[gateway] network online — reconnecting");
    gateway.reconnectNow();
  }
});
