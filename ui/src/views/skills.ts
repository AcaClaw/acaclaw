import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

/** Skills from skills.json agent_required — bundled by gateway but installed via clawhub. */
const AGENT_REQUIRED_SKILLS = new Set(["nano-pdf", "xurl", "summarize", "humanizer"]);

/** A skill counts as user-installed if managed OR in the agent-required list. */
const isUserInstalled = (s: { name: string; source: string }) =>
  s.source !== "openclaw-bundled" || AGENT_REQUIRED_SKILLS.has(s.name);

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
  /** Gateway skill name when it differs from the clawhub slug. */
  gatewayName?: string;
}

/** AcaClaw curated skills available on ClawHub */
const CURATED_SKILLS: ClawHubSkill[] = [
  { name: "ai-humanizer", description: "Detect and remove AI-typical writing patterns", author: "clawhub", category: "Writing", recommended: true, gatewayName: "humanizer" },
  { name: "academic-deep-research", description: "Transparent, rigorous research across academic databases with audit trail", author: "clawhub", category: "Research", recommended: true },
  { name: "academic-citation-manager", description: "Format references in APA, Vancouver, Nature, and 9000+ styles", author: "clawhub", category: "Research", recommended: true },
  { name: "data-analyst", description: "Data visualisation, reports, SQL, spreadsheets", author: "clawhub", category: "Data Analysis", recommended: true },
  { name: "mermaid", description: "Generate diagrams (flowcharts, sequence, class) from text", author: "clawhub", category: "Data Analysis" },
  { name: "academic-writing", description: "Expert agent for scholarly papers, literature reviews, methodology", author: "clawhub", category: "Writing" },
  { name: "literature-review", description: "Structured literature reviews with synthesis and gap analysis", author: "clawhub", category: "Research" },
  { name: "pandoc-convert-openclaw", description: "Convert between Word, PDF, LaTeX, and Markdown via Pandoc", author: "clawhub", category: "Documents", gatewayName: "pandoc-convert" },
  { name: "autonomous-research", description: "Multi-step independent research for qualitative or quantitative studies", author: "clawhub", category: "Research" },
];

@customElement("acaclaw-skills")
export class SkillsView extends LitElement {
  @state() private _tab: "installed" | "clawhub" = "installed";
  @state() private _installed: Skill[] = [];
  @state() private _searchQuery = "";
  @state() private _installing = "";
  @state() private _installLog: string[] = [];
  @state() private _searchResults: ClawHubSkill[] | null = null;
  @state() private _searching = false;
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;
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
      align-items: center;
    }
    .searching-indicator {
      color: var(--ac-text-muted);
      font-size: 12px;
      white-space: nowrap;
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

    .skill-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .skill-card {
      display: flex;
      flex-direction: column;
      padding: 20px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      box-shadow: var(--ac-shadow-sm);
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .skill-card:hover {
      box-shadow: var(--ac-shadow-md, 0 4px 12px rgba(0,0,0,0.08));
      border-color: var(--ac-primary-bg, #dbeafe);
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
      margin-top: 6px;
      line-height: 1.4;
    }
    .skill-meta {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 8px;
    }

    .skill-actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
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

  private async _installSkill(name: string) {
    this._installing = name;
    this._installLog = [`▶ Installing "${name}" from ClawHub…`];

    const unsub = gateway.onNotification("acaclaw.skill.install.progress", (data: unknown) => {
      const d = data as { slug?: string; line?: string };
      if (d?.slug === name && d?.line) {
        this._installLog = [...this._installLog, d.line];
      }
    });

    try {
      const res = await gateway.call<{ ok: boolean; slug: string; installed?: boolean; alreadyExists?: boolean }>(
        "acaclaw.skill.install",
        { slug: name },
        { timeoutMs: 120_000 },
      );
      if (res?.alreadyExists) {
        this._installLog = [...this._installLog, `✓ "${name}" is already installed`];
      } else if (res?.installed) {
        this._installLog = [...this._installLog, `✓ "${name}" installed successfully`];
      }
      await this._loadSkills();
    } catch (err) {
      this._installLog = [...this._installLog, `✗ Failed: ${err instanceof Error ? err.message : String(err)}`];
    } finally {
      unsub();
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
    const sorted = [...this._installed].sort((a, b) => {
      const aUser = isUserInstalled(a) ? 0 : 1;
      const bUser = isUserInstalled(b) ? 0 : 1;
      return aUser - bUser || a.name.localeCompare(b.name);
    });
    if (!this._searchQuery) return sorted;
    const q = this._searchQuery.toLowerCase();
    return sorted.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }

  private _filteredClawHub(): ClawHubSkill[] {
    const installedNames = new Set(this._installed.map(s => s.name));
    const isInstalled = (s: ClawHubSkill) => installedNames.has(s.name) || (s.gatewayName && installedNames.has(s.gatewayName));
    // If we have API search results, show those (excluding already-installed)
    if (this._searchResults !== null) {
      return this._searchResults.filter(s => !isInstalled(s));
    }
    // Default: show curated list
    const available = CURATED_SKILLS.filter(s => !isInstalled(s));
    if (!this._searchQuery) return available;
    const q = this._searchQuery.toLowerCase();
    return available.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }

  private async _searchClawHub(query: string) {
    if (!query.trim()) {
      this._searchResults = null;
      return;
    }
    this._searching = true;
    try {
      const res = await gateway.call<{ results: Array<{ slug: string; name: string; score: number }> }>(
        "acaclaw.skill.search", { query: query.trim(), limit: 20 }, { timeoutMs: 15_000 },
      );
      this._searchResults = (res?.results ?? []).map(r => ({
        name: r.slug,
        description: r.name,
        author: "clawhub",
        category: "",
      }));
    } catch (err) {
      console.error("[clawhub-search] error:", err);
      // Fall back to local filtering
      this._searchResults = null;
    } finally {
      this._searching = false;
    }
  }

  override render() {
    return html`
      <h1>Skills</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "installed" ? "active" : ""}"
          @click=${() => { this._tab = "installed"; this._searchQuery = ""; }}
        >
          Installed (${this._installed.filter(isUserInstalled).length})
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
            <div class="skill-grid">
              ${skills.map(
                (s) => html`
                  <div class="skill-card">
                    <div class="skill-info">
                      <div class="skill-name">
                        ${s.name}
                        ${isUserInstalled(s)
                          ? html`<span class="skill-version">installed</span>`
                          : html`<span class="skill-version">bundled</span>`}
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
                      ${!isUserInstalled(s)
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
              ${this._installed.filter(isUserInstalled).length} installed ·
              ${this._installed.filter((s) => !isUserInstalled(s)).length} bundled ·
              ${this._installed.filter((s) => s.eligible).length} eligible
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
          @input=${(e: Event) => {
            this._searchQuery = (e.target as HTMLInputElement).value;
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => this._searchClawHub(this._searchQuery), 500);
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              if (this._searchDebounce) clearTimeout(this._searchDebounce);
              this._searchClawHub(this._searchQuery);
            }
          }}
        />
        ${this._searching ? html`<span class="searching-indicator">Searching…</span>` : ""}
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
            <div class="skill-grid">
              ${skills.map(
                (s) => html`
                  <div class="skill-card">
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
