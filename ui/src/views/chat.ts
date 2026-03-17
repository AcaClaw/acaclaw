import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { STAFF_MEMBERS } from "./staff.js";
import type { StaffMember } from "./staff.js";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AgentTab {
  agentId: string;
  agent: StaffMember;
  messages: Message[];
  sending: boolean;
  activeRunId: string;
  input: string;
}

/** Default "general" tab for the main session (no specific agent) */
const GENERAL_TAB_ID = "general";

@customElement("acaclaw-chat")
export class ChatView extends LitElement {
  @state() private _tabs: AgentTab[] = [];
  @state() private _activeTabId = GENERAL_TAB_ID;
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
      margin-bottom: 16px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }

    /* ── Agent Tabs ── */
    .tabs-bar {
      display: flex;
      gap: 4px;
      padding: 4px;
      background: var(--ac-bg-hover, #f1f5f9);
      border-radius: 14px;
      margin-bottom: 16px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      background: transparent;
      border: none;
      transition: all 0.2s ease;
      white-space: nowrap;
      position: relative;
    }
    .tab:hover {
      background: rgba(255, 255, 255, 0.6);
      color: var(--ac-text);
    }
    .tab.active {
      background: var(--ac-bg-surface, #fff);
      color: var(--ac-text);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .tab-icon {
      font-size: 16px;
    }
    .tab-name {
      font-size: 13px;
    }
    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      font-size: 10px;
      color: var(--ac-text-muted);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      margin-left: 4px;
    }
    .tab-close:hover {
      background: rgba(0, 0, 0, 0.1);
      color: var(--ac-text);
    }

    .tab-sending {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ac-primary);
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* ── Chat Area ── */
    .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
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
    .empty-sub {
      font-size: 13px;
      color: var(--ac-text-muted);
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

    .input-agent-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--ac-bg-hover);
      border-radius: var(--ac-radius-sm);
      font-size: 12px;
      font-weight: 600;
      color: var(--ac-text-secondary);
      flex-shrink: 0;
      align-self: center;
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
      border: none;
      cursor: pointer;
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

    .no-tabs-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
      color: var(--ac-text-muted);
    }
    .no-tabs-icon {
      font-size: 64px;
      opacity: 0.4;
    }
    .no-tabs-text {
      font-size: 18px;
      font-weight: 600;
      color: var(--ac-text-secondary);
    }
    .no-tabs-sub {
      font-size: 14px;
      color: var(--ac-text-muted);
      max-width: 400px;
      text-align: center;
      line-height: 1.6;
    }
    .btn-go-agents {
      padding: 10px 24px;
      background: var(--ac-primary);
      color: #fff;
      border: none;
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      margin-top: 8px;
    }
    .btn-go-agents:hover {
      background: var(--ac-primary-dark);
    }

    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();

    // Initialize with the general tab
    if (this._tabs.length === 0) {
      this._tabs = [this._createGeneralTab()];
    }

    // Listen for open-agent-chat events from the Agents view
    this._handleOpenAgent = this._handleOpenAgent.bind(this);
    window.addEventListener("open-agent-chat", this._handleOpenAgent as EventListener);

    // Listen for streaming chat events from the gateway
    this._cleanupChat = gateway.onNotification("chat", (data: unknown) => {
      this._handleChatEvent(data);
    });

    // Load history for the active tab
    this._loadHistory(this._activeTabId);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("open-agent-chat", this._handleOpenAgent as EventListener);
    this._cleanupChat?.();
    this._cleanupChat = null;
  }

  private _handleOpenAgent(e: Event) {
    const detail = (e as CustomEvent).detail as { agentId: string };
    if (!detail?.agentId) return;
    this.openAgentTab(detail.agentId);
  }

  /** Public method to open (or switch to) an agent tab */
  openAgentTab(agentId: string) {
    const existing = this._tabs.find((t) => t.agentId === agentId);
    if (existing) {
      this._activeTabId = agentId;
      this._tabs = [...this._tabs];
      return;
    }

    const agent = STAFF_MEMBERS.find((a) => a.id === agentId);
    if (!agent) return;

    const newTab: AgentTab = {
      agentId,
      agent,
      messages: [],
      sending: false,
      activeRunId: "",
      input: "",
    };

    this._tabs = [...this._tabs, newTab];
    this._activeTabId = agentId;
    this._loadHistory(agentId);
  }

  private _createGeneralTab(): AgentTab {
    return {
      agentId: GENERAL_TAB_ID,
      agent: {
        id: GENERAL_TAB_ID,
        icon: "\u{1F4AC}",
        name: "General",
        role: "General Assistant",
        discipline: "All",
        condaEnv: "acaclaw",
        description: "General-purpose research assistant",
        skills: [],
      },
      messages: [],
      sending: false,
      activeRunId: "",
      input: "",
    };
  }

  private _getSessionKey(agentId: string): string {
    if (agentId === GENERAL_TAB_ID) return "main";
    return `agent:${agentId}:web:main`;
  }

  private _getActiveTab(): AgentTab | undefined {
    return this._tabs.find((t) => t.agentId === this._activeTabId);
  }

  private _handleChatEvent(data: unknown) {
    const d = data as {
      runId?: string;
      sessionKey?: string;
      state?: string;
      message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
      errorMessage?: string;
    };

    // Find the tab this event belongs to (by runId match)
    const tab = this._tabs.find((t) => t.activeRunId && t.activeRunId === d.runId);
    if (!tab) return;

    if (d.state === "delta" && d.message) {
      const text = d.message.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      if (text && tab.messages.length > 0) {
        const last = tab.messages[tab.messages.length - 1];
        if (last.role === "assistant") {
          last.content = text;
          last.timestamp = new Date().toLocaleTimeString();
        }
      }
    } else if (d.state === "final" && d.message) {
      const text = d.message.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      if (tab.messages.length > 0) {
        const last = tab.messages[tab.messages.length - 1];
        if (last.role === "assistant") {
          if (text) last.content = text;
          last.timestamp = new Date().toLocaleTimeString();
        }
      }
      tab.sending = false;
      tab.activeRunId = "";
    } else if (d.state === "error") {
      if (tab.messages.length > 0) {
        const last = tab.messages[tab.messages.length - 1];
        if (last.role === "assistant") {
          last.content = `Error: ${d.errorMessage ?? "Agent run failed"}`;
          last.timestamp = new Date().toLocaleTimeString();
        }
      }
      tab.sending = false;
      tab.activeRunId = "";
    }

    this._tabs = [...this._tabs];
  }

  private async _loadHistory(agentId: string) {
    const sessionKey = this._getSessionKey(agentId);
    try {
      const res = await gateway.call<{
        messages?: Array<{
          role?: string;
          content?: string | Array<{ type?: string; text?: string }>;
        }>;
      }>("chat.history", { sessionKey, limit: 100 });
      if (res?.messages) {
        const tab = this._tabs.find((t) => t.agentId === agentId);
        if (tab) {
          tab.messages = res.messages
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
              return { role: m.role as "user" | "assistant", content: text, timestamp: "" };
            });
          this._tabs = [...this._tabs];
        }
      }
    } catch {
      // Gateway unavailable
    }
  }

  private async _send() {
    const tab = this._getActiveTab();
    if (!tab) return;

    const text = tab.input.trim();
    if (!text || tab.sending) return;

    tab.messages = [
      ...tab.messages,
      { role: "user", content: text, timestamp: new Date().toLocaleTimeString() },
      { role: "assistant", content: "", timestamp: "" },
    ];
    tab.input = "";
    tab.sending = true;
    this._tabs = [...this._tabs];

    try {
      const sessionKey = this._getSessionKey(tab.agentId);
      const idempotencyKey = crypto.randomUUID();
      const res = await gateway.call<{ runId?: string }>("chat.send", {
        sessionKey,
        message: text,
        idempotencyKey,
      });
      if (res?.runId) {
        tab.activeRunId = res.runId;
        this._tabs = [...this._tabs];
      }
    } catch (err) {
      const last = tab.messages[tab.messages.length - 1];
      if (last?.role === "assistant") {
        last.content = `Error: ${err instanceof Error ? err.message : "Failed to send message"}`;
        last.timestamp = new Date().toLocaleTimeString();
      }
      tab.sending = false;
      this._tabs = [...this._tabs];
    }
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._send();
    }
  }

  private _handleInput(e: Event) {
    const tab = this._getActiveTab();
    if (tab) {
      tab.input = (e.target as HTMLTextAreaElement).value;
      this._tabs = [...this._tabs];
    }
  }

  private _switchTab(agentId: string) {
    this._activeTabId = agentId;
    this._tabs = [...this._tabs];
  }

  private _closeTab(agentId: string) {
    if (agentId === GENERAL_TAB_ID) return; // Don't close general tab
    this._tabs = this._tabs.filter((t) => t.agentId !== agentId);
    if (this._activeTabId === agentId) {
      this._activeTabId = this._tabs[0]?.agentId ?? GENERAL_TAB_ID;
    }
    this._tabs = [...this._tabs];
  }

  private _useSuggestion(text: string) {
    const tab = this._getActiveTab();
    if (tab) {
      tab.input = text;
      this._tabs = [...this._tabs];
      this._send();
    }
  }

  private _renderSuggestions(agent: StaffMember) {
    const suggestions = this._getSuggestions(agent.id);
    return html`
      <div class="suggestions">
        ${suggestions.map(
          (s) => html`
            <button class="suggestion" @click=${() => this._useSuggestion(s.text)}>
              ${s.icon} ${s.label}
            </button>
          `
        )}
      </div>
    `;
  }

  private _getSuggestions(agentId: string): Array<{ icon: string; label: string; text: string }> {
    switch (agentId) {
      case "biologist":
        return [
          { icon: "\u{1F9EC}", label: "Analyze sequences", text: "Analyze the FASTA sequences in my data directory" },
          { icon: "\u{1F52C}", label: "RNA-seq pipeline", text: "Set up an RNA-seq differential expression analysis pipeline" },
          { icon: "\u{1F333}", label: "Phylogenetics", text: "Build a phylogenetic tree from aligned sequences" },
        ];
      case "medscientist":
        return [
          { icon: "\u{1F4C8}", label: "Survival analysis", text: "Run a Kaplan-Meier survival analysis on my clinical data" },
          { icon: "\u{1F3E5}", label: "Clinical trial", text: "Help me design a randomized controlled trial" },
          { icon: "\u{1F4CA}", label: "Meta-analysis", text: "Conduct a meta-analysis of treatment outcomes" },
        ];
      case "ai-researcher":
        return [
          { icon: "\u{1F4DD}", label: "Search arxiv", text: "Search arxiv for recent papers on protein language models" },
          { icon: "\u{1F916}", label: "Train model", text: "Set up a fine-tuning pipeline for a transformer model" },
          { icon: "\u{1F4CA}", label: "Benchmark", text: "Compare model performance across standard benchmarks" },
        ];
      case "data-analyst":
        return [
          { icon: "\u{1F4CA}", label: "Analyze data", text: "Run exploratory data analysis on my dataset" },
          { icon: "\u{1F4C8}", label: "Visualize", text: "Create publication-quality visualizations of my results" },
          { icon: "\u{1F9EE}", label: "Statistics", text: "Perform hypothesis testing with appropriate corrections" },
        ];
      case "cs-scientist":
        return [
          { icon: "\u{1F4BB}", label: "Algorithm", text: "Design an efficient algorithm for this problem" },
          { icon: "\u{1F50D}", label: "Code review", text: "Review my code for correctness and performance" },
          { icon: "\u{1F6E0}\u{FE0F}", label: "Architecture", text: "Help me design the system architecture" },
        ];
      default:
        return [
          { icon: "\u{1F4CA}", label: "Analyze data", text: "Analyze my latest experiment data" },
          { icon: "\u{1F50D}", label: "Search papers", text: "Search for recent papers on CRISPR delivery" },
          { icon: "\u{1F4DD}", label: "Write Methods", text: "Help me write the Methods section of my paper" },
          { icon: "\u{1F4C8}", label: "Create figure", text: "Create a publication-quality figure" },
        ];
    }
  }

  override render() {
    const activeTab = this._getActiveTab();

    if (this._tabs.length === 0) {
      return html`
        <div class="no-tabs-state">
          <span class="no-tabs-icon">\u{1F9EA}</span>
          <span class="no-tabs-text">No agents active</span>
          <span class="no-tabs-sub">
            Go to the Staff page and start a digital life to begin chatting.
            Each staff has its own persona, skills, and workspace.
          </span>
          <button class="btn-go-agents" @click=${() => { location.hash = "staff"; }}>
            Go to Staff
          </button>
        </div>
      `;
    }

    return html`
      <div class="header">
        <h1>Chat</h1>
      </div>

      <!-- Agent Tabs -->
      <div class="tabs-bar">
        ${this._tabs.map(
          (tab) => html`
            <button
              class="tab ${this._activeTabId === tab.agentId ? "active" : ""}"
              @click=${() => this._switchTab(tab.agentId)}
            >
              <span class="tab-icon">${tab.agent.icon}</span>
              <span class="tab-name">${tab.agent.name}</span>
              ${tab.sending ? html`<span class="tab-sending"></span>` : ""}
              ${tab.agentId !== GENERAL_TAB_ID
                ? html`<span
                    class="tab-close"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._closeTab(tab.agentId);
                    }}
                  >\u2715</span>`
                : ""}
            </button>
          `
        )}
      </div>

      <!-- Chat Area for Active Tab -->
      ${activeTab
        ? html`
            <div class="chat-container">
              <div class="messages">
                ${activeTab.messages.length === 0
                  ? html`
                      <div class="empty-state">
                        <span class="empty-icon">${activeTab.agent.icon}</span>
                        <span class="empty-text">
                          Chat with ${activeTab.agent.name}
                        </span>
                        <span class="empty-sub">
                          ${activeTab.agent.role} \u2014 ${activeTab.agent.description}
                        </span>
                        ${this._renderSuggestions(activeTab.agent)}
                      </div>
                    `
                  : activeTab.messages.map(
                      (m) => html`
                        <div class="message ${m.role}">
                          <div class="msg-header">
                            ${m.role === "user" ? "You" : activeTab.agent.name}
                            ${m.timestamp ? ` \u00B7 ${m.timestamp}` : ""}
                          </div>
                          <div class="msg-content">
                            ${m.content || (activeTab.sending ? "Thinking\u2026" : "")}
                          </div>
                        </div>
                      `
                    )}
              </div>

              <div class="input-area">
                <div class="input-agent-badge">
                  ${activeTab.agent.icon} ${activeTab.agent.name}
                </div>
                <textarea
                  placeholder="Ask ${activeTab.agent.name} anything\u2026"
                  .value=${activeTab.input}
                  @input=${this._handleInput}
                  @keydown=${this._handleKeyDown}
                  ?disabled=${activeTab.sending}
                ></textarea>
                <button
                  class="send-btn"
                  @click=${this._send}
                  ?disabled=${activeTab.sending || !activeTab.input.trim()}
                >
                  ${activeTab.sending ? "Sending\u2026" : "Send"}
                </button>
              </div>
            </div>
          `
        : ""}
    `;
  }
}
