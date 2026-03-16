import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

interface DayUsage {
  date: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

interface ModelUsage {
  model: string;
  tokens: number;
  cost: number;
}

@customElement("acaclaw-usage")
export class UsageView extends LitElement {
  @state() private _daily: DayUsage[] = [];
  @state() private _byModel: ModelUsage[] = [];
  @state() private _totalCost = 0;
  @state() private _totalTokens = 0;
  @state() private _period: "week" | "month" = "week";

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

    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .period-btn {
      padding: 6px 14px;
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 500;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-text-secondary);
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }
    .period-btn:hover {
      background: var(--ac-bg-hover);
      color: var(--ac-text);
    }
    .period-btn.active {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
      box-shadow: var(--ac-shadow-xs);
    }
    .export-btn {
      margin-left: auto;
      padding: 6px 14px;
      border-radius: var(--ac-radius-full);
      font-size: 13px;
      font-weight: 500;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }
    .export-btn:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-primary);
      color: var(--ac-primary);
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      padding: 20px;
      box-shadow: var(--ac-shadow-sm);
      transition: box-shadow var(--ac-transition);
    }
    .summary-card:hover {
      box-shadow: var(--ac-shadow-md);
    }
    .summary-label {
      font-size: 12px;
      color: var(--ac-text-secondary);
      font-weight: 500;
    }
    .summary-value {
      font-size: 28px;
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

    /* Bar chart */
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 140px;
      padding-top: 8px;
    }
    .bar-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      height: 100%;
      justify-content: flex-end;
    }
    .bar-stack {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 40px;
      justify-content: flex-end;
    }
    .bar {
      border-radius: 4px 4px 0 0;
      min-height: 2px;
      transition: height var(--ac-transition);
    }
    .bar.input {
      background: var(--ac-primary);
    }
    .bar.output {
      background: var(--ac-primary-light);
    }
    .bar-label {
      font-size: 10px;
      color: var(--ac-text-muted);
      margin-top: 4px;
    }

    .legend {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      font-size: 12px;
      color: var(--ac-text-secondary);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
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

    @media (max-width: 700px) {
      .summary-cards {
        grid-template-columns: 1fr;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadUsage();
  }

  private async _loadUsage() {
    try {
      const res = await gateway.call<{
        daily?: DayUsage[];
        byModel?: ModelUsage[];
        totalCost?: number;
        totalTokens?: number;
      }>("usage.cost", { period: this._period });
      if (res) {
        this._daily = res.daily ?? [];
        this._byModel = res.byModel ?? [];
        this._totalCost = res.totalCost ?? 0;
        this._totalTokens = res.totalTokens ?? 0;
      }
    } catch {
      // show empty state
    }
  }

  private _switchPeriod(p: "week" | "month") {
    this._period = p;
    this._loadUsage();
  }

  private _exportCSV() {
    const lines = ["Date,Input Tokens,Output Tokens,Cost"];
    for (const d of this._daily) {
      lines.push(`${d.date},${d.tokensIn},${d.tokensOut},${d.cost}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acaclaw-usage-${this._period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _maxDailyTokens(): number {
    let max = 1;
    for (const d of this._daily) {
      const total = d.tokensIn + d.tokensOut;
      if (total > max) max = total;
    }
    return max;
  }

  override render() {
    const maxTokens = this._maxDailyTokens();

    return html`
      <h1>Usage</h1>

      <div class="controls">
        <button
          class="period-btn ${this._period === "week" ? "active" : ""}"
          @click=${() => this._switchPeriod("week")}
        >
          Week
        </button>
        <button
          class="period-btn ${this._period === "month" ? "active" : ""}"
          @click=${() => this._switchPeriod("month")}
        >
          Month
        </button>
        <button class="export-btn" @click=${this._exportCSV}>
          Export CSV
        </button>
      </div>

      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">Total Tokens</div>
          <div class="summary-value">
            ${this._formatTokens(this._totalTokens)}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Cost</div>
          <div class="summary-value">$${this._totalCost.toFixed(2)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Models Used</div>
          <div class="summary-value">${this._byModel.length}</div>
        </div>
      </div>

      <div class="card">
        <h2>Daily Usage</h2>
        ${this._daily.length === 0
          ? html`<p
              style="color: var(--ac-text-muted); font-size: 13px"
            >
              No usage data yet
            </p>`
          : html`
              <div class="chart">
                ${this._daily.map((d) => {
                  const inH =
                    Math.max((d.tokensIn / maxTokens) * 120, 2);
                  const outH =
                    Math.max((d.tokensOut / maxTokens) * 120, 2);
                  return html`
                    <div class="bar-group">
                      <div class="bar-stack">
                        <div
                          class="bar output"
                          style="height: ${outH}px"
                          title="Output: ${d.tokensOut}"
                        ></div>
                        <div
                          class="bar input"
                          style="height: ${inH}px"
                          title="Input: ${d.tokensIn}"
                        ></div>
                      </div>
                      <span class="bar-label"
                        >${d.date.slice(5)}</span
                      >
                    </div>
                  `;
                })}
              </div>
              <div class="legend">
                <div class="legend-item">
                  <div
                    class="legend-dot"
                    style="background: var(--ac-primary)"
                  ></div>
                  Input
                </div>
                <div class="legend-item">
                  <div
                    class="legend-dot"
                    style="background: var(--ac-primary-light)"
                  ></div>
                  Output
                </div>
              </div>
            `}
      </div>

      <div class="card">
        <h2>By Model</h2>
        ${this._byModel.length === 0
          ? html`<p
              style="color: var(--ac-text-muted); font-size: 13px"
            >
              No model data yet
            </p>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._byModel.map(
                    (m) => html`
                      <tr>
                        <td>${m.model}</td>
                        <td>${this._formatTokens(m.tokens)}</td>
                        <td>$${m.cost.toFixed(2)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </div>
    `;
  }

  private _formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }
}
