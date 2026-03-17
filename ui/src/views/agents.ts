import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

export interface AcademicAgent {
  id: string;
  icon: string;
  name: string;
  role: string;
  discipline: string;
  condaEnv: string;
  description: string;
}

export const ACADEMIC_AGENTS: AcademicAgent[] = [
  {
    id: "biologist",
    icon: "\u{1F9EC}",
    name: "Dr. Gene",
    role: "Computational Biologist",
    discipline: "Biology",
    condaEnv: "aca-bio",
    description: "Genomics, sequence analysis, phylogenetics, RNA-seq, pathway enrichment",
  },
  {
    id: "medscientist",
    icon: "\u{1F3E5}",
    name: "Dr. Curie",
    role: "Medical Scientist",
    discipline: "Medicine",
    condaEnv: "aca-med",
    description: "Clinical trials, survival analysis, epidemiology, medical imaging",
  },
  {
    id: "ai-researcher",
    icon: "\u{1F916}",
    name: "Dr. Turing",
    role: "AI Researcher",
    discipline: "AI / Machine Learning",
    condaEnv: "aca-ai",
    description: "Deep learning, NLP, computer vision, model training, arxiv search",
  },
  {
    id: "data-analyst",
    icon: "\u{1F4CA}",
    name: "Dr. Bayes",
    role: "Data Analyst",
    discipline: "Statistics",
    condaEnv: "aca-data",
    description: "Pandas, R/tidyverse, visualization, hypothesis testing, EDA",
  },
  {
    id: "cs-scientist",
    icon: "\u{1F4BB}",
    name: "Dr. Knuth",
    role: "Computer Scientist",
    discipline: "Computer Science",
    condaEnv: "aca-cs",
    description: "Algorithm design, systems programming, code review, architecture",
  },
];

@customElement("acaclaw-agents")
export class AgentsView extends LitElement {
  @state() private _agentStatus: Record<string, "idle" | "working" | "starting"> = {};

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

