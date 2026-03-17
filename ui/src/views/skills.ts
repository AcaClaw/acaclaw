import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface Skill {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  disabled: boolean;
  eligible: boolean;
  install: Array<{ id: string; kind: string; label: string }>;
}

interface ClawHubSkill {
  name: string;
  description: string;
  author: string;
  category: string;
  recommended?: boolean;
}

/** AcaClaw curated skills available on ClawHub */
const CURATED_SKILLS: ClawHubSkill[] = [
  { name: "ai-humanizer", description: "Humanize AI-generated text to sound natural and authentic", author: "acaclaw", category: "Writing", recommended: true },
  { name: "paper-search", description: "Search arXiv, PubMed, Semantic Scholar, and CrossRef simultaneously", author: "acaclaw", category: "Research", recommended: true },
  { name: "citation-manager", description: "Format references in APA, Vancouver, Nature, and 9000+ citation styles", author: "acaclaw", category: "Research", recommended: true },
  { name: "data-analyst", description: "Statistical analysis from natural language — describe what you want, get results", author: "acaclaw", category: "Data Analysis", recommended: true },
  { name: "figure-generator", description: "Publication-quality plots and charts ready for journal submission", author: "acaclaw", category: "Data Analysis" },
  { name: "manuscript-assistant", description: "Draft, edit, and structure papers following journal guidelines", author: "acaclaw", category: "Writing" },
  { name: "grant-writer", description: "Structure and draft grant proposals following funder templates", author: "acaclaw", category: "Writing" },
  { name: "format-converter", description: "Convert between Word, PDF, LaTeX, and journal-specific templates", author: "acaclaw", category: "Documents" },
  { name: "presentation-maker", description: "Generate slides from research notes or paper content", author: "acaclaw", category: "Documents" },
];

