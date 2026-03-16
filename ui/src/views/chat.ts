import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface SessionEntry {
  key: string;
  label?: string;
  updatedAt?: string;
}

@customElement("acaclaw-chat")
export class ChatView extends LitElement {
  @state() private _messages: Message[] = [];
  @state() private _input = "";
  @state() private _sending = false;
  @state() private _sessions: SessionEntry[] = [];
  @state() private _sessionKey = "main";
  @state() private _showSessions = false;
  private _activeRunId = "";
  private _cleanupChat: (() => void) | null = null;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }
    .header-actions {
      display: flex;
      gap: 8px;
    }

    .chat-container {
      flex: 1;
      display: flex;
      gap: 16px;
      min-height: 0;
    }

    .sessions-panel {
      width: 240px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      overflow-y: auto;
      flex-shrink: 0;
      box-shadow: var(--ac-shadow-xs);
    }
    .sessions-panel.hidden {
      display: none;
    }
    .session-item {
      padding: 14px 18px;
      cursor: pointer;
      border-bottom: 1px solid var(--ac-border-subtle, #f1f5f9);
      font-size: 13px;
      transition: background var(--ac-transition-fast);
    }
    .session-item:hover {
      background: var(--ac-bg-hover);
    }
    .session-item.active {
      background: var(--ac-primary-bg);
      color: var(--ac-primary);
    }
    .session-title {
      font-weight: 500;
      margin-bottom: 3px;
    }
    .session-date {
      font-size: 11px;
      color: var(--ac-text-muted);
    }

    .messages-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius) var(--ac-radius) 0 0;
      padding: 24px;
      box-shadow: var(--ac-shadow-xs);
    }

    .message {
      margin-bottom: 24px;
      max-width: 80%;
      animation: msgIn 0.25s ease;
    }
    .message.user {
      margin-left: auto;
    }
    .message.assistant {
      margin-right: auto;
    }

    .msg-header {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-bottom: 6px;
      font-weight: 500;
    }
    .msg-content {
      padding: 14px 18px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.user .msg-content {
      background: var(--ac-primary);
      color: #fff;
      border-bottom-right-radius: 4px;
      box-shadow: var(--ac-shadow-sm);
    }
    .message.assistant .msg-content {
      background: var(--ac-bg-hover);
      color: var(--ac-text);
      border-bottom-left-radius: 4px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ac-text-muted);
      gap: 12px;
    }
    .empty-icon {
      font-size: 48px;
      opacity: 0.5;
    }
    .empty-text {
      font-size: 16px;
      font-weight: 500;
      color: var(--ac-text-secondary);
    }
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .suggestion {
      padding: 10px 18px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full, 9999px);
      cursor: pointer;
      font-size: 13px;
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .suggestion:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-1px);
    }

    .input-area {
      display: flex;
      gap: 10px;
      padding: 16px 20px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-top: none;
      border-radius: 0 0 var(--ac-radius) var(--ac-radius);
      box-shadow: var(--ac-shadow-sm);
    }
    .input-area textarea {
      flex: 1;
      resize: none;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      padding: 12px 16px;
      font-size: 14px;
      line-height: 1.5;
      background: var(--ac-bg);
      min-height: 44px;
      max-height: 120px;
      transition: all var(--ac-transition-fast);
    }
    .input-area textarea:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-focus);
    }
    .input-area textarea::placeholder {
      color: var(--ac-text-tertiary, #cbd5e1);
    }

    .send-btn {
      align-self: flex-end;
      padding: 10px 24px;
      background: var(--ac-primary);
      color: #fff;
      border-radius: var(--ac-radius-sm);
      font-weight: 500;
      font-size: 13px;
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .send-btn:hover {
      background: var(--ac-primary-dark);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-0.5px);
    }
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .toggle-btn {
      padding: 8px 14px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 12px;
      color: var(--ac-text-secondary);
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .toggle-btn:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-border-strong);
    }

    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadSessions();
    this._loadHistory();

    // Listen for streaming chat events from the gateway
    this._cleanupChat = gateway.onNotification("chat", (data: unknown) => {
      const d = data as {
        runId?: string;
        sessionKey?: string;
        state?: string;
        message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
        errorMessage?: string;
      };

      // Only handle events for our active run
      if (d.runId && this._activeRunId && d.runId !== this._activeRunId) return;

      if (d.state === "delta" && d.message) {
        // Extract text from content array
        const text = d.message.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
        if (text && this._messages.length > 0) {
          const last = this._messages[this._messages.length - 1];
          if (last.role === "assistant") {
            last.content = text; // delta sends full accumulated text
            last.timestamp = new Date().toLocaleTimeString();
            this._messages = [...this._messages];
          }
        }
      } else if (d.state === "final" && d.message) {
        const text = d.message.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
        if (this._messages.length > 0) {
          const last = this._messages[this._messages.length - 1];
          if (last.role === "assistant") {
            if (text) last.content = text;
            last.timestamp = new Date().toLocaleTimeString();
            this._messages = [...this._messages];
          }
        }
        this._sending = false;
        this._activeRunId = "";
      } else if (d.state === "error") {
        if (this._messages.length > 0) {
          const last = this._messages[this._messages.length - 1];
          if (last.role === "assistant") {
            last.content = `Error: ${d.errorMessage ?? "Agent run failed"}`;
            last.timestamp = new Date().toLocaleTimeString();
            this._messages = [...this._messages];
          }
        }
        this._sending = false;
        this._activeRunId = "";
      }
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupChat?.();
    this._cleanupChat = null;
  }

  private async _loadSessions() {
    try {
      const res = await gateway.call<{ sessions: SessionEntry[] }>("sessions.list", {});
      this._sessions = res?.sessions ?? [];
    } catch {
      // Gateway unavailable
    }
  }

  private async _loadHistory() {
    if (!this._sessionKey) return;
    try {
      const res = await gateway.call<{
        messages?: Array<{
          role?: string;
          content?: string | Array<{ type?: string; text?: string }>;
        }>;
      }>("chat.history", { sessionKey: this._sessionKey, limit: 100 });
      if (res?.messages) {
        this._messages = res.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            let text = "";
            if (typeof m.content === "string") {
              text = m.content;
            } else if (Array.isArray(m.content)) {
              text = m.content
                .filter((c) => c.type === "text")
                .map((c) => c.text ?? "")
                .join("");
            }
            return {
              role: m.role as "user" | "assistant",
              content: text,
              timestamp: "",
            };
          });
      }
    } catch {
      // No history available
    }
  }

  private async _send() {
    const text = this._input.trim();
    if (!text || this._sending) return;

    this._messages = [
      ...this._messages,
      { role: "user", content: text, timestamp: new Date().toLocaleTimeString() },
    ];

    // Add placeholder for assistant response
    this._messages = [
      ...this._messages,
      { role: "assistant", content: "", timestamp: "" },
    ];

    this._input = "";
    this._sending = true;

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await gateway.call<{ runId?: string }>("chat.send", {
        sessionKey: this._sessionKey,
        message: text,
        idempotencyKey,
      });
      if (res?.runId) {
        this._activeRunId = res.runId;
      }
      // Response content arrives via WebSocket "chat" events (delta/final)
    } catch (err) {
      const last = this._messages[this._messages.length - 1];
      if (last.role === "assistant") {
        last.content = `Error: ${err instanceof Error ? err.message : "Failed to send message"}`;
        last.timestamp = new Date().toLocaleTimeString();
        this._messages = [...this._messages];
      }
      this._sending = false;
    }
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._send();
    }
  }

  private _useSuggestion(text: string) {
    this._input = text;
    this._send();
  }

  private async _switchSession(key: string) {
    this._sessionKey = key;
    this._messages = [];
    await this._loadHistory();
  }

  override render() {
    return html`
      <div class="header">
        <h1>Chat</h1>
        <div class="header-actions">
          <button
            class="toggle-btn"
            @click=${() => (this._showSessions = !this._showSessions)}
          >
            ${this._showSessions ? "Hide" : "Show"} Sessions
          </button>
        </div>
      </div>

      <div class="chat-container">
        <div
          class="sessions-panel ${this._showSessions ? "" : "hidden"}"
        >
          ${this._sessions.length === 0
            ? html`<div
                style="padding: 16px; color: var(--ac-text-muted); font-size: 13px"
              >
                No sessions yet
              </div>`
            : this._sessions.map(
                (s) => html`
                  <div
                    class="session-item ${this._sessionKey === s.key
                      ? "active"
                      : ""}"
                    @click=${() => this._switchSession(s.key)}
                  >
                    <div class="session-title">${s.label || s.key}</div>
                    <div class="session-date">${s.updatedAt ?? ""}</div>
                  </div>
                `,
              )}
        </div>

        <div class="messages-area">
          <div class="messages">
            ${this._messages.length === 0
              ? html`
                  <div class="empty-state">
                    <span class="empty-icon">💬</span>
                    <span class="empty-text"
                      >Start a conversation with your AI research
                      assistant</span
                    >
                    <div class="suggestions">
                      <button
                        class="suggestion"
                        @click=${() =>
                          this._useSuggestion(
                            "Analyze my latest experiment data",
                          )}
                      >
                        📊 Analyze data
                      </button>
                      <button
                        class="suggestion"
                        @click=${() =>
                          this._useSuggestion(
                            "Search for recent papers on CRISPR delivery",
                          )}
                      >
                        🔍 Search papers
                      </button>
                      <button
                        class="suggestion"
                        @click=${() =>
                          this._useSuggestion(
                            "Help me write the Methods section of my paper",
                          )}
                      >
                        📝 Write Methods
                      </button>
                      <button
                        class="suggestion"
                        @click=${() =>
                          this._useSuggestion(
                            "Create a publication-quality figure",
                          )}
                      >
                        📈 Create figure
                      </button>
                    </div>
                  </div>
                `
              : this._messages.map(
                  (m) => html`
                    <div class="message ${m.role}">
                      <div class="msg-header">
                        ${m.role === "user" ? "You" : "AcaClaw"}
                        ${m.timestamp ? `· ${m.timestamp}` : ""}
                      </div>
                      <div class="msg-content">
                        ${m.content ||
                        (this._sending ? "Thinking…" : "")}
                      </div>
                    </div>
                  `,
                )}
          </div>

          <div class="input-area">
            <textarea
              placeholder="Ask anything about your research…"
              .value=${this._input}
              @input=${(e: Event) =>
                (this._input = (e.target as HTMLTextAreaElement).value)}
              @keydown=${this._handleKeyDown}
              ?disabled=${this._sending}
            ></textarea>
            <button
              class="send-btn"
              @click=${this._send}
              ?disabled=${this._sending || !this._input.trim()}
            >
              ${this._sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
