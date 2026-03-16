import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

const AGENTS_LIST = [
  {
    icon: "🐔",
    name: "Coq-每日新闻",
    role: "Daily news and trend briefings",
    status: "Standing by",
    statusKey: "standing-by",
    nextUp: "Coq-每日新闻 | Trend Report 09:00",
    recentOutput: "Daily OpenClaw Trend/Report — 2026-03-15 总判断：今天的主线不是“更强模型”，而是“agent基础设施层”继续升温...",
    inSchedule: "Scheduled",
  },
  {
    icon: "🦁",
    name: "main",
    role: "Main control and coordination",
    status: "Working",
    statusKey: "working",
    workingOn: "creatos-sales-lead-radar",
    recentOutput: "最直接说：**你大概率拿不到`OpenClaw`的微信指数，至少不是像百度指数那样稳定、公开、可随便查。**微信指数这件事，现实里有3个问题...",
    inSchedule: "Scheduled",
  },
  {
    icon: "🐵",
    name: "monkey",
    role: "YouTube to article writing",
    status: "Standing by",
    statusKey: "standing-by",
    workingOn: "No live work right now",
    recentOutput: "OK /Users/tianyi/Documents/Zoo/Inbox/Monkey Asset Inta...",
    inSchedule: "Not scheduled",
  },
  {
    icon: "🦔",
    name: "otter",
    role: "Personal assistance and reminders",
    status: "Standing by",
    statusKey: "standing-by",
    nextUp: "每日07:30晨报（天气/重点邮件/今日待办/昨日未完成）",
    recentOutput: "记下了。我会把这件事作为后续提醒项持续带上： - **让官方人员看到你的开源项目: OpenClaw Control / Pro Control Center** - 当...",
    inSchedule: "Scheduled",
  },
  {
    icon: "🐼",
    name: "pandas",
    role: "Control Center delivery",
    status: "Standing by",
    statusKey: "standing-by",
    workingOn: "No live work right now",
    recentOutput: "收到，这条分工链路清晰，也合理。我这边后续就按这个角色执行：- 你负责第一轮真实审查 - 我负责第二轮补审等你把第一轮confirmed findings、关键源...",
    inSchedule: "Not scheduled",
  },
  {
    icon: "🐯",
    name: "tiger",
    role: "Security and updates",
    status: "Standing by",
    statusKey: "standing-by",
    workingOn: "No live work right now",
    recentOutput: "搞定。**所有已显式配置模型的agent都已经统一切到`openai-codex/gpt-5.4`，并且重启生效了。**已切换： - `main` (默认已走5....",
    inSchedule: "Not scheduled",
  }
];

@customElement("acaclaw-agents")
export class AgentsView extends LitElement {
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
    }

    .agent-header {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 24px;
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
      margin-bottom: 4px;
    }

    .agent-role {
      font-size: 12px;
      color: var(--ac-text-secondary);
      line-height: 1.4;
    }

    .kv-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .kv-row:last-child {
      margin-bottom: 0;
    }
    
    .kv-row.bordered {
      padding-top: 16px;
      border-top: 1px solid var(--ac-border-subtle);
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
    }

    .accordion-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 16px 24px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      cursor: pointer;
    }

    .accordion-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--ac-text);
    }

    .btn-expand {
      font-size: 12px;
      font-weight: 600;
      color: var(--ac-text-secondary);
      padding: 6px 12px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface);
    }
  `;

  override render() {
    return html`
      <div class="header-row">
        <div>
          <h1>Agents</h1>
          <div class="subtitle">Mission, agents and assignments</div>
        </div>
        <button class="btn-outline">Collapse inspector</button>
      </div>

      <div class="card">
        <div class="card-title">Agents overview</div>
        <div class="card-subtitle">
          The default view shows only name, role, current status, current work, recent output, and whether each person is on the schedule.
        </div>

        <div class="agents-grid">
          ${AGENTS_LIST.map(agent => html`
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
                <div class="kv-value">${agent.status}</div>
              </div>
              
              ${agent.workingOn ? html`
                <div class="kv-row">
                  <div class="kv-label">Working on</div>
                  <div class="kv-value">${agent.workingOn}</div>
                </div>
              ` : ''}

              ${agent.nextUp ? html`
                <div class="kv-row">
                  <div class="kv-label">Next up</div>
                  <div class="kv-value">${agent.nextUp}</div>
                </div>
              ` : ''}

              <div class="kv-row">
                <div class="kv-label">Recent output</div>
                <div class="kv-value secondary">${agent.recentOutput}</div>
              </div>

              <div class="kv-row bordered">
                <div class="kv-label">In schedule</div>
                <div class="kv-value">${agent.inSchedule}</div>
              </div>
            </div>
          `)}
        </div>
      </div>

      <div class="accordion-card">
        <div class="accordion-title">Shared agents mission</div>
        <button class="btn-expand">Expand</button>
      </div>

      <div class="accordion-card">
        <div class="accordion-title">Agents system details</div>
        <button class="btn-expand">Expand</button>
      </div>
    `;
  }
}