    .btn-start-all {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      background: var(--ac-primary);
      border: none;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .btn-start-all:hover {
      background: var(--ac-primary-dark);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
    }

    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02), 0 0 0 1px rgba(0,0,0,0.02);
    }

    .card-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ac-text);
      margin-bottom: 8px;
    }

    .card-subtitle {
      font-size: 14px;
      color: var(--ac-text-secondary);
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .agents-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 16px;
    }

    .agent-card {
      background: #fafafa;
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      transition: all var(--ac-transition-fast);
    }
    .agent-card:hover {
      border-color: var(--ac-primary);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
      transform: translateY(-2px);
    }

    .agent-header {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 20px;
    }

    .agent-avatar {
      width: 64px;
      height: 64px;
      background: #ffffff;
      border: 1px solid var(--ac-border);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }

    .agent-identity {
      flex: 1;
      min-width: 0;
    }

    .agent-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ac-text);
      margin-bottom: 2px;
    }

    .agent-role {
      font-size: 12px;
      color: var(--ac-text-secondary);
      line-height: 1.4;
    }

    .kv-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .kv-row:last-child {
      margin-bottom: 0;
    }

    .kv-label {
      width: 90px;
      flex-shrink: 0;
      color: var(--ac-text-muted);
      font-weight: 500;
    }

    .kv-value {
      flex: 1;
      color: var(--ac-text);
      font-weight: 600;
      line-height: 1.5;
      word-break: break-word;
    }

    .kv-value.secondary {
      font-weight: 500;
      color: var(--ac-text-secondary);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .status-badge.idle {
      background: #f1f5f9;
      color: #64748b;
    }
    .status-badge.working {
      background: #dcfce7;
      color: #16a34a;
    }
    .status-badge.starting {
      background: #fef3c7;
      color: #d97706;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .status-dot.idle { background: #94a3b8; }
    .status-dot.working { background: #16a34a; }
    .status-dot.starting { background: #d97706; }

    .agent-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--ac-border-subtle);
    }

    .btn-agent {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--ac-radius-full);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      border: none;
    }

    .btn-start {
      background: var(--ac-primary);
      color: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .btn-start:hover {
      background: var(--ac-primary-dark);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }
    .btn-start:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-chat {
      background: var(--ac-bg-surface);
      color: var(--ac-text);
      border: 1px solid var(--ac-border);
    }
    .btn-chat:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-muted);
    }

    .architecture-card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px 32px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .arch-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--ac-text);
      margin-bottom: 12px;
    }

    .arch-desc {
      font-size: 13px;
      color: var(--ac-text-secondary);
      line-height: 1.6;
    }

    @media (max-width: 1024px) {
      .agents-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 640px) {
      .agents-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  private _getStatus(agentId: string): "idle" | "working" | "starting" {
    return this._agentStatus[agentId] ?? "idle";
  }

  private _startAgent(agentId: string) {
    this._agentStatus = { ...this._agentStatus, [agentId]: "starting" };
    setTimeout(() => {
      this._agentStatus = { ...this._agentStatus, [agentId]: "working" };
      this._openAgentChat(agentId);
    }, 800);
  }

  private _openAgentChat(agentId: string) {
    this.dispatchEvent(
      new CustomEvent("open-agent-chat", {
        detail: { agentId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _startAll() {
    for (const agent of ACADEMIC_AGENTS) {
      if (this._getStatus(agent.id) === "idle") {
        this._agentStatus = { ...this._agentStatus, [agent.id]: "starting" };
      }
    }
    setTimeout(() => {
      const updated: Record<string, "idle" | "working" | "starting"> = {};
      for (const agent of ACADEMIC_AGENTS) {
        updated[agent.id] = "working";
      }
      this._agentStatus = updated;
    }, 1000);
  }

  override render() {
    const activeCount = ACADEMIC_AGENTS.filter(
      (a) => this._getStatus(a.id) !== "idle"
    ).length;

    return html`
      <div class="header-row">
        <div>
          <h1>Digital Life Agents</h1>
          <div class="subtitle">
            ${activeCount} of ${ACADEMIC_AGENTS.length} agents active
            \u2014 each agent has its own persona, skills, and workspace
          </div>
        </div>
        <button class="btn-start-all" @click=${this._startAll}>
          \u25B6 Start All Agents
        </button>
      </div>

      <div class="card">
        <div class="card-title">Academic Agent Roster</div>
        <div class="card-subtitle">
          Five specialized digital life agents, each with a unique discipline,
          Conda environment, and behavioral persona. Start an agent to open its
          dedicated chat tab.
        </div>

        <div class="agents-grid">
          ${ACADEMIC_AGENTS.map((agent) => {
            const status = this._getStatus(agent.id);
            return html`
              <div class="agent-card">
                <div class="agent-header">
                  <div class="agent-avatar">${agent.icon}</div>
                  <div class="agent-identity">
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-role">${agent.role}</div>
                  </div>
                </div>

                <div class="kv-row">
                  <div class="kv-label">Status</div>
                  <div class="kv-value">
                    <span class="status-badge ${status}">
                      <span class="status-dot ${status}"></span>
                      ${status}
                    </span>
                  </div>
                </div>

                <div class="kv-row">
                  <div class="kv-label">Discipline</div>
                  <div class="kv-value">${agent.discipline}</div>
                </div>

                <div class="kv-row">
                  <div class="kv-label">Env</div>
                  <div class="kv-value">
                    <code>${agent.condaEnv}</code>
                  </div>
                </div>

                <div class="kv-row">
                  <div class="kv-label">Expertise</div>
                  <div class="kv-value secondary">${agent.description}</div>
                </div>

                <div class="agent-actions">
                  <button
                    class="btn-agent btn-start"
                    ?disabled=${status !== "idle"}
                    @click=${() => this._startAgent(agent.id)}
                  >
                    ${status === "idle"
                      ? "\u25B6 Start"
                      : status === "starting"
                        ? "Starting\u2026"
                        : "\u2713 Running"}
                  </button>
                  <button
                    class="btn-agent btn-chat"
                    @click=${() => this._openAgentChat(agent.id)}
                  >
                    \u{1F4AC} Chat
                  </button>
                </div>
              </div>
            `;
          })}
        </div>
      </div>

      <div class="architecture-card">
        <div class="arch-title">How parallel agents work</div>
        <div class="arch-desc">
          Each agent runs in its own session context on the OpenClaw gateway.
          Messages are routed via session keys
          (e.g. <code>web:main@biologist</code>). The gateway processes requests
          independently \u2014 one agent thinking does not block another. You can
          chat with all five agents simultaneously through per-agent tabs.
        </div>
      </div>
    `;
  }
}
