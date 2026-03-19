import { LitElement, html, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { STAFF_MEMBERS, getCustomizedStaff } from "./staff.js";
import type { StaffMember } from "./staff.js";

/** macOS-style folder icon (inline SVG) */
const folderIcon = (size = 16) => svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none">
    <path d="M2 5.5C2 4.12 3.12 3 4.5 3H7.88c.53 0 1.04.21 1.41.59L10.5 4.8c.19.19.44.2.71.2H15.5C16.88 5 18 6.12 18 7.5V14.5C18 15.88 16.88 17 15.5 17H4.5C3.12 17 2 15.88 2 14.5V5.5Z" fill="#5AB0F2"/>
    <path d="M2 8.5C2 7.4 2.9 6.5 4 6.5H16C17.1 6.5 18 7.4 18 8.5V14.5C18 15.88 16.88 17 15.5 17H4.5C3.12 17 2 15.88 2 14.5V8.5Z" fill="#4AA3E8"/>
  </svg>
`;

/** macOS-style open folder icon */
const folderOpenIcon = (size = 16) => svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none">
    <path d="M2 5.5C2 4.12 3.12 3 4.5 3H7.88c.53 0 1.04.21 1.41.59L10.5 4.8c.19.19.44.2.71.2H15.5C16.88 5 18 6.12 18 7.5V14.5C18 15.88 16.88 17 15.5 17H4.5C3.12 17 2 15.88 2 14.5V5.5Z" fill="#5AB0F2"/>
    <path d="M1 9.5C1 8.67 1.67 8 2.5 8H15.5C16.88 8 18 9.12 18 10.5L17 15.5C16.8 16.4 16 17 15.1 17H4.5C3.12 17 2 15.88 2 14.5L1 9.5Z" fill="#4AA3E8"/>
  </svg>
`;

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

/** Default workspace root — matches config/openclaw-defaults.json */
const DEFAULT_WORKSPACE = "~/AcaClaw";

/** Resolve the known default workdir for a given agent ID */
function defaultWorkdirFor(agentId: string): string {
  if (agentId === GENERAL_TAB_ID) return DEFAULT_WORKSPACE;
  return `${DEFAULT_WORKSPACE}/agents/${agentId}`;
}

@customElement("acaclaw-chat")
export class ChatView extends LitElement {
  @state() private _tabs: AgentTab[] = [];
  @state() private _activeTabId = GENERAL_TAB_ID;
  @state() private _workdir = "";
  @state() private _showWorkdirDialog = false;
  @state() private _workdirInput = "";
  @state() private _dirBrowserPath: string[] = [];
  @state() private _dirBrowserEntries: Array<{ name: string; type: string }> = [];
  @state() private _dirBrowserLoading = false;
  @state() private _showNewProject = false;
  @state() private _newProjectName = "";
  @state() private _newProjectCreating = false;
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
      gap: 12px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Workdir Badge ── */
    .workdir-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      font-size: 13px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
      max-width: 280px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .workdir-badge:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-border);
      color: var(--ac-text-secondary);
    }
    .workdir-badge:hover .workdir-edit-icon {
      flex-shrink: 0;
      font-size: 11px;
      opacity: 0;
      transition: opacity 0.2s ease;
      color: var(--ac-primary);
    }

    /* ── Workdir Dialog ── */
    .workdir-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease;
    }
    .workdir-dialog {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      width: 520px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--ac-shadow-lg, 0 8px 24px rgba(0,0,0,0.12));
      animation: slideUp 0.2s ease;
      overflow: hidden;
    }
    .workdir-dialog-header {
      padding: 20px 24px 0;
    }
    .workdir-dialog h3 {
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 4px 0;
      color: var(--ac-text);
    }
    .workdir-dialog .dialog-sub {
      font-size: 13px;
      color: var(--ac-text-muted);
      margin-bottom: 0;
    }

    /* Breadcrumb nav inside dialog */
    .dir-breadcrumb {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 10px 24px;
      font-size: 12px;
      color: var(--ac-text-muted);
      border-bottom: 1px solid var(--ac-border);
      flex-wrap: wrap;
      background: var(--ac-bg-hover);
    }
    .dir-breadcrumb-seg {
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.1s;
      font-family: monospace;
      font-size: 12px;
    }
    .dir-breadcrumb-seg:hover {
      background: var(--ac-bg-surface);
      color: var(--ac-primary);
    }
    .dir-breadcrumb-sep {
      color: var(--ac-text-tertiary, #cbd5e1);
      font-size: 10px;
      user-select: none;
    }

    /* Directory listing */
    .dir-browser {
      flex: 1;
      overflow-y: auto;
      min-height: 180px;
      max-height: 340px;
    }
    .dir-browser-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      color: var(--ac-text-muted);
      font-size: 13px;
    }
    .dir-browser-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      color: var(--ac-text-muted);
      font-size: 13px;
    }
    .dir-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 24px;
      cursor: pointer;
      font-size: 13px;
      color: var(--ac-text-secondary);
      transition: background 0.1s;
      border-bottom: 1px solid var(--ac-border);
    }
    .dir-item:last-child {
      border-bottom: none;
    }
    .dir-item:hover {
      background: var(--ac-bg-hover);
      color: var(--ac-text);
    }
    .dir-item-icon {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
    }
    .dir-item-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dir-item-arrow {
      font-size: 10px;
      color: var(--ac-text-muted);
      opacity: 0;
      transition: opacity 0.1s;
    }
    .dir-item:hover .dir-item-arrow {
      opacity: 1;
    }

    /* Manual path input toggle */
    .dir-manual-toggle {
      padding: 8px 24px;
      border-top: 1px solid var(--ac-border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dir-manual-toggle input {
      flex: 1;
      padding: 7px 10px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 12px;
      font-family: monospace;
      background: var(--ac-bg);
      color: var(--ac-text);
      box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .dir-manual-toggle input:focus {
      outline: none;
      border-color: var(--ac-primary);
    }

    /* New Project — header-level button + popover */
    .new-project-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      background: var(--ac-bg-surface);
      color: var(--ac-text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .new-project-btn:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      background: var(--ac-bg-hover);
      box-shadow: 0 2px 6px rgba(14, 165, 233, 0.1);
      transform: translateY(-0.5px);
    }
    .new-project-popover {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 6px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      padding: 14px 16px;
      width: 340px;
      box-shadow: var(--ac-shadow-lg, 0 8px 24px rgba(0,0,0,0.12));
      z-index: 50;
      animation: slideUp 0.15s ease;
    }
    .new-project-popover-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--ac-text);
      margin-bottom: 8px;
    }
    .new-project-popover-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .new-project-popover-row input {
      flex: 1;
      padding: 7px 10px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg);
      color: var(--ac-text);
      box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .new-project-popover-row input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 2px rgba(90, 176, 242, 0.15);
    }
    .new-project-popover-row button {
      padding: 7px 14px;
      border-radius: var(--ac-radius-sm);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: var(--ac-primary);
      color: #fff;
      transition: opacity 0.1s;
      white-space: nowrap;
    }
    .new-project-popover-row button:hover {
      opacity: 0.85;
    }
    .new-project-popover-row button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .new-project-path-preview {
      margin-top: 8px;
      font-size: 11px;
      font-family: monospace;
      color: var(--ac-text-muted);
      word-break: break-all;
    }

    .workdir-dialog .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px;
      border-top: 1px solid var(--ac-border);
    }
    .dialog-btn {
      padding: 8px 16px;
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--ac-border);
      background: var(--ac-bg-surface);
      color: var(--ac-text-secondary);
      transition: all 0.15s;
    }
    .dialog-btn:hover {
      background: var(--ac-bg-hover);
      color: var(--ac-text);
    }
    .dialog-btn.primary {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
    }
    .dialog-btn.primary:hover {
      opacity: 0.9;
    }
    .dialog-btn.reset {
      margin-right: auto;
      color: var(--ac-text-muted);
      border-color: transparent;
      background: transparent;
    }
    .dialog-btn.reset:hover {
      color: var(--ac-text-secondary);
      background: var(--ac-bg-hover);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Agent Tabs ── */
    .tabs-bar {
      display: flex;
      gap: 8px;
      padding: 6px;
      background: var(--ac-bg-hover, #f1f5f9);
      border-radius: 16px;
      margin-bottom: 24px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14.5px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      background: transparent;
      border: none;
      transition: all 0.2s ease;
      white-space: nowrap;
      position: relative;
    }
    .tab:hover {
      background: rgba(255, 255, 255, 0.5);
      color: var(--ac-text);
    }
    .tab.active {
      background: var(--ac-bg-surface, #fff);
      color: var(--ac-primary, #0ea5e9);
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .tab-icon {
      font-size: 18px;
    }
    .tab-name {
      font-size: 14.5px;
    }
    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      font-size: 11px;
      color: var(--ac-text-muted);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      margin-left: 4px;
    }
    .tab.active .tab-close {
      color: var(--ac-primary, #0ea5e9);
      opacity: 0.7;
    }
    .tab-close:hover, .tab.active .tab-close:hover {
      background: rgba(0, 0, 0, 0.08);
      color: var(--ac-text);
      opacity: 1;
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
      gap: 16px;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.03);
    }

    .message {
      max-width: 72%;
      width: fit-content;
      margin-bottom: 28px;
      animation: msgIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .message.user {
      margin-left: auto;
      margin-right: 8px;
    }
    .message.assistant {
      margin-right: auto;
      margin-left: 8px;
      max-width: 80%;
    }

    .msg-header {
      font-size: 12px;
      color: var(--ac-text-muted);
      margin-bottom: 6px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .message.user .msg-header {
      text-align: right;
    }

    .msg-content {
      font-size: 15px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      text-align: left;
      display: block;
    }
    
    .message.user .msg-content {
      background: var(--ac-primary, #0ea5e9);
      color: #fff;
      padding: 14px 20px;
      border-radius: 18px;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);
    }

    .message.assistant .msg-content {
      background: var(--ac-bg-hover, #f8fafc);
      color: var(--ac-text);
      padding: 16px 22px;
      border-radius: 18px;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
      text-align: left;
    }

    /* ── Message avatar (assistant only) ── */
    .msg-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .msg-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--ac-bg-hover);
      border: 1px solid var(--ac-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
      margin-top: 2px;
      overflow: hidden;
    }
    .msg-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }
    .msg-body {
      flex: 1;
      min-width: 0;
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
      font-size: 20px;
      font-weight: 600;
      color: var(--ac-text-secondary);
    }
    .empty-sub {
      font-size: 15px;
      color: var(--ac-text-muted);
    }
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .suggestion {
      padding: 12px 20px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full, 9999px);
      cursor: pointer;
      font-size: 14.5px;
      color: var(--ac-text-secondary);
      font-weight: 500;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .suggestion:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-1px);
    }

    .input-area {
      display: flex;
      gap: 16px;
      padding: 16px 24px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: 24px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.06);
      align-items: flex-end;
    }

    .input-agent-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: var(--ac-bg-hover);
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      color: var(--ac-text-secondary);
      flex-shrink: 0;
      align-self: center;
    }

    .input-area textarea {
      flex: 1;
      resize: none;
      border: none;
      padding: 10px 0;
      font-size: 16px;
      line-height: 1.5;
      background: transparent;
      min-height: 44px;
      max-height: 200px;
      transition: all 0.2s ease;
      color: var(--ac-text);
      font-family: inherit;
    }
    .input-area textarea:focus {
      outline: none;
    }
    .input-area textarea::placeholder {
      color: var(--ac-text-tertiary, #94a3b8);
      font-size: 16px;
    }

    .send-btn {
      align-self: center;
      padding: 12px 28px;
      background: var(--ac-primary, #0ea5e9);
      color: #fff;
      border-radius: 14px;
      font-weight: 600;
      font-size: 15px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
      border: none;
      cursor: pointer;
    }
    .send-btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4);
    }
    .send-btn:disabled {
      opacity: 0.4;
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

    // Fetch the workdir for the active tab
    this._fetchWorkdir(this._activeTabId);
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

  /** Fetch the workdir from the gateway for a given agent tab */
  private async _fetchWorkdir(agentId: string) {
    // Set known default immediately so the badge is always visible
    this._workdir = defaultWorkdirFor(agentId);

    // Try to get the actual workdir (may include user overrides) from the gateway
    try {
      const res = await gateway.call<{ workdir?: string }>(
        "acaclaw.workspace.getWorkdir",
        { agentId: agentId === GENERAL_TAB_ID ? undefined : agentId },
      );
      if (res?.workdir) {
        this._workdir = res.workdir;
      }
    } catch {
      // Gateway method not available — keep the default
    }
  }

  /** Open the workdir change dialog and load directory listing */
  private _openWorkdirDialog() {
    this._workdirInput = this._workdir;
    this._showWorkdirDialog = true;
    // Parse current workdir into breadcrumb segments relative to workspace root
    this._dirBrowserPath = [];
    this._loadDirBrowser();
  }

  /** Close the workdir dialog without saving */
  private _closeWorkdirDialog() {
    this._showWorkdirDialog = false;
    this._workdirInput = "";
    this._dirBrowserPath = [];
    this._dirBrowserEntries = [];
    this._showNewProject = false;
    this._newProjectName = "";
  }

  /** Load directory listing for the current browser path */
  private async _loadDirBrowser() {
    this._dirBrowserLoading = true;
    const subPath = this._dirBrowserPath.join("/");
    try {
      const res = await gateway.call<{ files: Array<{ name: string; type: string }> }>(
        "acaclaw.workspace.list",
        { path: subPath || undefined },
      );
      if (res?.files) {
        // Show only directories, sorted alphabetically
        this._dirBrowserEntries = res.files
          .filter((f) => f.type === "dir")
          .sort((a, b) => a.name.localeCompare(b.name));
      } else {
        this._dirBrowserEntries = [];
      }
    } catch {
      this._dirBrowserEntries = [];
    }
    this._dirBrowserLoading = false;
  }

  /** Navigate into a subdirectory */
  private _dirBrowserOpen(dirName: string) {
    this._dirBrowserPath = [...this._dirBrowserPath, dirName];
    this._updateWorkdirInputFromBrowser();
    this._loadDirBrowser();
  }

  /** Navigate to a breadcrumb segment (0 = root) */
  private _dirBrowserNavigate(index: number) {
    this._dirBrowserPath = this._dirBrowserPath.slice(0, index);
    this._updateWorkdirInputFromBrowser();
    this._loadDirBrowser();
  }

  /** Sync the text input with the current browser path */
  private _updateWorkdirInputFromBrowser() {
    const base = DEFAULT_WORKSPACE;
    const sub = this._dirBrowserPath.join("/");
    this._workdirInput = sub ? `${base}/${sub}` : base;
  }

  /** Select the current browser path as the workdir */
  private _selectCurrentDir() {
    this._updateWorkdirInputFromBrowser();
    this._saveWorkdir();
  }

  /** Create a new project under ~/AcaClaw/Projects/<name> and select it */
  private async _createNewProject() {
    const name = this._newProjectName.trim();
    if (!name || this._newProjectCreating) return;

    this._newProjectCreating = true;
    try {
      await gateway.call("acaclaw.workspace.createFolder", {
        path: `Projects/${name}`,
      });
      // Navigate to Projects/<name> and select it
      this._dirBrowserPath = ["Projects", name];
      this._updateWorkdirInputFromBrowser();
      this._saveWorkdir();
    } catch {
      // Folder may already exist — try selecting it anyway
      this._dirBrowserPath = ["Projects", name];
      this._updateWorkdirInputFromBrowser();
      this._saveWorkdir();
    }
    this._newProjectCreating = false;
    this._showNewProject = false;
    this._newProjectName = "";
  }

  /** Start a new chat session on the current active tab */
  private _newChat() {
    const tab = this._getActiveTab();
    if (!tab) return;

    // Clear local messages and reset sending state
    tab.messages = [];
    tab.sending = false;
    tab.activeRunId = "";
    tab.input = "";
    this._tabs = [...this._tabs];
  }

  /** Save the new workdir via the gateway */
  private async _saveWorkdir() {
    const newPath = this._workdirInput.trim();
    if (!newPath) return;

    const agentId = this._activeTabId === GENERAL_TAB_ID ? "general" : this._activeTabId;
    try {
      await gateway.call("acaclaw.workspace.setWorkdir", {
        agentId,
        path: newPath,
      });
      this._workdir = newPath;
    } catch {
      // Failed to save — silent for now
    }
    this._showWorkdirDialog = false;
    this._workdirInput = "";
  }

  /** Reset workdir to default */
  private async _resetWorkdir() {
    const agentId = this._activeTabId === GENERAL_TAB_ID ? "general" : this._activeTabId;
    try {
      await gateway.call("acaclaw.workspace.setWorkdir", {
        agentId,
        path: null,
      });
      // Re-fetch to get the default
      await this._fetchWorkdir(this._activeTabId);
    } catch {
      // silent
    }
    this._showWorkdirDialog = false;
    this._workdirInput = "";
  }

  /** Public method to open (or switch to) an agent tab */
  openAgentTab(agentId: string) {
    const existing = this._tabs.find((t) => t.agentId === agentId);
    if (existing) {
      this._activeTabId = agentId;
      this._tabs = [...this._tabs];
      this._fetchWorkdir(agentId);
      return;
    }

    const agent = getCustomizedStaff().find((a) => a.id === agentId);
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
    this._fetchWorkdir(agentId);
  }

  private _createGeneralTab(): AgentTab {
    const defaultAgent = getCustomizedStaff().find((a) => a.id === "default") ?? {
      id: GENERAL_TAB_ID,
      icon: "\u{1F464}",
      name: "Aca",
      role: "General Assistant",
      discipline: "All",
      condaEnv: "aca",
      description: "Your personal research assistant",
      skills: [],
    };
    return {
      agentId: GENERAL_TAB_ID,
      agent: defaultAgent,
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
    this._fetchWorkdir(agentId);
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

  /** Shorten a path for display (replace home dir with ~) */
  private _shortenPath(path: string): string {
    // Replace /home/<user> with ~
    const home = path.match(/^\/home\/[^/]+/)?.[0];
    if (home) return path.replace(home, "~");
    return path;
  }

  private _renderWorkdirDialog() {
    const activeTab = this._getActiveTab();
    const agentName = activeTab?.agent.name ?? "General";
    const segments = this._dirBrowserPath;

    return html`
      <div class="workdir-overlay" @click=${(e: Event) => {
        if (e.target === e.currentTarget) this._closeWorkdirDialog();
      }}>
        <div class="workdir-dialog">
          <div class="workdir-dialog-header">
            <h3>Working Directory</h3>
            <div class="dialog-sub">
              Choose a workspace folder for ${agentName}
            </div>
          </div>

          <!-- Breadcrumb -->
          <div class="dir-breadcrumb">
            <span class="dir-breadcrumb-seg" @click=${() => this._dirBrowserNavigate(0)}>~/AcaClaw</span>
            ${segments.map(
              (seg, i) => html`
                <span class="dir-breadcrumb-sep">\u203A</span>
                <span class="dir-breadcrumb-seg" @click=${() => this._dirBrowserNavigate(i + 1)}>${seg}</span>
              `
            )}
          </div>

          <!-- Directory listing -->
          <div class="dir-browser">
            ${this._dirBrowserLoading
              ? html`<div class="dir-browser-loading">Loading\u2026</div>`
              : this._dirBrowserEntries.length === 0
                ? html`<div class="dir-browser-empty">No subdirectories</div>`
                : this._dirBrowserEntries.map(
                    (entry) => html`
                      <div class="dir-item" @click=${() => this._dirBrowserOpen(entry.name)}>
                        <span class="dir-item-icon">${folderOpenIcon(16)}</span>
                        <span class="dir-item-name">${entry.name}</span>
                        <span class="dir-item-arrow">\u203A</span>
                      </div>
                    `
                  )}
          </div>

          <!-- Manual path input -->
          <div class="dir-manual-toggle">
            <input
              type="text"
              .value=${this._workdirInput}
              @input=${(e: Event) => { this._workdirInput = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._saveWorkdir(); if (e.key === "Escape") this._closeWorkdirDialog(); }}
              placeholder="Or type a path manually\u2026"
            />
          </div>

          <div class="dialog-actions">
            <button class="dialog-btn reset" @click=${this._resetWorkdir}>Reset</button>
            <button class="dialog-btn" @click=${this._closeWorkdirDialog}>Cancel</button>
            <button class="dialog-btn primary" @click=${this._selectCurrentDir}>
              Select this folder
            </button>
          </div>
        </div>
      </div>
    `;
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
        <div class="header-right" style="position:relative">
          <div class="workdir-badge" @click=${this._openWorkdirDialog} title="Working directory: ${this._workdir} (click to change)">
            <span class="workdir-icon">${folderIcon(14)}</span>
            <span class="workdir-path">${this._shortenPath(this._workdir)}</span>
            <span class="workdir-edit-icon">\u270E</span>
          </div>
          <button class="new-project-btn" @click=${() => { this._showNewProject = !this._showNewProject; this._newProjectName = ""; }}>
            + Project
          </button>
          <button class="new-project-btn" @click=${this._newChat} title="Start a new chat session">
            + Chat
          </button>
          ${this._showNewProject ? html`
            <div class="new-project-popover">
              <div class="new-project-popover-label">New Project</div>
              <div class="new-project-popover-row">
                <input
                  type="text"
                  .value=${this._newProjectName}
                  @input=${(e: Event) => { this._newProjectName = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._createNewProject(); if (e.key === "Escape") { this._showNewProject = false; this._newProjectName = ""; } }}
                  placeholder="my-experiment"
                />
                <button @click=${this._createNewProject} ?disabled=${this._newProjectCreating || !this._newProjectName.trim()}>Create</button>
              </div>
              ${this._newProjectName.trim() ? html`
                <div class="new-project-path-preview">
                  ${this._shortenPath(DEFAULT_WORKSPACE)}/Projects/${this._newProjectName.trim()}
                </div>
              ` : ""}
            </div>
          ` : ""}
        </div>
      </div>

      ${this._showWorkdirDialog ? this._renderWorkdirDialog() : ""}

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
                      (m) => m.role === "assistant"
                        ? html`
                          <div class="message assistant">
                            <div class="msg-row">
                              <div class="msg-avatar">${activeTab.agent.photoUrl
                                ? html`<img src="${activeTab.agent.photoUrl}" alt="${activeTab.agent.name}" />`
                                : activeTab.agent.icon}</div>
                              <div class="msg-body">
                                <div class="msg-header">
                                  ${activeTab.agent.name}
                                  ${m.timestamp ? ` \u00B7 ${m.timestamp}` : ""}
                                </div>
                                <div class="msg-content">
                                  ${m.content || (activeTab.sending ? "Thinking\u2026" : "")}
                                </div>
                              </div>
                            </div>
                          </div>
                        `
                        : html`
                          <div class="message user">
                            <div class="msg-header">
                              You${m.timestamp ? ` \u00B7 ${m.timestamp}` : ""}
                            </div>
                            <div class="msg-content">${m.content}</div>
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
