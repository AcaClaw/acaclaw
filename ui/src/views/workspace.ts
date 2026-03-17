import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
  modified?: string;
  children?: FileEntry[];
}

interface SessionLog {
  id: string;
  agentId: string;
  agentName: string;
  startedAt: string;
  duration: string;
  messageCount: number;
  status: "completed" | "running" | "failed";
}

interface RecentJob {
  id: string;
  title: string;
  agent: string;
  finishedAt: string;
  status: "success" | "error";
}

@customElement("acaclaw-workspace")
export class WorkspaceView extends LitElement {
  @state() private _currentPath: string[] = [];
  @state() private _entries: FileEntry[] = [];
  @state() private _sessions: SessionLog[] = [];
  @state() private _recentJobs: RecentJob[] = [];
  @state() private _loading = false;
  @state() private _activeTab: "files" | "sessions" | "jobs" = "files";

  static override styles = css`
    :host { display: block; }
    h1 {
      font-size: 32px; font-weight: 800;
      letter-spacing: -0.03em; margin-bottom: 4px;
      color: var(--ac-text);
    }
    .subtitle {
      font-size: 14px; color: var(--ac-text-secondary);
      margin-bottom: 24px;
    }

    .tabs {
      display: flex; gap: 4px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--ac-border-subtle);
      padding-bottom: 0;
    }
    .tab {
      padding: 10px 20px;
      font-size: 13px; font-weight: 500;
      color: var(--ac-text-secondary);
      cursor: pointer; border: none; background: none;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .tab:hover { color: var(--ac-text); }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
      font-weight: 600;
    }

    .breadcrumb {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; color: var(--ac-text-secondary);
      margin-bottom: 16px; flex-wrap: wrap;
    }
    .breadcrumb-item {
      cursor: pointer; padding: 2px 6px;
      border-radius: 4px; transition: all 0.15s;
    }
    .breadcrumb-item:hover {
      background: var(--ac-bg-hover); color: var(--ac-text);
    }
    .breadcrumb-sep { color: var(--ac-text-muted); }

    .file-list {
      display: flex; flex-direction: column;
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      overflow: hidden;
    }
    .file-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--ac-border-subtle);
      cursor: pointer;
      transition: background 0.12s;
    }
    .file-row:last-child { border-bottom: none; }
    .file-row:hover { background: var(--ac-bg-hover); }
    .file-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
    .file-name { flex: 1; font-weight: 500; color: var(--ac-text); }
    .file-name.dir { color: var(--ac-primary); }
    .file-meta { font-size: 12px; color: var(--ac-text-muted); }
    .file-size { min-width: 60px; text-align: right; }
    .file-modified { min-width: 120px; text-align: right; }
    .file-open-btn {
      padding: 3px 10px; font-size: 11px; font-weight: 500;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full);
      cursor: pointer; color: var(--ac-text-secondary);
      transition: all 0.15s;
    }
    .file-open-btn:hover {
      background: var(--ac-primary); color: #fff;
      border-color: var(--ac-primary);
    }

    .empty-state {
      padding: 48px 24px; text-align: center;
      color: var(--ac-text-muted); font-size: 13px;
    }
    .empty-icon { font-size: 32px; margin-bottom: 12px; }

    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px; margin-bottom: 16px;
    }
    .card h3 {
      font-size: 14px; font-weight: 600;
      color: var(--ac-text); margin-bottom: 12px;
    }

    .session-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--ac-border-subtle);
      font-size: 13px; cursor: pointer;
      transition: background 0.12s;
    }
    .session-row:hover { background: var(--ac-bg-hover); }
    .session-row:last-child { border-bottom: none; }
    .session-agent { font-weight: 500; color: var(--ac-text); min-width: 100px; }
    .session-time { color: var(--ac-text-muted); font-size: 12px; min-width: 140px; }
    .session-msgs { font-size: 12px; color: var(--ac-text-secondary); }
    .session-duration { font-size: 12px; color: var(--ac-text-muted); min-width: 60px; text-align: right; }
    .status-badge {
      font-size: 11px; font-weight: 500;
      padding: 2px 8px; border-radius: var(--ac-radius-full);
    }
    .status-badge.completed { background: var(--ac-success-bg); color: var(--ac-success); }
    .status-badge.running { background: var(--ac-primary-bg); color: var(--ac-primary); }
    .status-badge.failed { background: var(--ac-error-bg, #fef2f2); color: var(--ac-error); }
    .status-badge.success { background: var(--ac-success-bg); color: var(--ac-success); }
    .status-badge.error { background: var(--ac-error-bg, #fef2f2); color: var(--ac-error); }

    .job-title { flex: 1; font-weight: 500; color: var(--ac-text); }
    .job-agent { font-size: 12px; color: var(--ac-text-secondary); min-width: 100px; }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadFiles();
    this._loadSessions();
    this._loadRecentJobs();
  }

  private async _loadFiles() {
    this._loading = true;
    try {
      const path = this._currentPath.length > 0
        ? "~/AcaClaw/" + this._currentPath.join("/")
        : "~/AcaClaw";
      const res = await gateway.call<{ entries: FileEntry[] }>(
        "acaclaw.workspace.list", { path }
      );
      if (res?.entries) {
        this._entries = res.entries;
        this._loading = false;
        return;
      }
    } catch { /* use demo data */ }
    this._entries = this._demoFiles();
    this._loading = false;
  }

  private async _loadSessions() {
    try {
      const res = await gateway.call<{ sessions: SessionLog[] }>(
        "acaclaw.sessions.list"
      );
      if (res?.sessions) { this._sessions = res.sessions; return; }
    } catch { /* demo */ }
    this._sessions = this._demoSessions();
  }

  private async _loadRecentJobs() {
    try {
      const res = await gateway.call<{ jobs: RecentJob[] }>(
        "acaclaw.jobs.recent"
      );
      if (res?.jobs) { this._recentJobs = res.jobs; return; }
    } catch { /* demo */ }
    this._recentJobs = this._demoJobs();
  }

  private _demoFiles(): FileEntry[] {
    if (this._currentPath.length === 0) {
      return [
        { name: "agents", type: "dir" },
        { name: "data", type: "dir" },
        { name: "documents", type: "dir" },
        { name: "figures", type: "dir" },
        { name: "notes", type: "dir" },
        { name: "output", type: "dir" },
        { name: "references", type: "dir" },
        { name: "AGENTS.md", type: "file", size: 2048, modified: "2026-03-16" },
        { name: "BOOTSTRAP.md", type: "file", size: 1024, modified: "2026-03-15" },
        { name: "HEARTBEAT.md", type: "file", size: 512, modified: "2026-03-17" },
        { name: "IDENTITY.md", type: "file", size: 3072, modified: "2026-03-14" },
        { name: "README.md", type: "file", size: 1536, modified: "2026-03-16" },
        { name: "SOUL.md", type: "file", size: 2560, modified: "2026-03-14" },
        { name: "TOOLS.md", type: "file", size: 1280, modified: "2026-03-15" },
        { name: "USER.md", type: "file", size: 1792, modified: "2026-03-14" },
      ];
    }
    if (this._currentPath[0] === "agents") {
      return [
        { name: "biologist", type: "dir" },
        { name: "medscientist", type: "dir" },
        { name: "ai-researcher", type: "dir" },
        { name: "data-analyst", type: "dir" },
        { name: "cs-scientist", type: "dir" },
      ];
    }
    if (this._currentPath[0] === "data") {
      return [
        { name: "datasets", type: "dir" },
        { name: "raw", type: "dir" },
        { name: "processed", type: "dir" },
      ];
    }
    return [];
  }

  private _demoSessions(): SessionLog[] {
    return [
      { id: "s1", agentId: "data-analyst", agentName: "Dr. Bayes", startedAt: "2026-03-17 06:30", duration: "12m", messageCount: 8, status: "completed" },
      { id: "s2", agentId: "biologist", agentName: "Dr. Gene", startedAt: "2026-03-16 22:15", duration: "25m", messageCount: 14, status: "completed" },
      { id: "s3", agentId: "ai-researcher", agentName: "Dr. Turing", startedAt: "2026-03-16 18:00", duration: "8m", messageCount: 5, status: "completed" },
    ];
  }

  private _demoJobs(): RecentJob[] {
    return [
      { id: "j1", title: "RNA-seq differential expression analysis", agent: "Dr. Gene", finishedAt: "2026-03-17 05:45", status: "success" },
      { id: "j2", title: "Dataset normalization pipeline", agent: "Dr. Bayes", finishedAt: "2026-03-16 23:10", status: "success" },
      { id: "j3", title: "Literature review — transformer architectures", agent: "Dr. Turing", finishedAt: "2026-03-16 19:30", status: "error" },
    ];
  }

  private _navigateDir(name: string) {
    this._currentPath = [...this._currentPath, name];
    this._loadFiles();
  }

  private _navigateTo(index: number) {
    this._currentPath = this._currentPath.slice(0, index);
    this._loadFiles();
  }

  private async _openFile(name: string) {
    const fullPath = this._currentPath.length > 0
      ? "~/AcaClaw/" + this._currentPath.join("/") + "/" + name
      : "~/AcaClaw/" + name;
    try {
      await gateway.call("acaclaw.workspace.open", { path: fullPath });
    } catch {
      // Browser fallback — show a notification
    }
  }

  private _formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  private _renderBreadcrumb() {
    return html`
      <div class="breadcrumb">
        <span class="breadcrumb-item" @click=${() => this._navigateTo(0)}>~/AcaClaw</span>
        ${this._currentPath.map((seg, i) => html`
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-item" @click=${() => this._navigateTo(i + 1)}>${seg}</span>
        `)}
      </div>
    `;
  }

  private _renderFiles() {
    const dirs = this._entries.filter(e => e.type === "dir").sort((a, b) => a.name.localeCompare(b.name));
    const files = this._entries.filter(e => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...dirs, ...files];

    if (sorted.length === 0) {
      return html`<div class="empty-state"><div class="empty-icon">📂</div>Empty folder</div>`;
    }

    return html`
      ${this._renderBreadcrumb()}
      <div class="file-list">
        ${this._currentPath.length > 0 ? html`
          <div class="file-row" @click=${() => this._navigateTo(this._currentPath.length - 1)}>
            <span class="file-icon">⬆️</span>
            <span class="file-name">..</span>
          </div>
        ` : nothing}
        ${sorted.map(entry => html`
          <div class="file-row" @click=${() => entry.type === "dir" ? this._navigateDir(entry.name) : this._openFile(entry.name)}>
            <span class="file-icon">${entry.type === "dir" ? "📁" : this._fileIcon(entry.name)}</span>
            <span class="file-name ${entry.type === "dir" ? "dir" : ""}">${entry.name}</span>
            <span class="file-meta file-size">${entry.size ? this._formatSize(entry.size) : ""}</span>
            <span class="file-meta file-modified">${entry.modified ?? ""}</span>
            ${entry.type === "file" ? html`
              <button class="file-open-btn" @click=${(e: Event) => { e.stopPropagation(); this._openFile(entry.name); }}>Open</button>
            ` : nothing}
          </div>
        `)}
      </div>
    `;
  }

  private _fileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const icons: Record<string, string> = {
      md: "📝", txt: "📄", py: "🐍", r: "📊", csv: "📊",
      json: "📋", yml: "⚙️", yaml: "⚙️", sh: "⚡",
      pdf: "📕", png: "🖼️", jpg: "🖼️", svg: "🎨",
      ipynb: "📓", html: "🌐", ts: "💠", js: "💛",
    };
    return icons[ext] ?? "📄";
  }

  private _renderSessions() {
    if (this._sessions.length === 0) {
      return html`<div class="empty-state"><div class="empty-icon">💬</div>No session history yet</div>`;
    }
    return html`
      <div class="file-list">
        ${this._sessions.map(s => html`
          <div class="session-row">
            <span class="session-agent">${s.agentName}</span>
            <span class="session-time">${s.startedAt}</span>
            <span class="session-msgs">${s.messageCount} messages</span>
            <span class="session-duration">${s.duration}</span>
            <span class="status-badge ${s.status}">${s.status}</span>
          </div>
        `)}
      </div>
    `;
  }

  private _renderJobs() {
    if (this._recentJobs.length === 0) {
      return html`<div class="empty-state"><div class="empty-icon">✅</div>No recent jobs</div>`;
    }
    return html`
      <div class="file-list">
        ${this._recentJobs.map(j => html`
          <div class="session-row">
            <span class="job-title">${j.title}</span>
            <span class="job-agent">${j.agent}</span>
            <span class="session-time">${j.finishedAt}</span>
            <span class="status-badge ${j.status}">${j.status === "success" ? "completed" : "failed"}">${j.status}</span>
          </div>
        `)}
      </div>
    `;
  }

  override render() {
    return html`
      <h1>Workspace</h1>
      <div class="subtitle">Browse files, view session history, and track recent jobs</div>

      <div class="tabs">
        <button class="tab ${this._activeTab === "files" ? "active" : ""}"
          @click=${() => { this._activeTab = "files"; }}>📂 Files</button>
        <button class="tab ${this._activeTab === "sessions" ? "active" : ""}"
          @click=${() => { this._activeTab = "sessions"; }}>💬 Sessions</button>
        <button class="tab ${this._activeTab === "jobs" ? "active" : ""}"
          @click=${() => { this._activeTab = "jobs"; }}>✅ Recent Jobs</button>
      </div>

      ${this._activeTab === "files" ? this._renderFiles() : nothing}
      ${this._activeTab === "sessions" ? this._renderSessions() : nothing}
      ${this._activeTab === "jobs" ? this._renderJobs() : nothing}
    `;
  }
}
