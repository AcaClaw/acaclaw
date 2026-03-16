import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface Skill {
  name: string;
  version: string;
  description: string;
  source: string;
  category: string;
  updateAvailable?: string;
  enabled: boolean;
  bundled?: boolean;
}

interface ClawHubSkill {
  name: string;
  description: string;
  author: string;
  category: string;
  rating: number;
  users: number;
  recommended?: boolean;
}

@customElement("acaclaw-skills")
export class SkillsView extends LitElement {
  @state() private _tab: "installed" | "clawhub" = "installed";
  @state() private _installed: Skill[] = [];
  @state() private _clawhub: ClawHubSkill[] = [];
  @state() private _searchQuery = "";
  @state() private _installing = "";

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
    this._loadSkills();
  }

  private async _loadSkills() {
    try {
      const res = await gateway.call<{ skills: Skill[] }>("skills.status");
      if (res?.skills) {
        this._installed = res.skills;
      }
    } catch {
      // Default demo data for when gateway isn't running
      this._installed = [
        {
          name: "paper-search",
          version: "1.2.0",
          description: "Search arXiv, PubMed, Semantic Scholar, CrossRef",
          source: "ClawHub",
          category: "Core Academic",
          enabled: true,
        },
        {
          name: "data-analyst",
          version: "2.0.1",
          description: "Statistical analysis from natural language",
          source: "ClawHub",
          category: "Core Academic",
          enabled: true,
        },
        {
          name: "citation-manager",
          version: "1.0.0",
          description:
            "Format references in APA, Vancouver, Nature, etc.",
          source: "ClawHub",
          category: "Core Academic",
          enabled: true,
        },
        {
          name: "nano-pdf",
          version: "bundled",
          description: "Read and extract text from PDF files",
          source: "OpenClaw",
          category: "Foundation",
          enabled: true,
          bundled: true,
        },
      ];
    }
  }

  private async _installSkill(name: string) {
    this._installing = name;
    try {
      await gateway.call("skills.install", { name });
      await this._loadSkills();
    } catch {
      // handle error
    }
    this._installing = "";
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

  override render() {
    return html`
      <h1>Skills</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "installed" ? "active" : ""}"
          @click=${() => (this._tab = "installed")}
        >
          Installed
        </div>
        <div
          class="tab ${this._tab === "clawhub" ? "active" : ""}"
          @click=${() => (this._tab = "clawhub")}
        >
          ClawHub
        </div>
      </div>

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
                        <span class="skill-version"
                          >${s.version}</span
                        >
                      </div>
                      <div class="skill-desc">${s.description}</div>
                      <div class="skill-meta">
                        Source: ${s.source} · Category:
                        ${s.category}
                      </div>
                    </div>
                    <div class="skill-actions">
                      ${s.updateAvailable
                        ? html`<button class="action-btn update-btn">
                            Update to ${s.updateAvailable}
                          </button>`
                        : html`<span
                            style="font-size: 12px; color: var(--ac-success)"
                            >✓ Up to date</span
                          >`}
                      ${s.bundled
                        ? html`<span
                            style="font-size: 11px; color: var(--ac-text-muted)"
                            >Bundled</span
                          >`
                        : html`<button class="action-btn disable-btn">
                            ${s.enabled ? "Disable" : "Enable"}
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

      ${this._clawhub.length === 0
        ? html`
            <div class="empty-state">
              <p>
                Connect to the gateway to browse ClawHub skills, or
                install skills via CLI:
              </p>
              <code
                style="display: block; margin-top: 8px; color: var(--ac-text-secondary)"
                >clawhub install &lt;skill-name&gt;</code
              >
            </div>
          `
        : html`
            <div class="skill-list">
              ${this._clawhub.map(
                (s) => html`
                  <div class="skill-item">
                    <div class="skill-info">
                      <div class="skill-name">
                        ${s.name}
                        ${s.recommended
                          ? html`<span class="recommended-badge"
                              >🏷️ Recommended</span
                            >`
                          : ""}
                      </div>
                      <div class="skill-desc">${s.description}</div>
                      <div class="skill-meta">
                        By @${s.author} · ${s.category} ·
                        <span class="rating"
                          >★ ${s.rating.toFixed(1)}
                          (${s.users} users)</span
                        >
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
