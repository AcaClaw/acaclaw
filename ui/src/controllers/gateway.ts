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

/** Read gateway auth token from URL hash (#token=...) or sessionStorage. */
function resolveAuthToken(): string | undefined {
  // Check URL hash first: http://localhost:2090/#token=abc
  const hash = location.hash;
  if (hash.includes("token=")) {
    const match = hash.match(/token=([^&]+)/);
    if (match) return match[1];
  }
  // Check sessionStorage (set by previous connect or by the gateway control-ui bootstrap)
  const stored = sessionStorage.getItem("openclaw.control.token");
  if (stored) return stored;
  // Check meta tag injected at build/deploy time
  const meta = document.querySelector<HTMLMetaElement>('meta[name="oc-token"]');
  if (meta?.content) return meta.content;
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

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      // Don't send connect yet — wait for the connect.challenge event from the gateway
      // The gateway will send a nonce that we include in our connect frame
      this._connectSent = false;
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
        this._setState("connected");
        this._startHeartbeat();
      },
      reject: (err) => {
        console.error("[gateway] connect handshake failed:", err);
        this._authenticated = false;
        this._setState("disconnected");
        this._ws?.close();
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

      // Handle connect.challenge — gateway sends a nonce before accepting connect
      if (eventName === "connect.challenge") {
        const payload = msg.payload as { nonce?: string } | undefined;
        if (payload?.nonce) {
          this._connectNonce = payload.nonce;
          // Re-send the connect frame with the nonce
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
    for (const [, p] of this._pending) {
      p.reject(new Error("Connection closed"));
    }
    this._pending.clear();
  }

  private _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this.call("health").catch(() => {});
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