@customElement("acaclaw-skills")
export class SkillsView extends LitElement {
  @state() private _tab: "installed" | "clawhub" = "installed";
  @state() private _installed: Skill[] = [];
  @state() private _searchQuery = "";
  @state() private _installing = "";
  @state() private _installLog: string[] = [];
  private _gatewayListener: EventListener | null = null;

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
      transition: color 0.15s;
    }
    .tab:hover {
      color: var(--ac-text);
    }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
      font-weight: 600;
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .search-input {
      flex: 1;
      padding: 8px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg-surface);
    }
    .search-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }

    .skill-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--ac-border);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      overflow: hidden;
      box-shadow: var(--ac-shadow-sm);
    }

    .skill-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: var(--ac-bg-surface);
    }

    .skill-info {
      flex: 1;
      min-width: 0;
    }
    .skill-name {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .skill-version {
      font-size: 12px;
      color: var(--ac-text-muted);
      font-weight: 400;
    }
    .skill-desc {
      font-size: 13px;
      color: var(--ac-text-secondary);
      margin-top: 2px;
    }
    .skill-meta {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 4px;
    }

    .skill-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .action-btn {
      padding: 6px 14px;
      border-radius: var(--ac-radius-full);
      font-size: 12px;
      font-weight: 500;
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }

    .update-btn {
      background: var(--ac-primary-bg);
      color: var(--ac-primary);
      border: 1px solid var(--ac-primary);
    }
    .update-btn:hover {
      background: var(--ac-primary);
      color: #fff;
      box-shadow: var(--ac-shadow-xs);
    }

    .disable-btn {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-text-secondary);
    }
    .disable-btn:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-secondary);
    }

    .install-btn {
      background: var(--ac-primary);
      color: #fff;
    }
    .install-btn:hover {
      background: var(--ac-primary-dark);
      box-shadow: var(--ac-shadow-xs);
      transform: translateY(-1px);
    }
    .install-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .recommended-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;
      border-radius: 10px;
    }

    .rating {
      font-size: 12px;
      color: var(--ac-text-secondary);
    }

    .footer-stats {
      margin-top: 16px;
      font-size: 12px;
      color: var(--ac-text-muted);
    }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--ac-text-muted);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    if (gateway.state === "connected") {
      this._loadSkills();
    }
    this._gatewayListener = ((e: CustomEvent) => {
      if (e.detail.state === "connected") this._loadSkills();
    }) as EventListener;
    gateway.addEventListener("state-change", this._gatewayListener);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._gatewayListener) {
      gateway.removeEventListener("state-change", this._gatewayListener);
      this._gatewayListener = null;
    }
  }

  private async _loadSkills() {
    try {
      const res = await gateway.call<{ skills: Skill[] }>("skills.status");
      if (res?.skills) {
        this._installed = res.skills;
      }
    } catch { /* gateway not ready — keep empty */ }
  }

  private async _installSkill(name: string, installId?: string) {
    this._installing = name;
    this._installLog = [];
    try {
      const params: Record<string, unknown> = { name };
      if (installId) params.installId = installId;
      await gateway.call("skills.install", params, { timeoutMs: 300_000 });
      this._installLog = [...this._installLog, `✓ ${name} installed`];
      await this._loadSkills();
    } catch (err) {
      this._installLog = [...this._installLog, `✗ Failed: ${err instanceof Error ? err.message : String(err)}`];
    }
    this._installing = "";
  }

  private async _toggleSkill(skillKey: string, enabled: boolean) {
    try {
      await gateway.call("skills.update", { skillKey, enabled });
      await this._loadSkills();
    } catch { /* ignore */ }
  }

  private _filteredInstalled(): Skill[] {
    if (!this._searchQuery) return this._installed;
    const q = this._searchQuery.toLowerCase();
    return this._installed.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }

  private _filteredClawHub(): ClawHubSkill[] {
    const installedNames = new Set(this._installed.map(s => s.name));
    const available = CURATED_SKILLS.filter(s => !installedNames.has(s.name));
    if (!this._searchQuery) return available;
    const q = this._searchQuery.toLowerCase();
    return available.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }

  override render() {
    return html`
      <h1>Skills</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "installed" ? "active" : ""}"
          @click=${() => { this._tab = "installed"; this._searchQuery = ""; }}
        >
          Installed (${this._installed.length})
        </div>
        <div
          class="tab ${this._tab === "clawhub" ? "active" : ""}"
          @click=${() => { this._tab = "clawhub"; this._searchQuery = ""; }}
        >
          ClawHub
        </div>
      </div>

      ${this._installLog.length > 0 ? html`
        <div style="margin-bottom: 16px; padding: 10px 14px; background: var(--ac-bg-surface); border: 1px solid var(--ac-border); border-radius: var(--ac-radius-sm); font-size: 12px; font-family: monospace; color: var(--ac-text-secondary)">
          ${this._installLog.map(l => html`<div>${l}</div>`)}
        </div>
      ` : ""}

      ${this._tab === "installed"
        ? this._renderInstalled()
        : this._renderClawHub()}
    `;
  }

  private _renderInstalled() {
    const skills = this._filteredInstalled();

    return html`
      <div class="search-bar">
        <input
          class="search-input"
          placeholder="Search installed skills…"
          .value=${this._searchQuery}
          @input=${(e: Event) =>
            (this._searchQuery = (e.target as HTMLInputElement).value)}
        />
      </div>

      ${skills.length === 0
        ? html`<div class="empty-state">No skills found</div>`
        : html`
            <div class="skill-list">
              ${skills.map(
                (s) => html`
                  <div class="skill-item">
                    <div class="skill-info">
                      <div class="skill-name">
                        ${s.name}
                        ${s.bundled
                          ? html`<span class="skill-version">bundled</span>`
                          : html`<span class="skill-version">${s.source}</span>`}
                      </div>
                      <div class="skill-desc">${s.description}</div>
                      <div class="skill-meta">
                        ${s.eligible
                          ? html`<span style="color: var(--ac-success)">✓ Eligible</span>`
                          : html`<span style="color: var(--ac-text-muted)">Not eligible</span>`}
                        ${s.disabled
                          ? html` · <span style="color: var(--ac-warning)">Disabled</span>`
                          : ""}
                      </div>
                    </div>
                    <div class="skill-actions">
                      ${s.bundled
                        ? html`<span
                            style="font-size: 11px; color: var(--ac-text-muted)"
                            >Bundled</span
                          >`
                        : html`<button
                            class="action-btn disable-btn"
                            @click=${() => this._toggleSkill(s.name, s.disabled)}
                          >
                            ${s.disabled ? "Enable" : "Disable"}
                          </button>`}
                    </div>
                  </div>
                `,
              )}
            </div>
            <div class="footer-stats">
              ${this._installed.length} skills installed ·
              ${this._installed.filter((s) => s.bundled).length} bundled
            </div>
          `}
    `;
  }

  private _renderClawHub() {
    const skills = this._filteredClawHub();

    return html`
      <div class="search-bar">
        <input
          class="search-input"
          placeholder="Search ClawHub…"
          .value=${this._searchQuery}
          @input=${(e: Event) =>
            (this._searchQuery = (e.target as HTMLInputElement).value)}
        />
      </div>

      ${skills.length === 0
        ? html`
            <div class="empty-state">
              <p>
                ${CURATED_SKILLS.length === 0
                  ? "No curated skills available."
                  : "All curated skills are already installed!"}
              </p>
            </div>
          `
        : html`
            <div class="skill-list">
              ${skills.map(
                (s) => html`
                  <div class="skill-item">
                    <div class="skill-info">
                      <div class="skill-name">
                        ${s.name}
                        ${s.recommended
                          ? html`<span class="recommended-badge"
                              >Recommended</span
                            >`
                          : ""}
                      </div>
                      <div class="skill-desc">${s.description}</div>
                      <div class="skill-meta">
                        By @${s.author} · ${s.category}
                      </div>
                    </div>
                    <div class="skill-actions">
                      <button
                        class="action-btn install-btn"
                        ?disabled=${this._installing === s.name}
                        @click=${() => this._installSkill(s.name)}
                      >
                        ${this._installing === s.name
                          ? "Installing…"
                          : "Install"}
                      </button>
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }
}
