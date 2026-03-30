import { LitElement, html, css, svg, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { gateway } from "../controllers/gateway.js";
import { STAFF_MEMBERS, getCustomizedStaff } from "./staff.js";
import type { StaffMember } from "./staff.js";
import { t, LocaleController } from "../i18n.js";
import { toMarkdownHtml } from "../chat/markdown.js";
import { isSttSupported, startStt, stopStt, isSttActive, speakText, stopTts, isTtsSpeaking } from "../chat/speech.js";
import { exportChatMarkdown } from "../chat/export.js";

/* ── Lucide-style SVG icons for quick-actions & UI (14×14) ── */
const qiBarChart = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`;
const qiSearch = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const qiPen = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const qiTrendUp = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
const qiDna = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="m17 6-2.5-2.5"/><path d="m14 8-1-1"/><path d="m7 18 2.5 2.5"/><path d="m3.5 14.5.5.5"/><path d="m20 9 .5.5"/><path d="m6.5 12.5 1 1"/><path d="m16.5 10.5 1 1"/><path d="m10 16 1.5 1.5"/></svg>`;
const qiMicroscope = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></svg>`;
const qiTree = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/><path d="m14 14-2 2"/></svg>`;
const qiHospital = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/></svg>`;
const qiBrain = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`;
const qiWrench = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/></svg>`;
const qiCode = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
const qiAbacus = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="5" y2="5"/><line x1="2" x2="22" y1="10" y2="10"/><line x1="2" x2="22" y1="15" y2="15"/><line x1="2" x2="22" y1="20" y2="20"/><circle cx="6" cy="5" r="1.5" fill="currentColor"/><circle cx="14" cy="5" r="1.5" fill="currentColor"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/><circle cx="18" cy="10" r="1.5" fill="currentColor"/><circle cx="8" cy="15" r="1.5" fill="currentColor"/><circle cx="16" cy="15" r="1.5" fill="currentColor"/><circle cx="6" cy="20" r="1.5" fill="currentColor"/><circle cx="14" cy="20" r="1.5" fill="currentColor"/></svg>`;
const qiFlask = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16.5h10"/></svg>`;
const qiPencilLine = html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`;
const qiFolderPlus = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
const qiMsgPlus = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v8"/><path d="M8 12h8"/><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const qiUser = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

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

interface ChatAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  thinking: string;
  timestamp: string;
  attachments?: ChatAttachment[];
}

interface AgentTab {
  agentId: string;
  agent: StaffMember;
  messages: Message[];
  sending: boolean;
  activeRunId: string;
  input: string;
  /** Unique id per chat session — rotated on "+ Chat" to start fresh */
  sessionId: string;
}

/** Default "general" tab for the main session (no specific agent) */
const GENERAL_TAB_ID = "general";

/** localStorage key for persisting chat tab state across page reloads */
const TABS_STORAGE_KEY = "acaclaw-chat-tabs";

/** localStorage key for session titles (keyed by session key) */
const SESSION_TITLES_KEY = "acaclaw-session-titles";

/** Save a session title for display in Monitor. Stores under UUID portion only. */
function saveSessionTitle(sessionKey: string, text: string, overwrite = false) {
  try {
    const raw = localStorage.getItem(SESSION_TITLES_KEY);
    const titles: Record<string, string> = raw ? JSON.parse(raw) : {};
    // Always key by UUID (last segment) so monitor can match gateway keys
    const parts = sessionKey.split(":");
    const uuid = parts[parts.length - 1];
    if (!overwrite && titles[uuid]) return; // already named
    titles[uuid] = text.slice(0, 60);
    localStorage.setItem(SESSION_TITLES_KEY, JSON.stringify(titles));
  } catch { /* ignore */ }
}

/** Default workspace root — matches config/openclaw-defaults.json */
const DEFAULT_WORKSPACE = "~/AcaClaw";

/** Resolve the known default workdir for a given agent ID */
function defaultWorkdirFor(agentId: string): string {
  if (agentId === GENERAL_TAB_ID) return DEFAULT_WORKSPACE;
  return `${DEFAULT_WORKSPACE}/agents/${agentId}`;
}

@customElement("acaclaw-chat")
export class ChatView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _tabs: AgentTab[] = [];
  @state() private _activeTabId = GENERAL_TAB_ID;
  @state() private _workdir = "";

  @state() private _availableModels: Array<{value: string; label: string}> = [];
  @state() private _selectedModel = "";
  @state() private _defaultModelDisplay = "";
  @state() private _attachments: ChatAttachment[] = [];
  @state() private _isRecording = false;
  @state() private _interimTranscript = "";
  @state() private _isSpeaking = false;
  @state() private _showWorkdirDialog = false;
  @state() private _workdirInput = "";
  @state() private _dirBrowserPath: string[] = [];
  @state() private _dirBrowserEntries: Array<{ name: string; type: string }> = [];
  @state() private _dirBrowserLoading = false;
  @state() private _showNewProject = false;
  @state() private _newProjectName = "";
  @state() private _newProjectCreating = false;
  private _cleanupChat: (() => void) | null = null;
  private _handleGatewayState: ((e: Event) => void) | null = null;
  /** Maps title-gen runId → original session UUID for pending LLM title requests. */
  private _titleGenRuns = new Map<string, string>();
  

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

    /* ── Markdown content ── */
    .msg-content :first-child { margin-top: 0; }
    .msg-content :last-child { margin-bottom: 0; }
    .msg-content p { margin: 0.5em 0; line-height: 1.65; }
    .msg-content h1, .msg-content h2, .msg-content h3, .msg-content h4 {
      margin: 1em 0 0.4em; font-weight: 700; line-height: 1.3;
    }
    .msg-content h1 { font-size: 1.3em; }
    .msg-content h2 { font-size: 1.15em; }
    .msg-content h3 { font-size: 1.05em; }
    .msg-content ul, .msg-content ol { margin: 0.4em 0; padding-left: 1.5em; }
    .msg-content li { margin: 0.2em 0; }
    .msg-content blockquote {
      margin: 0.5em 0; padding: 4px 12px;
      border-left: 3px solid var(--ac-border); color: var(--ac-text-secondary);
    }
    .msg-content hr { border: none; border-top: 1px solid var(--ac-border-subtle); margin: 1em 0; }
    .msg-content table { border-collapse: collapse; margin: 0.5em 0; font-size: 13px; }
    .msg-content th, .msg-content td {
      border: 1px solid var(--ac-border-subtle); padding: 6px 10px; text-align: left;
    }
    .msg-content th { background: var(--ac-bg-hover); font-weight: 600; }
    .msg-content a { color: var(--ac-primary); text-decoration: none; }
    .msg-content a:hover { text-decoration: underline; }
    .msg-content code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.88em; padding: 2px 5px;
      background: var(--ac-bg-hover); border-radius: 4px;
    }
    .msg-content pre { margin: 0; }
    .msg-content pre code {
      display: block; padding: 12px 16px; overflow-x: auto;
      background: none; border-radius: 0;
    }
    .msg-content .code-wrapper {
      border-radius: 10px; overflow: hidden;
      background: #1e293b; color: #e2e8f0;
      margin: 0.5em 0;
      border: 1px solid var(--ac-border-subtle);
    }
    .msg-content .code-wrapper pre code {
      color: #e2e8f0;
    }
    .msg-content .code-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 12px; background: rgba(0,0,0,0.15);
      font-size: 11px; color: #94a3b8;
    }
    .msg-content .code-copy {
      background: none; border: 1px solid var(--ac-border-subtle);
      border-radius: 4px; padding: 2px 8px; font-size: 11px;
      color: var(--ac-text-muted); cursor: pointer; font-family: inherit;
    }
    .msg-content .code-copy:hover { color: var(--ac-text); background: var(--ac-bg-hover); }
    .msg-content .copy-done { display: none; }
    .msg-content .code-copy.copied .copy-idle { display: none; }
    .msg-content .code-copy.copied .copy-done { display: inline; }
    .msg-content .md-inline-image { max-width: 300px; border-radius: 8px; margin: 4px 0; }

    /* ── Attachment preview ── */
    .attachment-row {
      display: flex; gap: 8px; padding: 8px 0; flex-wrap: wrap;
    }
    .attachment-thumb {
      position: relative; width: 64px; height: 64px; border-radius: 8px;
      overflow: hidden; border: 1px solid var(--ac-border-subtle);
    }
    .attachment-thumb img {
      width: 100%; height: 100%; object-fit: cover;
    }
    .attachment-remove {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--ac-error, #ef4444); color: #fff;
      border: none; cursor: pointer; font-size: 11px;
      display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .msg-attachments {
      display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;
    }
    .msg-attachments img {
      max-width: 200px; max-height: 150px; border-radius: 8px;
      border: 1px solid var(--ac-border-subtle);
    }

    /* ── Input toolbar actions ── */
    .input-actions {
      display: flex; align-items: center; gap: 4px;
    }
    .input-actions button {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 8px;
      background: transparent; border: none;
      color: var(--ac-text-muted); cursor: pointer;
      transition: all 0.15s;
    }
    .input-actions button:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .input-actions button.active { color: var(--ac-error, #ef4444); }
    .input-actions button svg { pointer-events: none; }
    .input-actions .separator {
      width: 1px; height: 18px; background: var(--ac-border-subtle); margin: 0 2px;
    }
    .interim-text {
      font-size: 12px; color: var(--ac-text-muted); font-style: italic;
      padding: 4px 0; max-height: 20px; overflow: hidden;
    }

    /* ── Chat header actions ── */
    .chat-actions {
      display: flex; align-items: center; gap: 4px;
    }
    .chat-actions button {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 8px;
      background: transparent; border: 1px solid var(--ac-border-subtle);
      color: var(--ac-text-secondary); cursor: pointer;
      font-size: 12px; font-weight: 500; font-family: inherit;
      transition: all 0.15s;
    }
    .chat-actions button:hover {
      background: var(--ac-bg-hover); color: var(--ac-text); border-color: var(--ac-border);
    }
    .chat-actions button svg { pointer-events: none; }
    .stop-btn {
      background: var(--ac-error, #ef4444) !important;
      color: #fff !important; border-color: transparent !important;
    }
    .stop-btn:hover { opacity: 0.9; }

    /* ── Reading/Thinking indicator dots ── */
    .reading-indicator {
      display: inline-flex; align-items: center; gap: 4px; height: 14px;
      padding: 4px 0;
    }
    .reading-indicator > span {
      display: inline-block; width: 6px; height: 6px;
      border-radius: 50%; background: var(--ac-text-muted, #94a3b8);
      opacity: 0.4; transform: translateY(0);
      animation: readingDot 1.2s ease-in-out infinite;
      will-change: transform, opacity;
    }
    .reading-indicator > span:nth-child(2) { animation-delay: 0.15s; }
    .reading-indicator > span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes readingDot {
      0%, 80%, 100% { opacity: 0.4; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .reading-indicator > span { animation: none; opacity: 0.6; }
    }

    /* Streaming pulse on assistant bubble border */
    .message.assistant.streaming .msg-bubble {
      animation: streamPulse 1.5s ease-in-out infinite;
    }
    @keyframes streamPulse {
      0%, 100% { border-color: var(--ac-border-subtle, rgba(255,255,255,0.08)); }
      50% { border-color: var(--ac-primary, #8b5cf6); }
    }
    @media (prefers-reduced-motion: reduce) {
      .message.assistant.streaming .msg-bubble {
        animation: none; border-color: var(--ac-primary, #8b5cf6);
      }
    }

    .new-session-inline {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border-subtle);
      color: var(--ac-text-secondary); cursor: pointer;
      transition: all 0.15s; flex-shrink: 0;
    }
    .new-session-inline:hover {
      background: var(--ac-primary); color: #fff;
      border-color: var(--ac-primary);
      transform: translateY(-1px);
    }
    .new-session-inline svg { pointer-events: none; }

    /* ── Message action buttons (speak/copy) ── */
    .msg-actions {
      display: flex; gap: 2px; margin-top: 4px; opacity: 0;
      transition: opacity 0.15s;
    }
    .message:hover .msg-actions { opacity: 1; }
    .msg-action-btn {
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 6px;
      background: transparent; border: none;
      color: var(--ac-text-muted); cursor: pointer; font-size: 0;
    }
    .msg-action-btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .msg-action-btn svg { pointer-events: none; }

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
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
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

    .msg-thinking {
      margin-bottom: 8px;
      border-radius: 12px;
      background: rgba(14, 165, 233, 0.04);
      border: 1px solid rgba(14, 165, 233, 0.12);
      overflow: hidden;
    }
    .msg-thinking summary {
      cursor: pointer;
      padding: 8px 14px;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--ac-text-muted, #94a3b8);
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      list-style: none;
    }
    .msg-thinking summary::-webkit-details-marker { display: none; }
    .msg-thinking summary:hover {
      color: var(--ac-text-secondary, #64748b);
    }
    .msg-thinking .thinking-chevron {
      display: inline-flex;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .msg-thinking[open] .thinking-chevron {
      transform: rotate(90deg);
    }
    .msg-thinking-body {
      padding: 6px 14px 12px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--ac-text-secondary, #64748b);
      white-space: pre-wrap;
      word-break: break-word;
      border-top: 1px solid rgba(14, 165, 233, 0.08);
      max-height: 300px;
      overflow-y: auto;
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
    .suggestion svg {
      flex-shrink: 0;
    }
    .suggestion:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-1px);
    }

    .input-area {
      display: flex;
      flex-direction: column;
      padding: 16px 24px 12px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: 24px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    }
    .input-top-row {
      display: flex;
      gap: 16px;
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

    .input-bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      border-top: 1px solid var(--ac-border-subtle);
      margin-top: 8px;
    }

    .send-btn {
      padding: 10px 24px;
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
    .input-model-select {
      padding: 4px 8px; font-size: 12px; font-weight: 500;
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius); color: var(--ac-text-muted); font-family: inherit;
      max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      cursor: pointer; appearance: none; -webkit-appearance: none;
      padding-right: 20px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 6px center;
    }
    .input-model-select:hover {
      border-color: var(--ac-border);
      color: var(--ac-text);
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
      display: flex;
      justify-content: center;
      opacity: 0.4;
      color: var(--ac-text-muted);
    }
    .no-tabs-icon svg {
      width: 48px;
      height: 48px;
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

    // Restore tabs from localStorage, or create default general tab
    if (this._tabs.length === 0) {
      const restored = this._restoreTabs();
      this._tabs = restored.tabs;
      this._activeTabId = restored.activeTabId;
      this._persistTabs();
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

    

    // Reload history when gateway (re)connects — covers the case where
    // connectedCallback fires before the WebSocket is established.
    this._handleGatewayState = ((e: CustomEvent) => {
      if (e.detail?.state === "connected") {
        this._loadHistory(this._activeTabId);
        this._loadModels();
      }
    }) as EventListener;
    gateway.addEventListener("state-change", this._handleGatewayState);

    // Fetch the workdir for the active tab
    this._fetchWorkdir(this._activeTabId);

    // Load available models for the model selector
    this._loadModels();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("open-agent-chat", this._handleOpenAgent as EventListener);
    if (this._handleGatewayState) {
      gateway.removeEventListener("state-change", this._handleGatewayState);
      this._handleGatewayState = null;
    }
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

    // Rotate sessionId so the server treats this as a brand-new conversation
    tab.sessionId = crypto.randomUUID();
    tab.messages = [];
    tab.sending = false;
    tab.activeRunId = "";
    tab.input = "";
    this._tabs = [...this._tabs];
    this._persistTabs();
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
      sessionId: crypto.randomUUID(),
    };

    this._tabs = [...this._tabs, newTab];
    this._activeTabId = agentId;
    this._persistTabs();
    this._loadHistory(agentId);
    this._fetchWorkdir(agentId);
  }

  /** Persist lightweight tab metadata so sessions survive full page reloads */
  private _persistTabs() {
    try {
      const data = {
        tabs: this._tabs.map((t) => ({ agentId: t.agentId, sessionId: t.sessionId })),
        activeTabId: this._activeTabId,
      };
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(data));
    } catch { /* storage full / unavailable */ }
  }

  /**
   * Public method to load a specific session by its gateway session key.
   * Called from Monitor view when clicking "Load" on a session row.
   */
  loadSession(sessionKey: string) {
    let agentId: string;
    let sessionId: string;

    if (sessionKey.startsWith("agent:")) {
      // Gateway returns "agent:<agentId>:<sessionId>" (no :web:)
      // Chat locally creates "agent:<agentId>:web:<sessionId>"
      const parts = sessionKey.split(":");
      agentId = parts[1] ?? GENERAL_TAB_ID;
      if (parts[2] === "web") {
        sessionId = parts.slice(3).join(":");
      } else {
        sessionId = parts.slice(2).join(":");
      }
    } else {
      // General session — the key itself is the sessionId
      agentId = GENERAL_TAB_ID;
      sessionId = sessionKey;
    }

    if (!sessionId) return;

    const existing = this._tabs.find((t) => t.agentId === agentId);
    if (existing) {
      // Switch to existing tab and replace its sessionId to load the target session
      existing.sessionId = sessionId;
      existing.messages = [];
      existing.sending = false;
      existing.activeRunId = "";
      this._activeTabId = agentId;
      this._tabs = [...this._tabs];
    } else if (agentId === GENERAL_TAB_ID) {
      // Replace the general tab's sessionId
      const general = this._tabs.find((t) => t.agentId === GENERAL_TAB_ID);
      if (general) {
        general.sessionId = sessionId;
        general.messages = [];
        general.sending = false;
        general.activeRunId = "";
        this._activeTabId = GENERAL_TAB_ID;
        this._tabs = [...this._tabs];
      }
    } else {
      // Create a new agent tab with the target sessionId
      const agent = getCustomizedStaff().find((a) => a.id === agentId);
      if (!agent) return;
      const newTab: AgentTab = {
        agentId,
        agent,
        messages: [],
        sending: false,
        activeRunId: "",
        input: "",
        sessionId,
      };
      this._tabs = [...this._tabs, newTab];
      this._activeTabId = agentId;
    }

    this._persistTabs();
    this._loadHistory(agentId, sessionKey);
    this._fetchWorkdir(agentId);
  }

  /** Restore tab list from localStorage; falls back to a fresh general tab */
  private _restoreTabs(): { tabs: AgentTab[]; activeTabId: string } {
    try {
      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          tabs?: Array<{ agentId: string; sessionId: string }>;
          activeTabId?: string;
        };
        if (data.tabs?.length) {
          const staff = getCustomizedStaff();
          const tabs: AgentTab[] = [];
          for (const saved of data.tabs) {
            const agent =
              saved.agentId === GENERAL_TAB_ID
                ? staff.find((a) => a.id === "default") ?? {
                    id: GENERAL_TAB_ID,
                    icon: "\u{1F469}\u{200D}\u{1F52C}",
                    name: "Aca",
                    role: "General Assistant",
                    discipline: "All",
                    condaEnv: "aca",
                    description: "Your personal research assistant",
                    skills: [],
                  }
                : staff.find((a) => a.id === saved.agentId);
            if (!agent) continue;
            tabs.push({
              agentId: saved.agentId,
              agent,
              messages: [],
              sending: false,
              activeRunId: "",
              input: "",
              sessionId: saved.sessionId,
            });
          }
          if (tabs.length) {
            const activeTabId =
              data.activeTabId && tabs.some((t) => t.agentId === data.activeTabId)
                ? data.activeTabId
                : tabs[0].agentId;
            return { tabs, activeTabId };
          }
        }
      }
    } catch { /* corrupted data — ignore */ }
    return { tabs: [this._createGeneralTab()], activeTabId: GENERAL_TAB_ID };
  }

  private _createGeneralTab(): AgentTab {
    const defaultAgent = getCustomizedStaff().find((a) => a.id === "default") ?? {
      id: GENERAL_TAB_ID,
      icon: "\u{1F469}\u{200D}\u{1F52C}",
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
      sessionId: crypto.randomUUID(),
    };
  }

  private _getSessionKey(agentId: string): string {
    const tab = this._tabs.find((t) => t.agentId === agentId);
    const sid = tab?.sessionId ?? "main";
    if (agentId === GENERAL_TAB_ID) return `agent:main:web:${sid}`;
    return `agent:${agentId}:web:${sid}`;
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

    // Handle title-generation run completions
    if (d.runId && this._titleGenRuns.has(d.runId)) {
      if (d.state === "final" && d.message) {
        const title = d.message.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
          .trim()
          .replace(/^["']|["']$/g, "") // strip surrounding quotes
          .slice(0, 60);
        if (title) {
          const uuid = this._titleGenRuns.get(d.runId)!;
          saveSessionTitle(uuid, title, true);
        }
      }
      if (d.state === "final" || d.state === "error") {
        this._titleGenRuns.delete(d.runId);
      }
      return;
    }

    // Find the tab this event belongs to (by runId match)
    const tab = this._tabs.find((t) => t.activeRunId && t.activeRunId === d.runId);
    if (!tab) return;

    if (d.state === "delta" && d.message) {
      const text = d.message.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      const thinking = d.message.content
        ?.filter((c) => c.type === "thinking")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      if ((text || thinking) && tab.messages.length > 0) {
        const last = tab.messages[tab.messages.length - 1];
        if (last.role === "assistant") {
          if (text) last.content = text;
          if (thinking) last.thinking = thinking;
          last.timestamp = new Date().toLocaleTimeString();
        }
      }
    } else if (d.state === "final" && d.message) {
      const text = d.message.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      const thinking = d.message.content
        ?.filter((c) => c.type === "thinking")
        .map((c) => c.text ?? "")
        .join("") ?? "";
      if (tab.messages.length > 0) {
        const last = tab.messages[tab.messages.length - 1];
        if (last.role === "assistant") {
          if (text) last.content = text;
          if (thinking) last.thinking = thinking;
          last.timestamp = new Date().toLocaleTimeString();
        }
      }
      tab.sending = false;
      tab.activeRunId = "";

      // Generate LLM title after first exchange (1 user + 1 assistant = 2 messages)
      const userMsgs = tab.messages.filter((m) => m.role === "user");
      if (userMsgs.length === 1) {
        const sessionKey = this._getSessionKey(tab.agentId);
        const parts = sessionKey.split(":");
        const uuid = parts[parts.length - 1];
        this._generateTitle(uuid, userMsgs[0].content);
      }
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

  private async _loadHistory(agentId: string, overrideKey?: string) {
    const tab = this._tabs.find((t) => t.agentId === agentId);
    const snapshotSessionId = tab?.sessionId;
    const sessionKey = overrideKey ?? this._getSessionKey(agentId);
    try {
      const res = await gateway.call<{
        messages?: Array<{
          role?: string;
          content?: string | Array<{ type?: string; text?: string }>;
        }>;
      }>("chat.history", { sessionKey, limit: 100 });
      if (res?.messages) {
        // Guard: if sessionId rotated while the request was in flight, discard stale result
        const current = this._tabs.find((t) => t.agentId === agentId);
        if (!current || current.sessionId !== snapshotSessionId) return;
        if (current) {
          current.messages = res.messages
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
              let thinking = "";
              if (Array.isArray(m.content)) {
                thinking = m.content
                  .filter((c) => c.type === "thinking")
                  .map((c) => c.text ?? "")
                  .join("");
              }
              return { role: m.role as "user" | "assistant", content: text, thinking, timestamp: "" };
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

    // Save session title from the first user message
    const isFirstMessage = !tab.messages.some((m) => m.role === "user");
    if (isFirstMessage) {
      saveSessionTitle(this._getSessionKey(tab.agentId), text);
    }

    const currentAttachments = [...this._attachments];
    this._attachments = [];

    tab.messages = [
      ...tab.messages,
      { role: "user", content: text, thinking: "", timestamp: new Date().toLocaleTimeString(), attachments: currentAttachments.length > 0 ? currentAttachments : undefined },
      { role: "assistant", content: "", thinking: "", timestamp: "" },
    ];
    tab.input = "";
    tab.sending = true;
    this._tabs = [...this._tabs];

    try {
      const sessionKey = this._getSessionKey(tab.agentId);
      const idempotencyKey = crypto.randomUUID();
      const apiAttachments = currentAttachments.map((a) => {
        const base64 = a.dataUrl.split(",")[1] ?? "";
        return { type: "image" as const, mimeType: a.mimeType, content: base64 };
      });
      const res = await gateway.call<{ runId?: string }>("chat.send", {
        sessionKey,
        message: text,
        idempotencyKey,
        ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
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

  /** Fire off a lightweight LLM call to generate a session title. */
  private async _generateTitle(sessionUuid: string, userMessage: string) {
    try {
      const titleSessionKey = `title-gen:${crypto.randomUUID()}`;
      const res = await gateway.call<{ runId?: string }>("chat.send", {
        sessionKey: titleSessionKey,
        message: `Summarize the following user request as a short title (3-6 words, no quotes, no punctuation at end):\n\n"${userMessage}"`,
        idempotencyKey: crypto.randomUUID(),
      });
      if (res?.runId) {
        this._titleGenRuns.set(res.runId, sessionUuid);
      }
    } catch { /* title generation is best-effort */ }
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
    this._selectedModel = "";
    this._tabs = [...this._tabs];
    this._persistTabs();
    this._fetchWorkdir(agentId);
  }

  private _closeTab(agentId: string) {
    if (agentId === GENERAL_TAB_ID) return; // Don't close general tab
    this._tabs = this._tabs.filter((t) => t.agentId !== agentId);
    if (this._activeTabId === agentId) {
      this._activeTabId = this._tabs[0]?.agentId ?? GENERAL_TAB_ID;
    }
    this._tabs = [...this._tabs];
    this._persistTabs();
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
            <h3>${t("chat.workdir")}</h3>
            <div class="dialog-sub">
              ${t("chat.workdir.choose", agentName)}
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
              ? html`<div class="dir-browser-loading">${t("chat.workdir.loading")}</div>`
              : this._dirBrowserEntries.length === 0
                ? html`<div class="dir-browser-empty">${t("chat.workdir.noSubs")}</div>`
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
              placeholder=${t("chat.workdir.typePath")}
            />
          </div>

          <div class="dialog-actions">
            <button class="dialog-btn reset" @click=${this._resetWorkdir}>${t("chat.workdir.reset")}</button>
            <button class="dialog-btn" @click=${this._closeWorkdirDialog}>${t("settings.uninstall.cancel")}</button>
            <button class="dialog-btn primary" @click=${this._selectCurrentDir}>
              ${t("chat.workdir.select")}
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

  private _getSuggestions(agentId: string): Array<{ icon: TemplateResult; label: string; text: string }> {
    switch (agentId) {
      case "biologist":
        return [
          { icon: qiDna, label: t("chat.quick.analyzeSeq"), text: t("chat.quick.analyzeSeq.text") },
          { icon: qiMicroscope, label: t("chat.quick.rnaSeq"), text: t("chat.quick.rnaSeq.text") },
          { icon: qiTree, label: t("chat.quick.phylogenetics"), text: t("chat.quick.phylogenetics.text") },
        ];
      case "medscientist":
        return [
          { icon: qiTrendUp, label: t("chat.quick.survival"), text: t("chat.quick.survival.text") },
          { icon: qiHospital, label: t("chat.quick.clinicalTrial"), text: t("chat.quick.clinicalTrial.text") },
          { icon: qiBarChart, label: t("chat.quick.metaAnalysis"), text: t("chat.quick.metaAnalysis.text") },
        ];
      case "ai-researcher":
        return [
          { icon: qiPen, label: t("chat.quick.searchArxiv"), text: t("chat.quick.searchArxiv.text") },
          { icon: qiBrain, label: t("chat.quick.trainModel"), text: t("chat.quick.trainModel.text") },
          { icon: qiBarChart, label: t("chat.quick.benchmark"), text: t("chat.quick.benchmark.text") },
        ];
      case "data-analyst":
        return [
          { icon: qiBarChart, label: t("chat.quick.eda"), text: t("chat.quick.eda.text") },
          { icon: qiTrendUp, label: t("chat.quick.visualize"), text: t("chat.quick.visualize.text") },
          { icon: qiAbacus, label: t("chat.quick.statistics"), text: t("chat.quick.statistics.text") },
        ];
      case "cs-scientist":
        return [
          { icon: qiCode, label: t("chat.quick.algorithm"), text: t("chat.quick.algorithm.text") },
          { icon: qiSearch, label: t("chat.quick.codeReview"), text: t("chat.quick.codeReview.text") },
          { icon: qiWrench, label: t("chat.quick.architecture"), text: t("chat.quick.architecture.text") },
        ];
      default:
        return [
          { icon: qiBarChart, label: t("chat.quick.analyzeData"), text: t("chat.quick.analyzeData.text") },
          { icon: qiSearch, label: t("chat.quick.searchPapers"), text: t("chat.quick.searchPapers.text") },
          { icon: qiPen, label: t("chat.quick.writeMethods"), text: t("chat.quick.writeMethods.text") },
          { icon: qiTrendUp, label: t("chat.quick.createFigure"), text: t("chat.quick.createFigure.text") },
        ];
    }
  }

  override render() {
    const activeTab = this._getActiveTab();

    if (this._tabs.length === 0) {
      return html`
        <div class="no-tabs-state">
          <span class="no-tabs-icon">${qiFlask}</span>
          <span class="no-tabs-text">${t("chat.noAgents")}</span>
          <span class="no-tabs-sub">
            ${t("chat.noAgents.desc")}
          </span>
          <button class="btn-go-agents" @click=${() => { location.hash = "staff"; }}>
            ${t("chat.goToStaff")}
          </button>
        </div>
      `;
    }

    return html`
      <div class="header">
        <h1>${t("chat.title")}</h1>
        <div class="header-right" style="position:relative">
          <div class="workdir-badge" @click=${this._openWorkdirDialog} title=${t("chat.workdir.tooltip", this._workdir)}>
            <span class="workdir-icon">${folderIcon(14)}</span>
            <span class="workdir-path">${this._shortenPath(this._workdir)}</span>
            <span class="workdir-edit-icon">${qiPencilLine}</span>
          </div>
          <button class="new-project-btn" @click=${() => { this._showNewProject = !this._showNewProject; this._newProjectName = ""; }}>
            ${qiFolderPlus} ${t("chat.project")}
          </button>
          <button class="new-project-btn" @click=${this._newChat} title=${t("chat.newChat.title")}>
            ${qiMsgPlus} ${t("chat.newChat")}
          </button>
          <button class="new-project-btn" @click=${this._exportChat} title="${t("chat.export")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            ${t("chat.export")}
          </button>
          ${this._showNewProject ? html`
            <div class="new-project-popover">
              <div class="new-project-popover-label">${t("workspace.dialog.newProject")}</div>
              <div class="new-project-popover-row">
                <input
                  type="text"
                  .value=${this._newProjectName}
                  @input=${(e: Event) => { this._newProjectName = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._createNewProject(); if (e.key === "Escape") { this._showNewProject = false; this._newProjectName = ""; } }}
                  placeholder="my-experiment"
                />
                <button @click=${this._createNewProject} ?disabled=${this._newProjectCreating || !this._newProjectName.trim()}>${t("env.create")}</button>
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
              <span class="tab-icon">${tab.agent.photoUrl ? html`<img src="${tab.agent.photoUrl}" style="width:26px;height:26px;border-radius:6px" />` : tab.agent.icon}</span>
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
                        <span class="empty-icon">${activeTab.agent.photoUrl ? html`<img src="${activeTab.agent.photoUrl}" style="width:56px;height:56px;border-radius:14px" />` : activeTab.agent.icon}</span>
                        <span class="empty-text">
                          ${t("chat.chatWith", activeTab.agent.name)}
                        </span>
                        <span class="empty-sub">
                          ${t("staff.role." + activeTab.agent.id) || activeTab.agent.role} \u2014 ${t("staff.desc." + activeTab.agent.id) || activeTab.agent.description}
                        </span>
                        ${this._renderSuggestions(activeTab.agent)}
                      </div>
                    `
                  : activeTab.messages.map(
                      (m, idx) => {
                        const isLastAssistant = activeTab.sending && idx === activeTab.messages.length - 1 && m.role === "assistant";
                        return m.role === "assistant"
                        ? html`
                          <div class="message assistant${isLastAssistant ? " streaming" : ""}">
                            <div class="msg-row">
                              <div class="msg-avatar">${activeTab.agent.photoUrl
                                ? html`<img src="${activeTab.agent.photoUrl}" alt="${activeTab.agent.name}" />`
                                : activeTab.agent.icon}</div>
                              <div class="msg-body">
                                <div class="msg-header">
                                  ${activeTab.agent.name}
                                  ${m.timestamp ? ` \u00B7 ${m.timestamp}` : ""}
                                </div>
                                ${m.thinking
                                  ? html`<details class="msg-thinking" open>
                                      <summary>
                                        <span class="thinking-chevron">
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                        </span>
                                        ${t("chat.reasoning")}
                                      </summary>
                                      <div class="msg-thinking-body">${m.thinking}</div>
                                    </details>`
                                  : ""}
                                <div class="msg-content" @click=${this._handleContentClick}>
                                  ${m.content
                                    ? unsafeHTML(toMarkdownHtml(m.content))
                                    : (activeTab.sending
                                      ? html`<span class="reading-indicator"><span></span><span></span><span></span></span>`
                                      : "")}
                                </div>
                                ${m.content ? html`
                                  <div class="msg-actions">
                                    <button class="msg-action-btn" title="${t("chat.copy")}" @click=${() => this._copyMessage(m.content)}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                    </button>
                                    <button class="msg-action-btn" title="${t("chat.speak")}" @click=${() => this._speakMessage(m.content)}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                    </button>
                                  </div>
                                ` : ""}
                              </div>
                            </div>
                          </div>
                        `
                        : html`
                          <div class="message user">
                            <div class="msg-header">
                              ${t("chat.you")}${m.timestamp ? ` \u00B7 ${m.timestamp}` : ""}
                            </div>
                            ${m.attachments?.length ? html`
                              <div class="msg-attachments">
                                ${m.attachments.map((a) => html`<img src="${a.dataUrl}" alt="attachment" />`)}
                              </div>
                            ` : ""}
                            <div class="msg-content">${unsafeHTML(toMarkdownHtml(m.content))}</div>
                          </div>
                        `;
                      }
                    )}
              </div>

              <div class="input-area" @dragover=${this._onDragOver} @drop=${this._onDrop} @paste=${this._onPaste}>
                ${this._attachments.length > 0 ? html`
                  <div class="attachment-row">
                    ${this._attachments.map((a) => html`
                      <div class="attachment-thumb">
                        <img src="${a.dataUrl}" alt="attachment" />
                        <button class="attachment-remove" @click=${() => this._removeAttachment(a.id)}>\u00d7</button>
                      </div>
                    `)}
                  </div>
                ` : ""}
                ${this._interimTranscript ? html`<div class="interim-text">${this._interimTranscript}</div>` : ""}
                <div class="input-top-row">
                  <div class="input-agent-badge">
                    ${activeTab.agent.photoUrl ? html`<img src="${activeTab.agent.photoUrl}" style="width:22px;height:22px;border-radius:5px" />` : activeTab.agent.icon} ${activeTab.agent.name}
                  </div>
                  <textarea
                    placeholder=${t("chat.askAnything", activeTab.agent.name)}
                    .value=${activeTab.input}
                    @input=${this._handleInput}
                    @keydown=${this._handleKeyDown}
                    ?disabled=${activeTab.sending}
                  ></textarea>
                </div>
                <div class="input-bottom-row">
                  <div style="display:flex;align-items:center;gap:6px">
                    <select class="input-model-select"
                      .value=${this._selectedModel}
                      @change=${this._onModelChange}>
                      <option value="">${this._defaultModelDisplay ? `Default (${this._defaultModelDisplay})` : t("chat.defaultModel")}</option>
                      ${this._availableModels.map(m => html`
                        <option value=${m.value} ?selected=${this._selectedModel === m.value}>${m.label}</option>
                      `)}
                    </select>
                    <div class="input-actions">
                      <input type="file" accept="image/*" multiple style="display:none" @change=${this._onFileSelect} />
                      <button title="${t("chat.attach")}" @click=${this._triggerFileInput}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </button>
                      ${isSttSupported() ? html`
                        <button title="${t("chat.voice")}" class="${this._isRecording ? "active" : ""}" @click=${this._toggleVoice}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        </button>
                      ` : ""}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px">
                    ${activeTab.sending
                      ? html`<button class="send-btn stop-btn" @click=${this._stopGeneration}>${t("chat.stop")}</button>`
                      : html`<button class="send-btn" @click=${this._send} ?disabled=${!activeTab.input.trim() && this._attachments.length === 0}>${t("chat.send")}</button>`
                    }
                    <button class="new-session-inline" title="${t("chat.newChat.title")}" @click=${this._newChat}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `
        : ""}
    `;
  }

  // ── File attachments ──

  private _triggerFileInput() {
    const input = this.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  private _onFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this._addImageFiles(Array.from(files));
    (e.target as HTMLInputElement).value = "";
  }

  private _onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private _onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files ?? []);
    this._addImageFiles(files.filter((f) => f.type.startsWith("image/")));
  }

  private _onPaste(e: ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (imageFiles.length > 0) {
      e.preventDefault();
      this._addImageFiles(imageFiles);
    }
  }

  private _addImageFiles(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        this._attachments = [...this._attachments, {
          id: crypto.randomUUID(),
          dataUrl: reader.result as string,
          mimeType: file.type,
        }];
      };
      reader.readAsDataURL(file);
    }
  }

  private _removeAttachment(id: string) {
    this._attachments = this._attachments.filter((a) => a.id !== id);
  }

  // ── Voice ──

  private _toggleVoice() {
    if (isSttActive()) {
      stopStt();
      this._isRecording = false;
      this._interimTranscript = "";
      return;
    }
    startStt({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          const tab = this._getActiveTab();
          if (tab) {
            tab.input = (tab.input ? tab.input + " " : "") + text;
            this._tabs = [...this._tabs];
          }
          this._interimTranscript = "";
        } else {
          this._interimTranscript = text;
        }
      },
      onStart: () => { this._isRecording = true; },
      onEnd: () => { this._isRecording = false; this._interimTranscript = ""; },
      onError: () => { this._isRecording = false; this._interimTranscript = ""; },
    });
  }

  // ── Message actions ──

  private async _copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch { /* fallback: ignore */ }
  }

  private _speakMessage(content: string) {
    if (isTtsSpeaking()) {
      stopTts();
      this._isSpeaking = false;
      return;
    }
    speakText(content, {
      onEnd: () => { this._isSpeaking = false; },
    });
    this._isSpeaking = true;
  }

  private _handleContentClick(e: Event) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("code-copy")) {
      const code = target.getAttribute("data-code") ?? "";
      navigator.clipboard.writeText(
        code.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      );
      target.classList.add("copied");
      setTimeout(() => target.classList.remove("copied"), 1500);
    }
  }

  // ── Export ──

  private _exportChat() {
    const tab = this._getActiveTab();
    if (!tab || tab.messages.length === 0) return;
    exportChatMarkdown(tab.messages, tab.agent.name);
  }

  // ── Stop generation ──

  private async _stopGeneration() {
    const tab = this._getActiveTab();
    if (!tab) return;
    try {
      const sessionKey = this._getSessionKey(tab.agentId);
      await gateway.call("chat.abort", { sessionKey, runId: tab.activeRunId || undefined });
    } catch { /* ignore */ }
    tab.sending = false;
    this._tabs = [...this._tabs];
  }

  private async _onModelChange(e: Event) {
    const tab = this._getActiveTab();
    if (!tab) return;
    const value = (e.target as HTMLSelectElement).value;
    this._selectedModel = value;
    try {
      const sessionKey = this._getSessionKey(tab.agentId);
      await gateway.call("sessions.patch", {
        key: sessionKey,
        model: value || null,
      });
    } catch { /* ignore */ }
  }

  private async _loadModels() {
    try {
      const [modelsResult, sessionsResult] = await Promise.all([
        gateway.call<{ models: Array<{id: string; name: string; provider?: string}> }>("models.list", {}),
        gateway.call<{ defaults?: { model?: string; modelProvider?: string } }>("sessions.list", {
          includeGlobal: true, includeUnknown: true,
        }),
      ]);

      // Build options with "provider/model" values and "model · provider" labels
      // This matches OpenClaw control UI's oi() format exactly
      const raw = modelsResult?.models ?? [];
      this._availableModels = raw.map((m) => ({
        value: m.provider ? `${m.provider}/${m.id}` : m.id,
        label: m.provider ? `${m.name} · ${m.provider}` : m.name,
      }));

      // Resolve default model display name from session defaults
      // Only show if the model is actually available (has a configured provider)
      const dm = sessionsResult?.defaults?.model ?? "";
      const dp = sessionsResult?.defaults?.modelProvider ?? "";
      const defaultId = dp && dm ? `${dp}/${dm}` : dm;
      if (dm && raw.some((m) => (m.provider ? `${m.provider}/${m.id}` : m.id) === defaultId)) {
        this._defaultModelDisplay = dp ? `${dm} · ${dp}` : dm;
      } else if (raw.length > 0) {
        const first = raw[0];
        this._defaultModelDisplay = first.provider ? `${first.name} · ${first.provider}` : first.name;
      } else {
        this._defaultModelDisplay = "";
      }
    } catch {
      this._availableModels = [];
    }
  }
}
