/**
 * Unit tests for the GatewayController.
 * Tests connection lifecycle, request/response handling, notifications,
 * token resolution, and reconnection logic.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }
  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() { this.onopen?.(); }
  simulateMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateError() { this.onerror?.(); }
}

let lastCreatedWs: MockWebSocket | null = null;

// @ts-expect-error — replacing global WebSocket with mock
globalThis.WebSocket = class extends MockWebSocket {
  constructor() {
    super();
    lastCreatedWs = this;
  }
};

// Provide mock crypto.randomUUID
if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => `uuid-${++counter}` },
    writable: true,
  });
}

// Clear module cache to get fresh GatewayController
const { gateway } = await import("../ui/src/controllers/gateway.js");

beforeEach(() => {
  // Ensure clean state
  gateway.disconnect();
  lastCreatedWs = null;
});

describe("GatewayController", () => {
  // ── Initial state ──

  describe("initial state", () => {
    it("starts disconnected", () => {
      expect(gateway.state).toBe("disconnected");
    });

    it("starts unauthenticated", () => {
      expect(gateway.authenticated).toBe(false);
    });
  });

  // ── Connection lifecycle ──

  describe("connect", () => {
    it("transitions to connecting state", () => {
      gateway.connect();
      expect(gateway.state).toBe("connecting");
      expect(lastCreatedWs).toBeTruthy();
    });

    it("dispatches state-change event on connect", () => {
      const handler = vi.fn();
      gateway.addEventListener("state-change", handler);
      gateway.connect();
      expect(handler).toHaveBeenCalled();
      gateway.removeEventListener("state-change", handler);
    });

    it("does not create duplicate WebSocket on double connect", () => {
      gateway.connect();
      const ws1 = lastCreatedWs;
      gateway.connect(); // should be no-op
      expect(lastCreatedWs).toBe(ws1);
    });
  });

  describe("disconnect", () => {
    it("transitions to disconnected", () => {
      gateway.connect();
      gateway.disconnect();
      expect(gateway.state).toBe("disconnected");
    });

    it("rejects pending requests on disconnect", async () => {
      gateway.connect();
      const ws = lastCreatedWs!;
      // Simulate challenge + connect to get to authenticated state
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: { nonce: "abc" } });
      // Find connect request and resolve it
      const connectFrame = JSON.parse(ws.sentMessages[0]);
      ws.simulateMessage({ type: "res", id: connectFrame.id, ok: true, payload: {} });

      // Now make a call that will be pending
      const callPromise = gateway.call("health").catch((err: Error) => err.message);
      gateway.disconnect();
      const result = await callPromise;
      expect(result).toContain("closed");
    });
  });

  // ── Connect handshake ──

  describe("connect handshake", () => {
    it("sends connect frame after challenge event", () => {
      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: { nonce: "test123" } });
      expect(ws.sentMessages.length).toBe(1);
      const frame = JSON.parse(ws.sentMessages[0]);
      expect(frame.method).toBe("connect");
      expect(frame.params.minProtocol).toBe(3);
      expect(frame.params.client.id).toBe("openclaw-control-ui");
      expect(frame.params.role).toBe("operator");
    });

    it("becomes authenticated after successful connect response", () => {
      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      const frame = JSON.parse(ws.sentMessages[0]);
      ws.simulateMessage({ type: "res", id: frame.id, ok: true, payload: {} });
      expect(gateway.authenticated).toBe(true);
      expect(gateway.state).toBe("connected");
    });

    it("does not re-send connect on duplicate challenge", () => {
      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      // Should only have sent 1 connect frame
      expect(ws.sentMessages.length).toBe(1);
    });
  });

  // ── call() ──

  describe("call", () => {
    function connectGateway() {
      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      const frame = JSON.parse(ws.sentMessages[0]);
      ws.simulateMessage({ type: "res", id: frame.id, ok: true, payload: {} });
      return ws;
    }

    it("throws when not connected", async () => {
      await expect(gateway.call("health")).rejects.toThrow("not connected");
    });

    it("sends request frame with method and params", () => {
      const ws = connectGateway();
      gateway.call("test.method", { key: "value" }).catch(() => {});
      // First message is connect, second is our call
      const reqFrame = JSON.parse(ws.sentMessages[1]);
      expect(reqFrame.type).toBe("req");
      expect(reqFrame.method).toBe("test.method");
      expect(reqFrame.params).toEqual({ key: "value" });
      expect(reqFrame.id).toBeTruthy();
    });

    it("resolves with payload on success", async () => {
      const ws = connectGateway();
      const promise = gateway.call("test.method");
      const reqFrame = JSON.parse(ws.sentMessages[1]);
      ws.simulateMessage({ type: "res", id: reqFrame.id, ok: true, payload: { result: 42 } });
      const result = await promise;
      expect(result).toEqual({ result: 42 });
    });

    it("rejects with error message on failure", async () => {
      const ws = connectGateway();
      const promise = gateway.call("test.method");
      const reqFrame = JSON.parse(ws.sentMessages[1]);
      ws.simulateMessage({ type: "res", id: reqFrame.id, ok: false, error: { message: "boom" } });
      await expect(promise).rejects.toThrow("boom");
    });

    it("rejects on timeout", async () => {
      const ws = connectGateway();
      vi.useFakeTimers();
      const promise = gateway.call("test.slow", undefined, { timeoutMs: 100 });
      vi.advanceTimersByTime(101);
      await expect(promise).rejects.toThrow("timed out");
      vi.useRealTimers();
    });
  });

  // ── onNotification ──

  describe("onNotification", () => {
    function connectGateway() {
      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      const frame = JSON.parse(ws.sentMessages[0]);
      ws.simulateMessage({ type: "res", id: frame.id, ok: true, payload: {} });
      return ws;
    }

    it("receives event notifications", () => {
      const ws = connectGateway();
      const handler = vi.fn();
      gateway.onNotification("test.event", handler);
      ws.simulateMessage({ type: "event", event: "test.event", payload: { data: "hello" } });
      expect(handler).toHaveBeenCalledWith({ data: "hello" });
    });

    it("returns unsubscribe function", () => {
      const ws = connectGateway();
      const handler = vi.fn();
      const unsub = gateway.onNotification("test.event", handler);
      unsub();
      ws.simulateMessage({ type: "event", event: "test.event", payload: {} });
      expect(handler).not.toHaveBeenCalled();
    });

    it("multiple handlers for same event", () => {
      const ws = connectGateway();
      const h1 = vi.fn();
      const h2 = vi.fn();
      gateway.onNotification("multi.event", h1);
      gateway.onNotification("multi.event", h2);
      ws.simulateMessage({ type: "event", event: "multi.event", payload: { x: 1 } });
      expect(h1).toHaveBeenCalledWith({ x: 1 });
      expect(h2).toHaveBeenCalledWith({ x: 1 });
    });

    it("dispatches notification CustomEvent", () => {
      const ws = connectGateway();
      const handler = vi.fn();
      gateway.addEventListener("notification", handler);
      ws.simulateMessage({ type: "event", event: "custom.evt", payload: { val: true } });
      expect(handler).toHaveBeenCalled();
      gateway.removeEventListener("notification", handler);
    });
  });

  // ── Reconnection ──

  describe("reconnection", () => {
    it("sets state to disconnected after close", () => {
      gateway.connect();
      const ws1 = lastCreatedWs!;
      ws1.simulateOpen();
      ws1.readyState = MockWebSocket.CLOSED;
      ws1.onclose?.();
      expect(gateway.state).toBe("disconnected");
      gateway.disconnect();
    });

    it("reconnectNow triggers immediate reconnect", () => {
      gateway.connect();
      const ws1 = lastCreatedWs!;
      ws1.simulateOpen();
      ws1.close(); // disconnects
      gateway.reconnectNow();
      expect(gateway.state).toBe("connecting");
    });
  });

  // ── Token resolution ──

  describe("token resolution", () => {
    it("resolves token from meta tag", () => {
      const meta = document.createElement("meta");
      meta.name = "oc-token";
      meta.content = "test-token-12345";
      document.head.appendChild(meta);

      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      const frame = JSON.parse(ws.sentMessages[0]);
      expect(frame.params.auth?.token).toBe("test-token-12345");

      document.head.removeChild(meta);
    });

    it("resolves token from sessionStorage", () => {
      sessionStorage.setItem("openclaw.control.token", "stored-token");

      gateway.connect();
      const ws = lastCreatedWs!;
      ws.simulateOpen();
      ws.simulateMessage({ type: "event", event: "connect.challenge", payload: {} });
      const frame = JSON.parse(ws.sentMessages[0]);
      expect(frame.params.auth?.token).toBe("stored-token");

      sessionStorage.removeItem("openclaw.control.token");
    });
  });
});
