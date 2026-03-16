import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("acaclaw-monitor")
export class MonitorView extends LitElement {
  @state() private _tokensToday = "1,509,786";
  @state() private _loading = true;

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

    .health-banner {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 24px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      margin-bottom: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.01);
    }

    .health-circle {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 8px solid #10b981;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--ac-text);
      box-shadow: inset 0 0 0 4px rgba(16,185,129,0.1);
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

    .action-group {
      margin-bottom: 32px;
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

    .big-number {
      font-size: 48px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 8px;
      color: var(--ac-text);
    }
    .number-label {
      font-size: 14px;
      color: var(--ac-text-secondary);
      margin-bottom: 16px;
      font-weight: 500;
    }
    
    .button-row {
      display: flex;
      gap: 12px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-box {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.01);
      border-top: 3px solid rgba(0,0,0,0.8);
      transition: transform var(--ac-transition-fast), box-shadow var(--ac-transition-fast);
    }
    .stat-box:hover {
      transform: translateY(-2px);
      box-shadow: var(--ac-shadow-sm);
    }

    .stat-box h4 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ac-text-secondary);
      margin-bottom: 16px;
    }

    .stat-box .num {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 8px;
      color: var(--ac-text);
    }

    .stat-box .desc {
      font-size: 13px;
      color: var(--ac-text-muted);
    }

    .usage-card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.01);
      border-top: 3px solid rgba(0,0,0,0.8);
      display: inline-block;
      min-width: 300px;
    }

    .usage-card h4 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ac-text-secondary);
      margin-bottom: 12px;
    }
    
    .usage-card .num {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      color: var(--ac-text);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._fetchData();
  }

  private async _fetchData() {
    try {
      this._loading = false;
    } catch {
      this._loading = false;
    }
  }

  override render() {
    return html`
      <div class="header-row">
        <div>
          <h1>Monitor</h1>
          <div class="subtitle">Decide from one screen: system health, items needing your intervention, who is active, and AI burn.</div>
        </div>
        <button class="btn-outline">Collapse inspector</button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Today's control posture</div>
          <div class="badge-stable">Stable</div>
        </div>
        <div class="card-subtitle">The system is holding a stable rhythm.</div>

        <div class="health-banner">
          <div class="health-circle">
            <div class="num">100</div>
            <div class="lbl">Health</div>
          </div>
          <div class="health-info">
            <h3>Flowing well</h3>
            <p>Review queue 0 · Runtime issues 0 · Stalled runs 0 · Budget risk 0</p>
            <div class="meta">Cron 2026-03-16T12:36:46.021Z · Heartbeat 2026-03-16T12:36:46.021Z</div>
          </div>
        </div>

        <div class="action-group">
          <button class="btn-outline">Keep the current rhythm</button>
        </div>

        <div class="big-number">0</div>
        <div class="number-label">Key action items</div>

        <div class="button-row">
          <button class="btn-outline">Open current tasks</button>
          <button class="btn-outline">Open follow-up items</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-box">
          <h4>Review Queue</h4>
          <div class="num">0</div>
          <div class="desc">No backlog</div>
        </div>
        <div class="stat-box">
          <h4>Runtime Issues</h4>
          <div class="num">0</div>
          <div class="desc">Normal</div>
        </div>
        <div class="stat-box">
          <h4>Stalled Runs</h4>
          <div class="num">0</div>
          <div class="desc">Fresh</div>
        </div>
        <div class="stat-box">
          <h4>Budget Risk</h4>
          <div class="num">0</div>
          <div class="desc">Budget safe</div>
        </div>
      </div>

      <div class="usage-card">
        <h4>Today's Usage</h4>
        <div class="num">${this._tokensToday}</div>
      </div>
    `;
  }
}
