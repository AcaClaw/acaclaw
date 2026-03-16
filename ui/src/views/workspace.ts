import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface CondaPackage {
  name: string;
  version: string;
  channel: string;
  requiredBy: string;
}

interface Environment {
  name: string;
  python: string;
  rVersion: string;
  condaVersion: string;
  path: string;
  sizeGB: number;
  packages: CondaPackage[];
  active: boolean;
}

@customElement("acaclaw-workspace")
export class WorkspaceView extends LitElement {
  @state() private _environments: Environment[] = [];
  @state() private _activeEnv: Environment | null = null;
  @state() private _searchQuery = "";
  @state() private _installingR = false;
  @state() private _addingDiscipline = "";

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

    .env-header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .env-field {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
    }
    .env-field .label {
      color: var(--ac-text-secondary);
    }
    .env-field .value {
      font-weight: 500;
    }

    .install-r-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
    .install-r-btn:hover {
      background: var(--ac-primary);
      color: #fff;
      box-shadow: var(--ac-shadow-xs);
    }
    .install-r-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
      padding: 8px 12px;
      border-bottom: 1px solid var(--ac-border);
      font-size: 13px;
    }
    tr:last-child td {
      border-bottom: none;
    }

    .env-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .env-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      box-shadow: var(--ac-shadow-xs);
    }
    .env-item:hover {
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-sm);
      transform: translateY(-1px);
    }
    .env-item.active {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
      box-shadow: 0 0 0 2px var(--ac-primary-bg), var(--ac-shadow-xs);
    }
    .env-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .env-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ac-text-muted);
    }
    .env-indicator.active {
      background: var(--ac-success);
      box-shadow: 0 0 0 3px var(--ac-success-bg);
    }
    .env-name {
      font-weight: 500;
      font-size: 14px;
    }
    .env-size {
      font-size: 12px;
      color: var(--ac-text-muted);
    }
    .env-badge {
      font-size: 11px;
      color: var(--ac-primary);
      font-weight: 500;
    }

    .discipline-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .discipline-btn {
      padding: 8px 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 500;
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }
    .discipline-btn:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      transform: translateY(-1px);
    }
    .discipline-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .pkg-count {
      font-size: 12px;
      color: var(--ac-text-muted);
      margin-top: 12px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadEnvironments();
  }

  private async _loadEnvironments() {
    try {
      const res = await gateway.call<{
        environments: Environment[];
      }>("acaclaw.env.list");
      if (res?.environments) {
        this._environments = res.environments;
        this._activeEnv =
          res.environments.find((e) => e.active) ?? null;
      }
    } catch {
      // Show placeholder
      this._activeEnv = {
        name: "acaclaw",
        python: "3.12.8",
        rVersion: "not installed",
        condaVersion: "Miniforge 24.11",
        path: "~/.acaclaw/miniforge3/envs/acaclaw",
        sizeGB: 1.4,
        packages: [],
        active: true,
      };
      this._environments = [this._activeEnv];
    }
  }

  private async _installR() {
    this._installingR = true;
    try {
      await gateway.call("acaclaw.env.install", {
        packages: ["r-base", "r-irkernel"],
      });
      await this._loadEnvironments();
    } catch {
      // handle error
    }
    this._installingR = false;
  }

  private async _addDiscipline(discipline: string) {
    this._addingDiscipline = discipline;
    try {
      await gateway.call("acaclaw.env.install", { discipline });
      await this._loadEnvironments();
    } catch {
      // handle error
    }
    this._addingDiscipline = "";
  }

  private async _switchEnv(name: string) {
    try {
      await gateway.call("acaclaw.env.activate", { name });
      await this._loadEnvironments();
    } catch {
      // handle error
    }
  }

  private _filteredPackages(): CondaPackage[] {
    const pkgs = this._activeEnv?.packages ?? [];
    if (!this._searchQuery) return pkgs;
    const q = this._searchQuery.toLowerCase();
    return pkgs.filter((p) => p.name.toLowerCase().includes(q));
  }

  override render() {
    const env = this._activeEnv;

    return html`
      <h1>Environment</h1>

      <!-- Active Environment -->
      <div class="card">
        <h2>Active Environment</h2>
        ${env
          ? html`
              <div class="env-header">
                <div>
                  <div class="env-field">
                    <span class="label">Name</span>
                    <span class="value">${env.name}</span>
                  </div>
                  <div class="env-field">
                    <span class="label">Python</span>
                    <span class="value">${env.python}</span>
                  </div>
                  <div class="env-field">
                    <span class="label">R</span>
                    <span class="value">
                      ${env.rVersion === "not installed"
                        ? html`${env.rVersion}
                            <button
                              class="install-r-btn"
                              ?disabled=${this._installingR}
                              @click=${this._installR}
                            >
                              ${this._installingR
                                ? "Installing…"
                                : "Install R"}
                            </button>`
                        : env.rVersion}
                    </span>
                  </div>
                </div>
                <div>
                  <div class="env-field">
                    <span class="label">Conda</span>
                    <span class="value">${env.condaVersion}</span>
                  </div>
                  <div class="env-field">
                    <span class="label">Path</span>
                    <span class="value">${env.path}</span>
                  </div>
                  <div class="env-field">
                    <span class="label">Size</span>
                    <span class="value"
                      >${env.sizeGB.toFixed(1)} GB</span
                    >
                  </div>
                </div>
              </div>
            `
          : html`<p
              style="color: var(--ac-text-muted); font-size: 13px"
            >
              No environment detected
            </p>`}
      </div>

      <!-- Installed Packages -->
      <div class="card">
        <h2>Installed Packages (${this._activeEnv?.packages.length ?? 0})</h2>
        <div class="search-bar">
          <input
            class="search-input"
            placeholder="Search packages…"
            .value=${this._searchQuery}
            @input=${(e: Event) =>
              (this._searchQuery = (
                e.target as HTMLInputElement
              ).value)}
          />
        </div>
        ${this._filteredPackages().length === 0
          ? html`<p
              style="color: var(--ac-text-muted); font-size: 13px"
            >
              ${this._searchQuery
                ? "No packages match your search"
                : "Connect to the gateway to view packages"}
            </p>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Version</th>
                    <th>Channel</th>
                    <th>Required by</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._filteredPackages().map(
                    (p) => html`
                      <tr>
                        <td>${p.name}</td>
                        <td>${p.version}</td>
                        <td>${p.channel}</td>
                        <td>${p.requiredBy}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </div>

      <!-- Other Environments -->
      <div class="card">
        <h2>Environments</h2>
        <div class="env-list">
          ${this._environments.map(
            (e) => html`
              <div
                class="env-item ${e.active ? "active" : ""}"
                @click=${() => this._switchEnv(e.name)}
              >
                <div class="env-item-left">
                  <div
                    class="env-indicator ${e.active ? "active" : ""}"
                  ></div>
                  <span class="env-name">${e.name}</span>
                  <span class="env-size">${e.sizeGB.toFixed(1)} GB</span>
                </div>
                ${e.active
                  ? html`<span class="env-badge">Active</span>`
                  : ""}
              </div>
            `,
          )}
        </div>
      </div>

      <!-- Add Discipline -->
      <div class="card">
        <h2>Add Discipline</h2>
        <div class="discipline-actions">
          ${["biology", "chemistry", "medicine", "physics"].map(
            (d) => html`
              <button
                class="discipline-btn"
                ?disabled=${this._addingDiscipline === d}
                @click=${() => this._addDiscipline(d)}
              >
                ${this._addingDiscipline === d
                  ? "Installing…"
                  : `+ ${d.charAt(0).toUpperCase() + d.slice(1)}`}
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }
}
