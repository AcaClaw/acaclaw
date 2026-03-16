import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface BackupEntry {
  time: string;
  file: string;
  size: string;
  date: string;
}

interface BackupSettings {
  retentionDays: number;
  maxStorageGB: number;
  syncIntervalMin: number;
  snapshotsEnabled: boolean;
  trashAutoEmptyDays: number;
  trashSizeMB: number;
}

@customElement("acaclaw-backup")
export class BackupView extends LitElement {
  @state() private _tab: "files" | "trash" | "snapshots" | "settings" =
    "files";
  @state() private _backups: BackupEntry[] = [];
  @state() private _settings: BackupSettings = {
    retentionDays: 30,
    maxStorageGB: 5,
    syncIntervalMin: 15,
    snapshotsEnabled: false,
    trashAutoEmptyDays: 30,
    trashSizeMB: 0,
  };
  @state() private _totalSizeMB = 0;
  @state() private _fileCount = 0;
  @state() private _searchQuery = "";
  @state() private _restoring = "";

  static override styles = css`
    :host {
      display: block;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 24px;
      color: var(--ac-text);
    }

    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--ac-border);
    }
    .tab {
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .tab:hover {
      color: var(--ac-text);
    }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
      font-weight: 600;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      padding: 20px;
      box-shadow: var(--ac-shadow-sm);
      transition: box-shadow var(--ac-transition);
    }
    .stat-card:hover {
      box-shadow: var(--ac-shadow-md);
    }
    .stat-label {
      font-size: 12px;
      color: var(--ac-text-secondary);
      font-weight: 500;
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      margin-top: 4px;
      letter-spacing: -0.02em;
    }

    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02), 0 0 0 1px rgba(0,0,0,0.02);
      transition: all var(--ac-transition);
    }
    .card h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--ac-text);
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }

    .search-bar {
      margin-bottom: 16px;
    }
    .search-input {
      width: 100%;
      padding: 8px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg);
    }
    .search-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: var(--ac-text-secondary);
      padding: 10px 12px;
      border-bottom: 1px solid var(--ac-border);
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--ac-border);
      font-size: 13px;
    }
    tr:last-child td {
      border-bottom: none;
    }

    .restore-btn {
      padding: 4px 12px;
      background: var(--ac-primary-bg);
      border: 1px solid var(--ac-primary);
      border-radius: var(--ac-radius-full);
      color: var(--ac-primary);
      font-size: 12px;
      font-weight: 500;
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }
    .restore-btn:hover {
      background: var(--ac-primary);
      color: #fff;
      box-shadow: var(--ac-shadow-xs);
    }
    .restore-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .date-group {
      font-size: 12px;
      font-weight: 600;
      color: var(--ac-text-muted);
      padding: 12px 0 4px;
    }

    /* Settings form */
    .form-group {
      margin-bottom: 20px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .form-select {
      padding: 8px 12px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg);
      min-width: 200px;
      box-shadow: var(--ac-shadow-xs);
      transition: border-color var(--ac-transition-fast), box-shadow var(--ac-transition-fast);
    }
    .form-select:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }
    .form-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .form-checkbox input {
      width: 16px;
      height: 16px;
      accent-color: var(--ac-primary);
    }

    .empty-trash-btn {
      padding: 8px 16px;
      background: var(--ac-error);
      color: #fff;
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      font-weight: 500;
    }
    .empty-trash-btn:hover {
      opacity: 0.9;
    }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--ac-text-muted);
      font-size: 13px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadBackups();
  }

  private async _loadBackups() {
    try {
      const res = await gateway.call<{
        backups: BackupEntry[];
        totalSizeMB: number;
        fileCount: number;
      }>("acaclaw.backup.list");
      if (res) {
        this._backups = res.backups ?? [];
        this._totalSizeMB = res.totalSizeMB ?? 0;
        this._fileCount = res.fileCount ?? 0;
      }
    } catch {
      // Gateway unavailable
    }
  }

  private async _restore(file: string) {
    this._restoring = file;
    try {
      await gateway.call("acaclaw.backup.restore", { file });
    } catch {
      // handle error
    }
    this._restoring = "";
  }

  private _filteredBackups(): BackupEntry[] {
    if (!this._searchQuery) return this._backups;
    const q = this._searchQuery.toLowerCase();
    return this._backups.filter((b) =>
      b.file.toLowerCase().includes(q),
    );
  }

  override render() {
    return html`
      <h1>Backup</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "files" ? "active" : ""}"
          @click=${() => (this._tab = "files")}
        >
          File Backups
        </div>
        <div
          class="tab ${this._tab === "trash" ? "active" : ""}"
          @click=${() => (this._tab = "trash")}
        >
          Trash
        </div>
        <div
          class="tab ${this._tab === "snapshots" ? "active" : ""}"
          @click=${() => (this._tab = "snapshots")}
        >
          Snapshots
        </div>
        <div
          class="tab ${this._tab === "settings" ? "active" : ""}"
          @click=${() => (this._tab = "settings")}
        >
          Settings
        </div>
      </div>

      ${this._tab === "files" ? this._renderFiles() : ""}
      ${this._tab === "trash" ? this._renderTrash() : ""}
      ${this._tab === "snapshots" ? this._renderSnapshots() : ""}
      ${this._tab === "settings" ? this._renderSettings() : ""}
    `;
  }

  private _renderFiles() {
    const backups = this._filteredBackups();

    return html`
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">Total Size</div>
          <div class="stat-value">${this._totalSizeMB} MB</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Files Backed Up</div>
          <div class="stat-value">${this._fileCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Retention</div>
          <div class="stat-value">
            ${this._settings.retentionDays} days
          </div>
        </div>
      </div>

      <div class="card">
        <div class="search-bar">
          <input
            class="search-input"
            placeholder="Search backed up files…"
            .value=${this._searchQuery}
            @input=${(e: Event) =>
              (this._searchQuery = (
                e.target as HTMLInputElement
              ).value)}
          />
        </div>
        ${backups.length === 0
          ? html`<div class="empty-state">
              ${this._searchQuery
                ? "No files match your search"
                : "No backups yet. Files are automatically backed up when modified by the AI."}
            </div>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>File</th>
                    <th>Size</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${backups.map(
                    (b) => html`
                      <tr>
                        <td>${b.time}</td>
                        <td>${b.file}</td>
                        <td>${b.size}</td>
                        <td>
                          <button
                            class="restore-btn"
                            ?disabled=${this._restoring === b.file}
                            @click=${() => this._restore(b.file)}
                          >
                            ${this._restoring === b.file
                              ? "Restoring…"
                              : "Restore"}
                          </button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </div>
    `;
  }

  private _renderTrash() {
    return html`
      <div class="card">
        <h2>Trash</h2>
        <p style="color: var(--ac-text-secondary); font-size: 13px; margin-bottom: 16px">
          Deleted files are kept for
          ${this._settings.trashAutoEmptyDays} days before permanent
          removal.
        </p>
        <p style="font-size: 13px; margin-bottom: 16px">
          Current trash size:
          <strong>${this._settings.trashSizeMB} MB</strong>
        </p>
        <button class="empty-trash-btn">Empty Trash Now</button>
      </div>
    `;
  }

  private _renderSnapshots() {
    return html`
      <div class="card">
        <h2>Workspace Snapshots</h2>
        <p style="color: var(--ac-text-secondary); font-size: 13px">
          ${this._settings.snapshotsEnabled
            ? "Full workspace snapshots are enabled."
            : "Workspace snapshots are disabled. Enable them in Settings to create periodic full copies of your workspace."}
        </p>
      </div>
    `;
  }

  private _renderSettings() {
    return html`
      <div class="card">
        <h2>Backup Settings</h2>

        <div class="form-group">
          <label class="form-label">Keep file backups for</label>
          <select class="form-select" .value=${String(this._settings.retentionDays)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="-1">Forever</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Maximum backup storage</label>
          <select class="form-select" .value=${String(this._settings.maxStorageGB)}>
            <option value="1">1 GB</option>
            <option value="5">5 GB</option>
            <option value="10">10 GB</option>
            <option value="-1">Unlimited</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-checkbox">
            <input type="checkbox" checked />
            Sync workspace changes periodically
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">Sync interval</label>
          <select class="form-select" .value=${String(this._settings.syncIntervalMin)}>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-checkbox">
            <input
              type="checkbox"
              ?checked=${this._settings.snapshotsEnabled}
            />
            Enable full workspace snapshots
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">Empty trash after</label>
          <select class="form-select" .value=${String(this._settings.trashAutoEmptyDays)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="-1">Never</option>
          </select>
        </div>
      </div>
    `;
  }
}
