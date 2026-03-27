/** Monitor dashboard — health, system resources, and workspace overview. */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { STAFF_MEMBERS } from "./staff.js";
import { t, LocaleController } from "../i18n.js";

/* ── Modern SVG icons (Lucide-style, 16×16) ── */
const svgIcon = (d: string, size = 16) =>
  html`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// Use unsafeHTML-free template path approach
const iconCpu = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`;
const iconMemory = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-3"/><path d="M18 19v-3"/><path d="M8 11V9"/><path d="M16 11V9"/><path d="M12 11V9"/><rect x="2" y="11" width="20" height="5" rx="1"/></svg>`;
const iconDisk = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`;
const iconGpu = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01"/><path d="M10 12h.01"/><path d="M14 12h.01"/><path d="M18 12h.01"/><path d="M6 2v4"/><path d="M18 2v4"/></svg>`;
const iconLocation = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const iconClock = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const iconServer = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
const iconChip = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M20 15h2"/><path d="M9 2v2"/><path d="M9 20v2"/><path d="M2 9h2"/><path d="M20 9h2"/></svg>`;
const iconPython = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 6 4 6 5v3h6v1H4c-2 0-4 1.5-4 5s1 5 3 5h2v-3c0-2 1-4 4-4h6c2 0 3-1 3-3V5c0-2-1.5-3-6-3Z"/><path d="M12 22c5.5 0 6-2 6-3v-3h-6v-1h8c2 0 4-1.5 4-5s-1-5-3-5h-2v3c0 2-1 4-4 4h-6c-2 0-3 1-3 3v4c0 2 1.5 3 6 3Z"/><circle cx="9" cy="5.5" r=".5" fill="currentColor"/><circle cx="15" cy="18.5" r=".5" fill="currentColor"/></svg>`;
const iconZap = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const iconPackage = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
const iconFolderOpen = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;
const iconFolder = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;

