import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

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

interface SnapshotEntry {
  time: string;
  size: string;
  sizeBytes: number;
  workspace: string;
}

@customElement("acaclaw-backup")
export class BackupView extends LitElement {
  private _lc = new LocaleController(this);
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
  @state() private _totalSize = "0 B";
  @state() private _fileCount = 0;
  @state() private _snapshotCount = 0;
  @state() private _snapshotSize = "0 B";
  @state() private _backupDir = "";
  @state() private _searchQuery = "";
  @state() private _restoring = "";
  @state() private _snapshots: SnapshotEntry[] = [];
  @state() private _snapshotting = false;
  @state() private _snapshotError = "";
  @state() private _snapshotSuccess = "";

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

    .snapshot-btn {
      padding: 10px 24px;
      background: var(--ac-primary);
      color: #fff;
      border: none;
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
    }
    .snapshot-btn:hover:not(:disabled) {
      opacity: 0.9;
      box-shadow: var(--ac-shadow-md);
    }
    .snapshot-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .snapshot-msg {
      margin-top: 12px;
      font-size: 13px;
      padding: 8px 14px;
      border-radius: var(--ac-radius-sm);
    }
    .snapshot-msg.success {
      background: var(--ac-success-bg, #ecfdf5);
      color: var(--ac-success, #059669);
    }
    .snapshot-msg.error {
      background: var(--ac-error-bg, #fef2f2);
      color: var(--ac-error, #dc2626);
    }
    .snapshot-list {
      margin-top: 20px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadBackups();
    this._loadSnapshots();
    gateway.addEventListener("state-change", this._handleGatewayState);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    gateway.removeEventListener("state-change", this._handleGatewayState);
  }

  private _handleGatewayState = (e: Event) => {
    if ((e as CustomEvent).detail?.state === "connected") {
      this._loadBackups();
      this._loadSnapshots();
    }
  };

  private async _loadBackups() {
    try {
      const res = await gateway.call<{
        backups: BackupEntry[];
        totalSize: string;
        fileCount: number;
        snapshotCount: number;
        snapshotSize: string;
        backupDir: string;
      }>("acaclaw.backup.list");
      if (res) {
        this._backups = res.backups ?? [];
        this._totalSize = res.totalSize ?? "0 B";
        this._fileCount = res.fileCount ?? 0;
        this._snapshotCount = res.snapshotCount ?? 0;
        this._snapshotSize = res.snapshotSize ?? "0 B";
        this._backupDir = res.backupDir ?? "";
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

  private async _loadSnapshots() {
    try {
      const res = await gateway.call<{ snapshots: SnapshotEntry[] }>("acaclaw.backup.snapshotList");
      if (res?.snapshots) this._snapshots = res.snapshots;
    } catch { /* gateway unavailable */ }
  }

  private async _createSnapshot() {
    this._snapshotting = true;
    this._snapshotError = "";
    this._snapshotSuccess = "";
    try {
      const res = await gateway.call<{ snapshotTime: string; archiveSize: number }>(
        "acaclaw.backup.snapshot",
      );
      if (res?.snapshotTime) {
        const sizeMB = ((res.archiveSize ?? 0) / 1024 / 1024).toFixed(1);
        this._snapshotSuccess = `Snapshot created (${sizeMB} MB)`;
        await this._loadSnapshots();
      }
    } catch (err) {
      this._snapshotError = err instanceof Error ? err.message : "Snapshot failed";
    }
    this._snapshotting = false;
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
      <h1>${t("backup.title")}</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "files" ? "active" : ""}"
          @click=${() => (this._tab = "files")}
        >
          ${t("backup.tab.files")}
        </div>
        <div
          class="tab ${this._tab === "trash" ? "active" : ""}"
          @click=${() => (this._tab = "trash")}
        >
          ${t("backup.tab.trash")}
        </div>
        <div
          class="tab ${this._tab === "snapshots" ? "active" : ""}"
          @click=${() => (this._tab = "snapshots")}
        >
          ${t("backup.tab.snapshots")}
        </div>
        <div
          class="tab ${this._tab === "settings" ? "active" : ""}"
          @click=${() => (this._tab = "settings")}
        >
          ${t("backup.tab.settings")}
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
      ${this._backupDir
        ? html`<div class="card" style="margin-bottom: 16px; padding: 12px 16px; font-size: 13px; color: var(--ac-text-secondary)">
            <strong>${t("backup.storage")}</strong> <code style="font-size: 12px; background: var(--ac-bg-secondary, #f3f4f6); padding: 2px 6px; border-radius: 4px">${this._backupDir}</code>
          </div>`
        : ""}
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">${t("backup.stat.totalStorage")}</div>
          <div class="stat-value">${this._totalSize}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t("backup.tab.files")}</div>
          <div class="stat-value">${this._fileCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t("backup.tab.snapshots")}</div>
          <div class="stat-value">${this._snapshotCount} (${this._snapshotSize})</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t("backup.stat.retention")}</div>
          <div class="stat-value">
            ${t("backup.stat.retentionDays", this._settings.retentionDays)}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="search-bar">
          <input
            class="search-input"
            placeholder=${t("backup.search")}
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
                ? t("backup.noMatch")
                : t("backup.noBackups")}
            </div>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>${t("backup.header.time")}</th>
                    <th>${t("backup.header.file")}</th>
                    <th>${t("backup.header.size")}</th>
                    <th>${t("backup.header.action")}</th>
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
                              ? t("backup.restoring")
                              : t("backup.restore")}
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
        <h2>${t("backup.tab.trash")}</h2>
        <p style="color: var(--ac-text-secondary); font-size: 13px; margin-bottom: 16px">
          ${t("backup.trash.desc", this._settings.trashAutoEmptyDays)}
        </p>
        <p style="font-size: 13px; margin-bottom: 16px">
          ${t("backup.trash.size")}
          <strong>${this._settings.trashSizeMB} MB</strong>
        </p>
        <button class="empty-trash-btn">${t("backup.emptyTrash")}</button>
      </div>
    `;
  }

  private _renderSnapshots() {
    return html`
      <div class="card">
        <h2>${t("backup.snapshots.title")}</h2>
        <p style="color: var(--ac-text-secondary); font-size: 13px; margin-bottom: 20px">
          ${t("backup.snapshots.desc")}
        </p>
        <button
          class="snapshot-btn"
          ?disabled=${this._snapshotting}
          @click=${() => this._createSnapshot()}
        >
          ${this._snapshotting ? t("backup.snapshots.creating") : t("backup.snapshots.backupNow")}
        </button>
        ${this._snapshotSuccess
          ? html`<div class="snapshot-msg success">${this._snapshotSuccess}</div>`
          : ""}
        ${this._snapshotError
          ? html`<div class="snapshot-msg error">${this._snapshotError}</div>`
          : ""}

        ${this._snapshots.length > 0
          ? html`
              <div class="snapshot-list">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">${t("backup.snapshots.previous")}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>${t("backup.header.time")}</th>
                      <th>${t("backup.header.size")}</th>
                      <th>${t("backup.snapshots.header.workspace")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this._snapshots.map(
                      (s) => html`
                        <tr>
                          <td>${new Date(s.time).toLocaleString()}</td>
                          <td>${s.size}</td>
                          <td>${s.workspace}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `
          : html`<div class="empty-state" style="padding: 20px 0">
              ${t("backup.snapshots.empty")}
            </div>`}
      </div>
    `;
  }

  private _renderSettings() {
    return html`
      <div class="card">
        <h2>${t("backup.settings.title")}</h2>

        <div class="form-group">
          <label class="form-label">${t("backup.settings.retention")}</label>
          <select class="form-select" .value=${String(this._settings.retentionDays)}>
            <option value="7">${t("backup.settings.days7")}</option>
            <option value="30">${t("backup.settings.days30")}</option>
            <option value="90">${t("backup.settings.days90")}</option>
            <option value="-1">${t("backup.settings.forever")}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${t("backup.settings.maxStorage")}</label>
          <select class="form-select" .value=${String(this._settings.maxStorageGB)}>
            <option value="1">1 GB</option>
            <option value="5">5 GB</option>
            <option value="10">10 GB</option>
            <option value="-1">${t("backup.settings.unlimited")}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-checkbox">
            <input type="checkbox" checked />
            ${t("backup.settings.syncChanges")}
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">${t("backup.settings.syncInterval")}</label>
          <select class="form-select" .value=${String(this._settings.syncIntervalMin)}>
            <option value="5">${t("backup.settings.min5")}</option>
            <option value="15">${t("backup.settings.min15")}</option>
            <option value="30">${t("backup.settings.min30")}</option>
            <option value="60">${t("backup.settings.min60")}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-checkbox">
            <input
              type="checkbox"
              ?checked=${this._settings.snapshotsEnabled}
            />
            ${t("backup.settings.enableSnapshots")}
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">${t("backup.settings.emptyTrash")}</label>
          <select class="form-select" .value=${String(this._settings.trashAutoEmptyDays)}>
            <option value="7">${t("backup.settings.days7")}</option>
            <option value="30">${t("backup.settings.days30")}</option>
            <option value="90">${t("backup.settings.days90")}</option>
            <option value="-1">${t("backup.settings.never")}</option>
          </select>
        </div>
      </div>
    `;
  }
}