/** Read session titles saved by chat view. */
function getSessionTitles(): Record<string, string> {
  try {
    const raw = localStorage.getItem("acaclaw-session-titles");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Look up a session title, trying the full key and the UUID-only portion. */
function lookupTitle(titles: Record<string, string>, key: string): string {
  if (titles[key]) return titles[key];
  // Chat may store title under bare UUID; gateway prefixes agent:id:
  const parts = key.split(":");
  const uuid = parts[parts.length - 1];
  return titles[uuid] || "";
}

/** Build agent lookup dynamically from STAFF_MEMBERS. */
function getAgentInfo(agentId: string): { icon: string; name: string } {
  if (agentId === "main") agentId = "default";
  const member = STAFF_MEMBERS.find((s) => s.id === agentId);
  if (member) return { icon: member.icon, name: member.name };
  return { icon: "🔬", name: agentId };
}

interface AgentRun {
  runId: string;
  agentId: string;
  agentIcon: string;
  agentName: string;
  status: "running" | "completed" | "error";
  startedAt: string;
  finishedAt?: string;
}

interface SessionInfo {
  key: string;
  agentId: string;
  agentIcon: string;
  agentName: string;
  model: string;
  totalTokens: number;
  updatedAt: number;
  channel: string;
  derivedTitle: string;
}

/** Parse a session key to extract the agent ID. */
function parseAgentId(sessionKey: string): string {
  if (sessionKey.startsWith("agent:")) {
    return sessionKey.split(":")[1];
  }
  return "default";
}

/** Strip gateway metadata prefix from derived titles.
 *  Messages arrive as "Sender (untrusted metadata):\n```json…```\n[timestamp] actual text".
 *  The gateway truncates at 60 chars, so the actual text may not be in the title. */
function cleanTitle(raw: string): string {
  if (raw.startsWith("Sender (untrusted metadata)")) return "";
  // Look for the actual user text after the bracketed timestamp
  const tsMatch = raw.match(/\] (.+)/);
  if (tsMatch) return tsMatch[1].trim();
  return raw;
}

@customElement("acaclaw-monitor")
export class MonitorView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _tokensToday = 0;
  @state() private _costToday = 0;
  @state() private _totalInput = 0;
  @state() private _totalOutput = 0;
  @state() private _gatewayHealthy = false;
  @state() private _loading = true;
  @state() private _lastCheck = "";

  /* system resource data */
  @state() private _cpuPercent = 0;
  @state() private _cpuCores = 0;
  @state() private _cpuModel = "";
  @state() private _loadAvg: number[] = [];
  @state() private _memTotal = 0;
  @state() private _memUsed = 0;
  @state() private _memPercent = 0;
  @state() private _diskTotal = 0;
  @state() private _diskUsed = 0;
  @state() private _diskPercent = 0;
  @state() private _sysHostname = "";
  @state() private _sysUptime = 0;
  @state() private _sysPlatform = "";
  @state() private _resourcesAvailable = false;

  /* GPU data */
  @state() private _gpuAvailable = false;
  @state() private _gpuType = "";
  @state() private _gpuName = "";
  @state() private _gpuUsagePercent = 0;
  @state() private _gpuMemTotal = 0;
  @state() private _gpuMemUsed = 0;
  @state() private _gpuMemPercent = 0;
  @state() private _gpuTemp = 0;
  @state() private _gpuFreqMhz = 0;
  @state() private _gpuMaxFreqMhz = 0;

  /* workspace overview */
  @state() private _envCount = 0;
  @state() private _activeEnv = "";
  @state() private _skillCount = 0;
  @state() private _backupCount = 0;
  @state() private _backupSize = 0;

  /* activity data from sessions.usage */
  @state() private _totalMessages = 0;
  @state() private _userMessages = 0;
  @state() private _assistantMessages = 0;
  @state() private _totalToolCalls = 0;
  @state() private _toolErrors = 0;
  @state() private _topTools: Array<{ name: string; calls: number }> = [];
  @state() private _dailyActivity: Array<{ date: string; messages: number; toolCalls: number }> = [];

  /* projects */
  @state() private _projects: Array<{ name: string; active: boolean }> = [];
  @state() private _activeProject = "";

  /* session/agent tracking */
  @state() private _activeRuns: AgentRun[] = [];
  @state() private _recentRuns: AgentRun[] = [];
  @state() private _sessions: SessionInfo[] = [];
  @state() private _showAllSessions = false;
  @state() private _editingSessionKey = "";
  @state() private _editingTitle = "";
  private _chatUnsub: (() => void) | null = null;

  /* session management controls */
  @state() private _sessionSearch = "";
  @state() private _sessionSortField: "updatedAt" | "agentName" | "totalTokens" | "model" = "updatedAt";
  @state() private _sessionSortDir: "asc" | "desc" = "desc";
  @state() private _sessionPage = 0;
  @state() private _sessionPageSize = 10;
  @state() private _sessionSelected = new Set<string>();

  @state() private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  static override styles = css`
    :host {
      display: block;
      animation: fade-in 0.3s ease-out forwards;
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
    }

    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: var(--ac-text);
      margin-bottom: 4px;
    }

    .subtitle {
      font-size: 15px;
      color: var(--ac-text-muted);
      line-height: 1.5;
    }

    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02), 0 0 0 1px rgba(0,0,0,0.02);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .card-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }

    .card-subtitle {
      font-size: 14px;
      color: var(--ac-text-secondary);
      margin-bottom: 24px;
    }

    .badge-stable {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: var(--ac-radius-full);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .badge-degraded {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: var(--ac-radius-full);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .health-banner {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 24px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.01);
    }

    .health-circle {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--ac-text);
      flex-shrink: 0;
    }

    .health-circle.healthy {
      border: 8px solid #10b981;
      box-shadow: inset 0 0 0 4px rgba(16,185,129,0.1);
    }

    .health-circle.degraded {
      border: 8px solid #ef4444;
      box-shadow: inset 0 0 0 4px rgba(239,68,68,0.1);
    }

    .health-circle .num {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .health-circle .lbl {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ac-text-muted);
      margin-top: 2px;
    }

    .health-info h3 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
      color: var(--ac-text);
    }

    .health-info p {
      font-size: 14px;
      color: var(--ac-text-secondary);
      margin-bottom: 8px;
    }
    .health-info .meta {
      font-size: 12px;
      color: var(--ac-text-tertiary);
    }

    .btn-outline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 600;
      color: var(--ac-text);
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      transition: all var(--ac-transition-fast);
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    }
    .btn-outline:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-muted);
    }

    /* ── Resource Gauges ── */
    .resource-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    @media (max-width: 800px) {
      .resource-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .resource-item {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 20px;
    }

    .resource-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ac-text-secondary);
      margin-bottom: 12px;
    }

    .resource-label .icon {
      display: inline-flex;
      align-items: center;
      color: var(--ac-text-secondary);
    }

    .resource-value {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      color: var(--ac-text);
      margin-bottom: 8px;
    }

    .resource-bar-track {
      height: 8px;
      background: var(--ac-border-subtle);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .resource-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .resource-bar-fill.green { background: #10b981; }
    .resource-bar-fill.yellow { background: #f59e0b; }
    .resource-bar-fill.red { background: #ef4444; }

    .resource-sub {
      font-size: 13px;
      color: var(--ac-text-tertiary);
    }

    .resource-unavailable {
      text-align: center;
      padding: 32px 24px;
      color: var(--ac-text-tertiary);
      font-size: 14px;
    }

    .sys-info-row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      margin-top: 12px;
      font-size: 13px;
      color: var(--ac-text-tertiary);
    }
    .sys-info-row span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sys-info-row svg {
      flex-shrink: 0;
    }

    /* ── Workspace Overview ── */
    .ws-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .ws-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
    }

    .ws-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ac-border-subtle);
      border-radius: var(--ac-radius-md, 8px);
      flex-shrink: 0;
      color: var(--ac-text-secondary);
    }

    .ws-info-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ac-text-secondary);
      margin-bottom: 4px;
    }

    .ws-info-value {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
    }

    .ws-info-sub {
      font-size: 12px;
      color: var(--ac-text-tertiary);
      margin-top: 2px;
    }

    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--ac-text-tertiary);
      font-size: 14px;
    }

    /* ── Activity Overview ── */
    .activity-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 16px;
    }

    @media (max-width: 800px) {
      .activity-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .activity-stat {
      text-align: center;
      padding: 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
    }

    .activity-stat-value {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: var(--ac-text);
      margin-bottom: 4px;
    }

    .activity-stat-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ac-text-secondary);
    }

    .tool-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      color: var(--ac-text);
    }

    .tool-chip-count {
      font-weight: 700;
      color: var(--ac-text-secondary);
      font-size: 12px;
    }

    .daily-chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 64px;
      margin-top: 16px;
    }

    .daily-bar-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .daily-bars {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 48px;
    }

    .daily-bar {
      width: 8px;
      border-radius: 2px;
      min-height: 2px;
    }

    .daily-bar.messages { background: #10b981; }
    .daily-bar.tools { background: #6366f1; }

    .daily-label {
      font-size: 10px;
      color: var(--ac-text-tertiary);
    }

    .chart-legend {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--ac-text-tertiary);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
    }

    .legend-dot.messages { background: #10b981; }
    .legend-dot.tools { background: #6366f1; }

    /* ── Agents / Sessions ── */
    .agent-run-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .agent-run {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
    }

    .agent-run.running {
      border-color: #6366f1;
      background: rgba(99, 102, 241, 0.04);
    }

    .agent-run.error {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.04);
    }

    .agent-run-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .agent-run-info {
      flex: 1;
      min-width: 0;
    }

    .agent-run-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--ac-text);
    }

    .session-title-editable {
      cursor: pointer;
      border-radius: 3px;
      padding: 0 2px;
    }
    .session-title-editable:hover {
      background: var(--ac-bg-hover, rgba(255,255,255,0.06));
    }

    .session-title-input {
      font-size: 14px;
      font-weight: 600;
      color: var(--ac-text);
      background: var(--ac-bg-input, rgba(255,255,255,0.08));
      border: 1px solid var(--ac-border, rgba(255,255,255,0.15));
      border-radius: 4px;
      padding: 1px 4px;
      width: 100%;
      outline: none;
      font-family: inherit;
    }
    .session-title-input:focus {
      border-color: var(--ac-primary, #6366f1);
    }

    .agent-run-time {
      font-size: 12px;
      color: var(--ac-text-tertiary);
    }

    .agent-run-status {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--ac-radius-full);
      flex-shrink: 0;
    }

    .status-running {
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
    }

    .status-completed {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .status-error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #6366f1;
      margin-right: 6px;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }

    .section-divider {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ac-text-tertiary);
      margin: 16px 0 8px;
    }

    .session-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-size: 11px;
      flex-shrink: 0;
    }

    .session-model {
      color: var(--ac-text-secondary);
      font-weight: 500;
    }

    .session-tokens {
      color: var(--ac-text-tertiary);
    }

    .session-load-btn {
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ac-primary);
      background: transparent;
      border: 1px solid var(--ac-primary);
      border-radius: var(--ac-radius-full);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      white-space: nowrap;
    }
    .session-load-btn:hover {
      background: var(--ac-primary);
      color: #fff;
    }

    .load-more-btn {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ac-primary);
      background: transparent;
      border: 1px dashed var(--ac-border);
      border-radius: var(--ac-radius-sm);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
    }
    .load-more-btn:hover {
      background: var(--ac-primary-bg);
      border-color: var(--ac-primary);
    }

    /* ── Session Management Controls ── */
    .session-toolbar {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 12px; flex-wrap: wrap;
    }
    .session-search {
      flex: 1; min-width: 160px; padding: 8px 12px; font-size: 12px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); color: var(--ac-text); outline: none;
      font-family: inherit;
    }
    .session-search:focus { border-color: var(--ac-primary); }
    .session-search::placeholder { color: var(--ac-text-tertiary); }
    .session-sort-btn {
      padding: 5px 10px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s; white-space: nowrap;
    }
    .session-sort-btn:hover { color: var(--ac-text); border-color: var(--ac-text-muted); }
    .session-sort-btn.active { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .session-bulk-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.2); border-radius: var(--ac-radius-lg);
      margin-bottom: 10px; font-size: 12px; color: var(--ac-text);
    }
    .session-bulk-btn {
      padding: 4px 10px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s;
    }
    .session-bulk-btn:hover { color: var(--ac-text); }
    .session-bulk-btn.danger { background: #ef4444; color: #fff; border-color: #ef4444; }
    .session-bulk-btn.danger:hover { background: #dc2626; }
    .session-checkbox { width: 14px; height: 14px; accent-color: var(--ac-primary); cursor: pointer; flex-shrink: 0; }
    .session-pagination {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 10px; font-size: 12px; color: var(--ac-text-muted);
    }
    .session-page-btns { display: flex; gap: 4px; }
    .session-page-btn {
      padding: 4px 10px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s;
    }
    .session-page-btn:hover { color: var(--ac-text); }
    .session-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Projects ── */
    .project-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .project-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
    }

    .project-item.active {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.04);
    }

    .project-icon {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      color: var(--ac-text-secondary);
    }

    .project-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--ac-text);
    }

    .project-badge {
      margin-left: auto;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--ac-radius-full);
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
  `;

  private _gatewayListener: EventListener | null = null;
  private _refreshIntervalListener: EventListener | null = null;

  private _getRefreshMs(): number {
    const stored = parseInt(localStorage.getItem("acaclaw-refresh-interval") ?? "15", 10);
    return (stored > 0 ? stored : 15) * 1000;
  }

  private _resetRefreshTimer() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => this._fetchData(), this._getRefreshMs());
  }

  override connectedCallback() {
    super.connectedCallback();
    if (gateway.state === "connected") {
      this._fetchData();
    }
    this._gatewayListener = ((e: CustomEvent) => {
      if (e.detail.state === "connected") this._fetchData();
    }) as EventListener;
    gateway.addEventListener("state-change", this._gatewayListener);
    this._resetRefreshTimer();

    // Listen for setting changes from the Advanced tab
    this._refreshIntervalListener = (() => {
      this._resetRefreshTimer();
    }) as EventListener;
    window.addEventListener("refresh-interval-changed", this._refreshIntervalListener);

    // Subscribe to chat notifications for real-time agent tracking
    this._chatUnsub = gateway.onNotification("chat", (data: unknown) => {
      this._handleChatNotification(data);
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._gatewayListener) {
      gateway.removeEventListener("state-change", this._gatewayListener);
      this._gatewayListener = null;
    }
    if (this._refreshIntervalListener) {
      window.removeEventListener("refresh-interval-changed", this._refreshIntervalListener);
      this._refreshIntervalListener = null;
    }
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    this._chatUnsub?.();
    this._chatUnsub = null;
  }

  private _handleChatNotification(data: unknown) {
    const d = data as { runId?: string; sessionKey?: string; state?: string };
    if (!d.runId) return;

    const agentId = d.sessionKey ? parseAgentId(d.sessionKey) : "default";
    const info = getAgentInfo(agentId);

    if (d.state === "delta") {
      // Check if already tracked
      if (!this._activeRuns.find((r) => r.runId === d.runId)) {
        this._activeRuns = [...this._activeRuns, {
          runId: d.runId,
          agentId,
          agentIcon: info.icon,
          agentName: info.name,
          status: "running",
          startedAt: new Date().toLocaleTimeString(),
        }];
      }
    } else if (d.state === "final" || d.state === "error") {
      const status = d.state === "final" ? "completed" as const : "error" as const;
      const existing = this._activeRuns.find((r) => r.runId === d.runId);
      const finishedRun: AgentRun = existing
        ? { ...existing, status, finishedAt: new Date().toLocaleTimeString() }
        : { runId: d.runId, agentId, agentIcon: info.icon, agentName: info.name, status, startedAt: "", finishedAt: new Date().toLocaleTimeString() };

      this._activeRuns = this._activeRuns.filter((r) => r.runId !== d.runId);
      this._recentRuns = [finishedRun, ...this._recentRuns].slice(0, 10);
    }
  }

  private async _fetchData() {
    this._loading = true;

    // Health check
    try {
      await gateway.call("health");
      this._gatewayHealthy = true;
    } catch {
      this._gatewayHealthy = false;
    }

    // Today's usage
    try {
      const res = await gateway.call<{
        daily?: Array<{ date: string; input: number; output: number; totalCost: number }>;
        totals?: { totalCost: number; totalTokens: number; input?: number; output?: number };
      }>("usage.cost", { days: 7 });
      if (res) {
        const daily = res.daily ?? [];
        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = daily.find((d) => d.date === today);
        const totalInput = daily.reduce((s, d) => s + d.input, 0);
        const totalOutput = daily.reduce((s, d) => s + d.output, 0);
        this._tokensToday = todayEntry ? todayEntry.input + todayEntry.output : totalInput + totalOutput;
        this._costToday = todayEntry?.totalCost ?? daily.reduce((s, d) => s + d.totalCost, 0);
        this._totalInput = totalInput;
        this._totalOutput = totalOutput;
      }
    } catch { /* keep zeros */ }

    // System resources
    try {
      const stats = await gateway.call<{
        cpu: { cores: number; model: string; usagePercent: number; loadAvg: number[] };
        memory: { total: number; used: number; free: number; usagePercent: number };
        disk: { total: number; used: number; free: number; usagePercent: number };
        gpu: {
          type: string; name: string; usagePercent: number;
          memTotal?: number; memUsed?: number; memFree?: number; memPercent?: number;
          temperature?: number; driver?: string;
          freqMhz?: number; maxFreqMhz?: number;
        } | null;
        system: { hostname: string; uptime: number; platform: string };
      }>("acaclaw.system.stats");
      if (stats) {
        this._cpuPercent = stats.cpu.usagePercent;
        this._cpuCores = stats.cpu.cores;
        this._cpuModel = stats.cpu.model;
        this._loadAvg = stats.cpu.loadAvg;
        this._memTotal = stats.memory.total;
        this._memUsed = stats.memory.used;
        this._memPercent = stats.memory.usagePercent;
        this._diskTotal = stats.disk.total;
        this._diskUsed = stats.disk.used;
        this._diskPercent = stats.disk.usagePercent;
        this._sysHostname = stats.system.hostname;
        this._sysUptime = stats.system.uptime;
        this._sysPlatform = stats.system.platform;
        this._resourcesAvailable = true;

        if (stats.gpu) {
          this._gpuAvailable = true;
          this._gpuType = stats.gpu.type;
          this._gpuName = stats.gpu.name;
          this._gpuUsagePercent = stats.gpu.usagePercent;
          this._gpuMemTotal = stats.gpu.memTotal ?? 0;
          this._gpuMemUsed = stats.gpu.memUsed ?? 0;
          this._gpuMemPercent = stats.gpu.memPercent ?? 0;
          this._gpuTemp = stats.gpu.temperature ?? 0;
          this._gpuFreqMhz = stats.gpu.freqMhz ?? 0;
          this._gpuMaxFreqMhz = stats.gpu.maxFreqMhz ?? 0;
        } else {
          this._gpuAvailable = false;
        }
      }
    } catch { this._resourcesAvailable = false; }

    // Workspace overview
    try {
      const envRes = await gateway.call<{
        environments: Array<{ name: string; active: boolean; installed: boolean }>;
      }>("acaclaw.env.list");
      if (envRes?.environments) {
        this._envCount = envRes.environments.filter((e) => e.installed).length;
        this._activeEnv = envRes.environments.find((e) => e.active)?.name ?? "";
      }
    } catch { /* plugin not loaded */ }

    try {
      const skillRes = await gateway.call<{ skills: Array<{ name: string }> }>("skills.status");
      this._skillCount = skillRes?.skills?.length ?? 0;
    } catch { /* keep zeros */ }

    try {
      const backupRes = await gateway.call<{
        snapshots?: Array<{ sizeBytes: number }>;
      }>("acaclaw.backup.snapshotList");
      if (backupRes?.snapshots) {
        this._backupCount = backupRes.snapshots.length;
        this._backupSize = backupRes.snapshots.reduce((s, b) => s + (b.sizeBytes ?? 0), 0);
      }
    } catch { /* keep zeros */ }

    // Activity data (last 7 days)
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const usageRes = await gateway.call<{
        aggregates?: {
          tools?: { totalCalls: number; uniqueTools: number; tools: Array<{ name: string; calls: number; errors?: number }> };
          messages?: { total: number; user: number; assistant: number; toolCalls: number; errors: number };
          daily?: Array<{ date: string; messages: number; toolCalls: number; errors: number }>;
        };
      }>("sessions.usage", { startDate: fmt(start), endDate: fmt(end), limit: 200 });
      if (usageRes?.aggregates) {
        const msg = usageRes.aggregates.messages;
        if (msg) {
          this._totalMessages = msg.total ?? 0;
          this._userMessages = msg.user ?? 0;
          this._assistantMessages = msg.assistant ?? 0;
          this._totalToolCalls = msg.toolCalls ?? 0;
          this._toolErrors = msg.errors ?? 0;
        }
        if (usageRes.aggregates.tools?.tools) {
          this._topTools = usageRes.aggregates.tools.tools
            .sort((a, b) => b.calls - a.calls)
            .slice(0, 8)
            .map((t) => ({ name: t.name, calls: t.calls }));
        }
        if (usageRes.aggregates.daily) {
          this._dailyActivity = usageRes.aggregates.daily
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-7)
            .map((d) => ({ date: d.date, messages: d.messages, toolCalls: d.toolCalls }));
        }
      }
    } catch { /* keep zeros */ }

    // Projects
    try {
      const projRes = await gateway.call<{
        projects: Array<{ name: string }>;
        activeProject?: string;
      }>("acaclaw.project.list");
      if (projRes?.projects) {
        this._activeProject = projRes.activeProject ?? "";
        this._projects = projRes.projects.map((p) => ({
          name: p.name,
          active: p.name === this._activeProject,
        }));
      }
    } catch { /* keep zeros */ }

    // Sessions — load historical session data
    try {
      const sessRes = await gateway.call<{
        sessions?: Array<{
          key: string;
          updatedAt?: number;
          model?: string;
          modelProvider?: string;
          totalTokens?: number;
          lastChannel?: string;
          derivedTitle?: string;
        }>;
      }>("sessions.list", { includeDerivedTitles: true });
      if (sessRes?.sessions) {
        const titles = getSessionTitles();
        this._sessions = sessRes.sessions
          .filter((s) => !s.key.includes(":title-gen:"))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .map((s) => {
            const agentId = parseAgentId(s.key);
            const info = getAgentInfo(agentId);
            const derived = s.derivedTitle ? cleanTitle(s.derivedTitle) : "";
            return {
              key: s.key,
              agentId,
              agentIcon: info.icon,
              agentName: info.name,
              model: s.model ?? "unknown",
              totalTokens: s.totalTokens ?? 0,
              updatedAt: s.updatedAt ?? 0,
              channel: s.lastChannel ?? "unknown",
              derivedTitle: derived || lookupTitle(titles, s.key),
            };
          });
      }
    } catch { /* keep empty */ }

    this._lastCheck = new Date().toLocaleTimeString();
    this._loading = false;
  }

  private _fmtTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  private _timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  private _fmtSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GB";
    if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
    if (bytes >= 1_024) return (bytes / 1_024).toFixed(1) + " KB";
    return bytes + " B";
  }

  private _barColor(pct: number): string {
    if (pct >= 90) return "red";
    if (pct >= 70) return "yellow";
    return "green";
  }

  private _fmtUptime(secs: number): string {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  private _renderResources() {
    if (!this._resourcesAvailable) {
      return html`
        <div class="card">
          <div class="card-header">
            <div class="card-title">${t("monitor.resources")}</div>
          </div>
          <div class="resource-unavailable">System stats plugin not available. Install the acaclaw-system-stats plugin.</div>
        </div>
      `;
    }

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.resources")}</div>
          <div class="meta">${this._lastCheck ? t("monitor.updated", this._lastCheck) : ""}</div>
        </div>
        <div class="card-subtitle">${t("monitor.resources.desc")}</div>
        <div class="resource-grid">
          <div class="resource-item">
            <div class="resource-label"><span class="icon">${iconCpu}</span>${t("monitor.cpu")}</div>
            <div class="resource-value">${this._cpuPercent.toFixed(1)}%</div>
            <div class="resource-bar-track">
              <div class="resource-bar-fill ${this._barColor(this._cpuPercent)}" style="width:${this._cpuPercent}%"></div>
            </div>
            <div class="resource-sub">${t("monitor.cores", this._cpuCores)} · ${t("monitor.load")} ${this._loadAvg.map(l => l.toFixed(2)).join(", ")}</div>
          </div>
          <div class="resource-item">
            <div class="resource-label"><span class="icon">${iconMemory}</span>${t("monitor.memory")}</div>
            <div class="resource-value">${this._memPercent.toFixed(1)}%</div>
            <div class="resource-bar-track">
              <div class="resource-bar-fill ${this._barColor(this._memPercent)}" style="width:${this._memPercent}%"></div>
            </div>
            <div class="resource-sub">${this._fmtSize(this._memUsed)} / ${this._fmtSize(this._memTotal)}</div>
          </div>
          <div class="resource-item">
            <div class="resource-label"><span class="icon">${iconDisk}</span>${t("monitor.disk")}</div>
            <div class="resource-value">${this._diskPercent.toFixed(1)}%</div>
            <div class="resource-bar-track">
              <div class="resource-bar-fill ${this._barColor(this._diskPercent)}" style="width:${this._diskPercent}%"></div>
            </div>
            <div class="resource-sub">${this._fmtSize(this._diskUsed)} / ${this._fmtSize(this._diskTotal)}</div>
          </div>
          ${this._gpuAvailable ? html`
          <div class="resource-item">
            <div class="resource-label"><span class="icon">${iconGpu}</span>${t("monitor.gpu")}</div>
            <div class="resource-value">${this._gpuUsagePercent.toFixed(1)}%</div>
            <div class="resource-bar-track">
              <div class="resource-bar-fill ${this._barColor(this._gpuUsagePercent)}" style="width:${this._gpuUsagePercent}%"></div>
            </div>
            <div class="resource-sub">${this._gpuName}${this._gpuType === "nvidia"
              ? ` · ${this._fmtSize(this._gpuMemUsed)} / ${this._fmtSize(this._gpuMemTotal)} · ${this._gpuTemp}°C`
              : this._gpuMaxFreqMhz > 0
                ? ` · ${this._gpuFreqMhz} / ${this._gpuMaxFreqMhz} MHz`
                : ""}</div>
          </div>
          ` : nothing}
        </div>
        <div class="sys-info-row">
          <span>${iconLocation} ${this._sysHostname}</span>
          <span>${iconClock} ${t("monitor.uptime", this._fmtUptime(this._sysUptime))}</span>
          <span>${iconServer} ${this._sysPlatform}</span>
          <span>${iconChip} ${this._cpuModel}</span>
        </div>
      </div>
    `;
  }

  private _renderWorkspace() {
    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.workspace")}</div>
        </div>
        <div class="card-subtitle">${t("monitor.workspace.desc")}</div>
        <div class="ws-grid">
          <div class="ws-item">
            <div class="ws-icon">${iconPython}</div>
            <div>
              <div class="ws-info-label">${t("monitor.envs")}</div>
              <div class="ws-info-value">${this._envCount}</div>
              ${this._activeEnv ? html`<div class="ws-info-sub">${t("monitor.activeEnv", this._activeEnv)}</div>` : nothing}
            </div>
          </div>
          <div class="ws-item">
            <div class="ws-icon">${iconZap}</div>
            <div>
              <div class="ws-info-label">${t("monitor.skills")}</div>
              <div class="ws-info-value">${this._skillCount}</div>
              <div class="ws-info-sub">${t("monitor.installed")}</div>
            </div>
          </div>
          <div class="ws-item">
            <div class="ws-icon">${iconPackage}</div>
            <div>
              <div class="ws-info-label">${t("monitor.backups")}</div>
              <div class="ws-info-value">${this._backupCount}</div>
              ${this._backupSize > 0 ? html`<div class="ws-info-sub">${this._fmtSize(this._backupSize)}</div>` : nothing}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** Filter + sort sessions for the management table */
  private _filteredSortedSessions(): SessionInfo[] {
    let list = [...this._sessions];
    if (this._sessionSearch) {
      const q = this._sessionSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.key.toLowerCase().includes(q) ||
          s.derivedTitle.toLowerCase().includes(q) ||
          s.agentName.toLowerCase().includes(q) ||
          s.model.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const f = this._sessionSortField;
      let av: string | number = (a as unknown as Record<string, unknown>)[f] as string | number ?? "";
      let bv: string | number = (b as unknown as Record<string, unknown>)[f] as string | number ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return this._sessionSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }

  private _pagedSessions(): SessionInfo[] {
    const all = this._filteredSortedSessions();
    const start = this._sessionPage * this._sessionPageSize;
    return all.slice(start, start + this._sessionPageSize);
  }

  private _toggleSessionSort(field: typeof this._sessionSortField) {
    if (this._sessionSortField === field) {
      this._sessionSortDir = this._sessionSortDir === "asc" ? "desc" : "asc";
    } else {
      this._sessionSortField = field;
      this._sessionSortDir = field === "updatedAt" ? "desc" : "asc";
    }
  }

  private _toggleSessionSelect(key: string) {
    const s = new Set(this._sessionSelected);
    if (s.has(key)) s.delete(key);
    else s.add(key);
    this._sessionSelected = s;
  }

  private _toggleSessionSelectAll() {
    const paged = this._pagedSessions();
    const allSel = paged.every((s) => this._sessionSelected.has(s.key));
    const next = new Set(this._sessionSelected);
    for (const s of paged) {
      if (allSel) next.delete(s.key);
      else next.add(s.key);
    }
    this._sessionSelected = next;
  }

  private async _deleteSelectedSessions() {
    for (const key of this._sessionSelected) {
      try {
        await gateway.call("sessions.delete", { key });
      } catch { /* ignore individual failures */ }
    }
    this._sessionSelected = new Set();
    this._fetchData();
  }

  private _renderSessions() {
    const hasActive = this._activeRuns.length > 0;
    const hasRecent = this._recentRuns.length > 0;
    const hasSessions = this._sessions.length > 0;
    if (!hasActive && !hasRecent && !hasSessions) return nothing;

    const filtered = this._filteredSortedSessions();
    const paged = this._pagedSessions();
    const totalPages = Math.ceil(filtered.length / this._sessionPageSize);
    const sortArrow = (f: typeof this._sessionSortField) =>
      this._sessionSortField === f ? (this._sessionSortDir === "asc" ? " ▲" : " ▼") : "";

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.agents")}</div>
          <div class="meta">${this._activeRuns.length > 0 ? `${this._activeRuns.length} active` : `${this._sessions.length} session${this._sessions.length !== 1 ? "s" : ""}`}</div>
        </div>
        <div class="card-subtitle">${t("monitor.agents.desc")}</div>

        ${hasActive ? html`
          <div class="section-divider"><span class="pulse"></span>${t("monitor.running")}</div>
          <div class="agent-run-list">
            ${this._activeRuns.map((r) => html`
              <div class="agent-run running">
                <span class="agent-run-icon">${r.agentIcon}</span>
                <div class="agent-run-info">
                  <div class="agent-run-name">${r.agentName}</div>
                  <div class="agent-run-time">${t("monitor.started", r.startedAt)}</div>
                </div>
                <span class="agent-run-status status-running">${t("monitor.running")}</span>
              </div>
            `)}
          </div>
        ` : nothing}

        ${hasRecent ? html`
          <div class="section-divider">${t("monitor.recent")}</div>
          <div class="agent-run-list">
            ${this._recentRuns.map((r) => html`
              <div class="agent-run ${r.status}">
                <span class="agent-run-icon">${r.agentIcon}</span>
                <div class="agent-run-info">
                  <div class="agent-run-name">${r.agentName}</div>
                  <div class="agent-run-time">${r.finishedAt ?? ""}</div>
                </div>
                <span class="agent-run-status status-${r.status}">${r.status === "completed" ? t("monitor.done") : t("monitor.error")}</span>
              </div>
            `)}
          </div>
        ` : nothing}

        ${hasSessions ? html`
          <div class="section-divider">${t("monitor.sessions")}</div>

          <div class="session-toolbar">
            <input class="session-search" placeholder="${t("sessions.search")}"
              .value=${this._sessionSearch}
              @input=${(e: InputEvent) => { this._sessionSearch = (e.target as HTMLInputElement).value; this._sessionPage = 0; }} />
            <button class="session-sort-btn ${this._sessionSortField === "updatedAt" ? "active" : ""}"
              @click=${() => this._toggleSessionSort("updatedAt")}>${t("sessions.col.updated")}${sortArrow("updatedAt")}</button>
            <button class="session-sort-btn ${this._sessionSortField === "agentName" ? "active" : ""}"
              @click=${() => this._toggleSessionSort("agentName")}>${t("monitor.agents")}${sortArrow("agentName")}</button>
            <button class="session-sort-btn ${this._sessionSortField === "totalTokens" ? "active" : ""}"
              @click=${() => this._toggleSessionSort("totalTokens")}>${t("sessions.col.tokens")}${sortArrow("totalTokens")}</button>
            <button class="session-sort-btn ${this._sessionSortField === "model" ? "active" : ""}"
              @click=${() => this._toggleSessionSort("model")}>Model${sortArrow("model")}</button>
          </div>

          ${this._sessionSelected.size > 0 ? html`
            <div class="session-bulk-bar">
              <span>${this._sessionSelected.size} ${t("sessions.selected")}</span>
              <button class="session-bulk-btn danger" @click=${this._deleteSelectedSessions}>${t("sessions.deleteSelected")}</button>
              <button class="session-bulk-btn" @click=${() => { this._sessionSelected = new Set(); }}>${t("sessions.deselectAll")}</button>
            </div>
          ` : nothing}

          <div class="agent-run-list">
            ${paged.map((s) => html`
              <div class="agent-run session-info">
                <input type="checkbox" class="session-checkbox"
                  .checked=${this._sessionSelected.has(s.key)}
                  @change=${() => this._toggleSessionSelect(s.key)} />
                <span class="agent-run-icon">${s.agentIcon}</span>
                <div class="agent-run-info">
                  ${this._editingSessionKey === s.key ? html`
                    <input class="session-title-input"
                      .value=${this._editingTitle}
                      @input=${(e: Event) => { this._editingTitle = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._saveTitle(s); if (e.key === "Escape") this._cancelEditTitle(); }}
                      @blur=${() => this._saveTitle(s)}
                    />
                  ` : html`
                    <div class="agent-run-name session-title-editable" @click=${() => this._startEditTitle(s)}>${s.derivedTitle || s.agentName}</div>
                  `}
                  <div class="agent-run-time">${s.updatedAt ? this._timeAgo(s.updatedAt) : "—"}</div>
                </div>
                <div class="session-meta">
                  <span class="session-model">${s.model}</span>
                  ${s.totalTokens > 0 ? html`<span class="session-tokens">${this._fmtTokens(s.totalTokens)} ${t("monitor.tokens").toLowerCase()}</span>` : nothing}
                </div>
                <button class="session-load-btn" @click=${() => this._openSession(s)}>${t("monitor.load")}</button>
              </div>
            `)}
          </div>

          ${filtered.length > this._sessionPageSize ? html`
            <div class="session-pagination">
              <span>${t("sessions.showing", this._sessionPage * this._sessionPageSize + 1, Math.min((this._sessionPage + 1) * this._sessionPageSize, filtered.length), filtered.length)}</span>
              <div class="session-page-btns">
                <button class="session-page-btn" ?disabled=${this._sessionPage === 0} @click=${() => { this._sessionPage--; }}>← Prev</button>
                <button class="session-page-btn" ?disabled=${this._sessionPage >= totalPages - 1} @click=${() => { this._sessionPage++; }}>Next →</button>
              </div>
            </div>
          ` : nothing}
        ` : nothing}
      </div>
    `;
  }

  /** Navigate to Chat and load a specific session */
  private _openSession(s: SessionInfo) {
    window.dispatchEvent(
      new CustomEvent("load-session", { detail: { sessionKey: s.key, agentId: s.agentId } })
    );
  }

  private _startEditTitle(s: SessionInfo) {
    this._editingSessionKey = s.key;
    this._editingTitle = s.derivedTitle || s.agentName;
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>(".session-title-input");
      input?.focus();
      input?.select();
    });
  }

  private _saveTitle(s: SessionInfo) {
    const title = this._editingTitle.trim().slice(0, 60);
    if (title) {
      try {
        const raw = localStorage.getItem("acaclaw-session-titles");
        const titles: Record<string, string> = raw ? JSON.parse(raw) : {};
        const parts = s.key.split(":");
        const uuid = parts[parts.length - 1];
        titles[uuid] = title;
        localStorage.setItem("acaclaw-session-titles", JSON.stringify(titles));
      } catch { /* ignore */ }
      s.derivedTitle = title;
      this._sessions = [...this._sessions];
    }
    this._editingSessionKey = "";
    this._editingTitle = "";
  }

  private _cancelEditTitle() {
    this._editingSessionKey = "";
    this._editingTitle = "";
  }

  private _renderActivity() {
    const hasActivity = this._totalMessages > 0 || this._totalToolCalls > 0;
    const maxDaily = Math.max(1, ...this._dailyActivity.map((d) => Math.max(d.messages, d.toolCalls)));

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.activity")}</div>
          <div class="meta">${t("monitor.activity.last7")}</div>
        </div>
        <div class="card-subtitle">${t("monitor.activity.desc")}</div>

        ${hasActivity ? html`
          <div class="activity-grid">
            <div class="activity-stat">
              <div class="activity-stat-value">${this._totalMessages}</div>
              <div class="activity-stat-label">${t("monitor.messages")}</div>
            </div>
            <div class="activity-stat">
              <div class="activity-stat-value">${this._totalToolCalls}</div>
              <div class="activity-stat-label">${t("monitor.toolCalls")}</div>
            </div>
            <div class="activity-stat">
              <div class="activity-stat-value">${this._toolErrors}</div>
              <div class="activity-stat-label">${t("monitor.errors")}</div>
            </div>
            <div class="activity-stat">
              <div class="activity-stat-value">${this._topTools.length}</div>
              <div class="activity-stat-label">${t("monitor.toolsUsed")}</div>
            </div>
          </div>

          ${this._dailyActivity.length > 0 ? html`
            <div class="daily-chart">
              ${this._dailyActivity.map((d) => html`
                <div class="daily-bar-group">
                  <div class="daily-bars">
                    <div class="daily-bar messages" style="height:${(d.messages / maxDaily) * 48}px"></div>
                    <div class="daily-bar tools" style="height:${(d.toolCalls / maxDaily) * 48}px"></div>
                  </div>
                  <div class="daily-label">${d.date.slice(5)}</div>
                </div>
              `)}
            </div>
            <div class="chart-legend">
              <span><span class="legend-dot messages"></span>${t("monitor.messages")}</span>
              <span><span class="legend-dot tools"></span>${t("monitor.toolCalls")}</span>
            </div>
          ` : nothing}

          ${this._topTools.length > 0 ? html`
            <div class="tool-list">
              ${this._topTools.map((t) => html`
                <span class="tool-chip">${t.name} <span class="tool-chip-count">×${t.calls}</span></span>
              `)}
            </div>
          ` : nothing}
        ` : html`
          <div class="empty-state">${t("monitor.noActivity")}</div>
        `}
      </div>
    `;
  }

  private _renderProjects() {
    if (this._projects.length === 0) return nothing;

    return html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.projects")}</div>
          <div class="meta">${t("monitor.projectCount", this._projects.length)}</div>
        </div>
        <div class="card-subtitle">${t("monitor.projects.desc")}</div>
        <div class="project-list">
          ${this._projects.map((p) => html`
            <div class="project-item ${p.active ? "active" : ""}">
              <span class="project-icon">${p.active ? iconFolderOpen : iconFolder}</span>
              <span class="project-name">${p.name}</span>
              ${p.active ? html`<span class="project-badge">${t("monitor.active")}</span>` : nothing}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  override render() {
    const healthScore = this._gatewayHealthy ? 100 : 0;
    const posture = this._gatewayHealthy ? t("monitor.stable") : t("monitor.degraded");
    const postureDesc = this._gatewayHealthy
      ? t("monitor.healthy.desc")
      : t("monitor.degraded.desc");
    const flowLabel = this._gatewayHealthy ? t("monitor.flowingWell") : t("monitor.offline");

    return html`
      <div class="header-row">
        <div>
          <h1>${t("monitor.title")}</h1>
          <div class="subtitle">${t("monitor.subtitle")}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn-outline" @click=${this._fetchData}>${this._loading ? "Checking\u2026" : t("monitor.refresh")}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">${t("monitor.health")}</div>
          <div class="${this._gatewayHealthy ? "badge-stable" : "badge-degraded"}">${posture}</div>
        </div>
        <div class="card-subtitle">${postureDesc}</div>

        <div class="health-banner">
          <div class="health-circle ${this._gatewayHealthy ? "healthy" : "degraded"}">
            <div class="num">${healthScore}</div>
            <div class="lbl">${t("monitor.health")}</div>
          </div>
          <div class="health-info">
            <h3>${flowLabel}</h3>
            <p>${t("monitor.tokens")} ${this._fmtTokens(this._tokensToday)} · ${t("monitor.cost")} $${this._costToday.toFixed(4)}</p>
            <div class="meta">${this._lastCheck ? t("monitor.lastCheck", this._lastCheck) : ""}</div></div>
          </div>
        </div>
      </div>

      ${this._renderResources()}
      ${this._renderSessions()}
      ${this._renderActivity()}
      ${this._renderProjects()}
      ${this._renderWorkspace()}
    `;
  }
}
