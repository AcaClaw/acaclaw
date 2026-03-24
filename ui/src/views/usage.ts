import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

const USAGE_RESET_KEY = "acaclaw-usage-reset";
const TOKEN_RESET_KEY = "acaclaw-token-reset";
const QUOTA_RESET_KEY = "acaclaw-quota-reset";

interface DayUsage {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

interface CostUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

interface CostUsageSummary {
  updatedAt: number;
  days: number;
  daily: DayUsage[];
  totals: CostUsageTotals;
}

interface ToolUsageEntry {
  name: string;
  count: number;
}

interface TokenResetOffset {
  date: string;
  tokens: number;
  cost: number;
  input: number;
  output: number;
  messages: number;
  toolCalls: number;
}

interface QuotaResetOffset {
  date: string;
  total: number;
  tools: Record<string, number>;
}

interface SessionsUsageResult {
  aggregates?: {
    tools?: {
      totalCalls: number;
      uniqueTools: number;
      tools: ToolUsageEntry[];
    };
    messages?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    daily?: Array<{
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }>;
  };
}

/** Tools that count toward search quota */
const SEARCH_TOOLS = new Set(["web_search", "web_fetch", "browser"]);

/** Per-tool quota stored in localStorage as JSON. 0 = no limit. */
interface ToolQuota {
  limit: number;
}
const DEFAULT_QUOTAS: Record<string, ToolQuota> = {
  web_search: { limit: 1000 },
  browser: { limit: 0 },
  web_fetch: { limit: 0 },
};

function loadQuotas(): Record<string, ToolQuota> {
  try {
    const raw = localStorage.getItem("acaclaw-tool-quotas");
    if (raw) return { ...DEFAULT_QUOTAS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_QUOTAS };
}

function saveQuotas(q: Record<string, ToolQuota>) {
  localStorage.setItem("acaclaw-tool-quotas", JSON.stringify(q));
}

/** Get the billing cycle start date based on a day-of-month (1-28). */
function billingCycleStart(billingDay: number): string {
  const now = new Date();
  const day = Math.min(billingDay, 28);
  // If today >= billingDay, cycle started this month; otherwise last month
  let start: Date;
  if (now.getDate() >= day) {
    start = new Date(now.getFullYear(), now.getMonth(), day);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, day);
  }
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

@customElement("acaclaw-usage")
export class UsageView extends LitElement {
  @state() private _daily: DayUsage[] = [];
  @state() private _totalCost = 0;
  @state() private _totalTokens = 0;
  @state() private _totalInput = 0;
  @state() private _totalOutput = 0;
  @state() private _toolUsage: ToolUsageEntry[] = [];
  @state() private _totalToolCalls = 0;
  @state() private _totalMessages = 0;
  @state() private _sessionDaily: Array<{ date: string; messages: number; toolCalls: number }> = [];
  @state() private _monthlySearchCalls = 0;
  @state() private _monthlyToolBreakdown: ToolUsageEntry[] = [];
  @state() private _period: "week" | "month" = "week";
  @state() private _billingDay = Number(localStorage.getItem("acaclaw-billing-day")) || 1;
  @state() private _quotas: Record<string, ToolQuota> = loadQuotas();
  @state() private _editingQuotaTool: string | null = null;
  @state() private _tokenResetOffset: TokenResetOffset | null = null;
  @state() private _quotaResetOffset: QuotaResetOffset | null = null;

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

    .reset-btn {
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
    .reset-btn:hover {
      background: var(--ac-bg-hover);
      color: var(--ac-text);
    }

    .reset-info {
      font-size: 12px;
      color: var(--ac-text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .clear-reset-btn {
      background: none;
      border: none;
      color: var(--ac-text-tertiary);
      font-size: 12px;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }
    .clear-reset-btn:hover {
      color: var(--ac-text-secondary);
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

    /* Billing cycle picker */
    .billing-cycle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--ac-text-secondary);
      margin-left: 12px;
    }
    .billing-cycle select {
      padding: 2px 6px;
      border: 1px solid var(--ac-border);
      border-radius: 6px;
      background: var(--ac-card-bg);
      color: var(--ac-text);
      font-size: 13px;
      cursor: pointer;
    }

    /* Search quota */
    .quota-bar-wrap {
      margin: 16px 0 8px;
    }
    .quota-bar-bg {
      height: 14px;
      border-radius: 7px;
      background: var(--ac-bg-hover, #f0f0f0);
      overflow: hidden;
    }
    .quota-bar-fill {
      height: 100%;
      border-radius: 7px;
      background: var(--ac-primary);
      transition: width 0.4s ease;
    }
    .quota-bar-fill.warning {
      background: #f59e0b;
    }
    .quota-bar-fill.danger {
      background: #ef4444;
    }
    .quota-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--ac-text-secondary);
      margin-top: 4px;
    }
    .quota-detail {
      margin-top: 12px;
      font-size: 13px;
      color: var(--ac-text-secondary);
    }
    .quota-detail span {
      color: var(--ac-text);
      font-weight: 600;
    }
    .quota-edit-input {
      width: 70px;
      padding: 2px 6px;
      border: 1px solid var(--ac-primary);
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      text-align: right;
      background: var(--ac-card-bg);
      color: var(--ac-text);
    }
    .quota-limit-btn {
      cursor: pointer;
      border-bottom: 1px dashed var(--ac-text-secondary);
    }
    .provider-quota-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .provider-quota-row .pq-label {
      min-width: 140px;
      font-size: 13px;
    }
    .provider-quota-row .pq-bar {
      flex: 1;
    }
    .provider-quota-row .pq-count {
      min-width: 80px;
      text-align: right;
      font-size: 13px;
      font-weight: 600;
    }
  `;

  private _unsubGateway?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    try {
      const raw = localStorage.getItem(TOKEN_RESET_KEY);
      if (raw) this._tokenResetOffset = JSON.parse(raw);
    } catch { /* migrate: old format was a date string */ }
    try {
      const raw = localStorage.getItem(QUOTA_RESET_KEY);
      if (raw) this._quotaResetOffset = JSON.parse(raw);
    } catch { /* ignore */ }
    this._loadUsage();

    // Reload data when gateway (re)connects — covers initial page load
    // where WebSocket isn't ready yet during connectedCallback.
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.state === "connected") {
        this._loadUsage();
      }
    };
    gateway.addEventListener("state-change", handler);
    this._unsubGateway = () => gateway.removeEventListener("state-change", handler);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubGateway?.();
  }

  private async _loadUsage() {
    const days = this._period === "week" ? 7 : 30;

    // Date range for the selected period
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - days);
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let startDate = fmtDate(periodStart);
    const today = fmtDate(now);

    // Monthly range for search quota based on billing cycle day
    const monthStart = billingCycleStart(this._billingDay);

    // Fetch token/cost usage, tool/session usage, and monthly search quota in parallel
    const [costRes, sessionsRes, monthlyRes] = await Promise.all([
      gateway.call<CostUsageSummary>("usage.cost", { days }).catch(() => null),
      gateway.call<SessionsUsageResult>("sessions.usage", {
        startDate,
        endDate: today,
        limit: 200,
      }).catch(() => null),
      gateway.call<SessionsUsageResult>("sessions.usage", {
        startDate: monthStart,
        endDate: today,
        limit: 200,
      }).catch(() => null),
    ]);

    if (costRes) {
      const daily = costRes.daily ?? [];
      this._daily = daily;
      this._totalCost = daily.reduce((s, d) => s + d.totalCost, 0);
      this._totalTokens = daily.reduce((s, d) => s + d.input + d.output, 0);
      this._totalInput = daily.reduce((s, d) => s + d.input, 0);
      this._totalOutput = daily.reduce((s, d) => s + d.output, 0);
    }

    if (sessionsRes?.aggregates) {
      const tools = sessionsRes.aggregates.tools;
      this._toolUsage = tools?.tools ?? [];
      this._totalToolCalls = tools?.totalCalls ?? 0;
      this._totalMessages = sessionsRes.aggregates.messages?.total ?? 0;
      this._sessionDaily = (sessionsRes.aggregates.daily ?? []).map((d) => ({
        date: d.date,
        messages: d.messages,
        toolCalls: d.toolCalls,
      }));
    }

    if (monthlyRes?.aggregates?.tools) {
      const tools = monthlyRes.aggregates.tools.tools ?? [];
      this._monthlyToolBreakdown = tools.filter((t) => SEARCH_TOOLS.has(t.name));
      this._monthlySearchCalls = this._monthlyToolBreakdown.reduce(
        (sum, t) => sum + t.count, 0,
      );
    }
  }

  private _switchPeriod(p: "week" | "month") {
    this._period = p;
    this._loadUsage();
  }

  private _exportCSV() {
    const lines = ["Date,Input Tokens,Output Tokens,Cost"];
    for (const d of this._daily) {
      lines.push(`${d.date},${d.input},${d.output},${d.totalCost}`);
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
      const total = d.input + d.output;
      if (total > max) max = total;
    }
    return max;
  }

  override render() {
    const maxTokens = this._maxDailyTokens();
    // Offset-adjusted values for token section
    const tOff = this._tokenResetOffset;
    const adjTokens = Math.max(0, this._totalTokens - (tOff?.tokens ?? 0));
    const adjCost = Math.max(0, this._totalCost - (tOff?.cost ?? 0));
    const adjInput = Math.max(0, this._totalInput - (tOff?.input ?? 0));
    const adjOutput = Math.max(0, this._totalOutput - (tOff?.output ?? 0));
    const adjMessages = Math.max(0, this._totalMessages - (tOff?.messages ?? 0));
    const adjToolCalls = Math.max(0, this._totalToolCalls - (tOff?.toolCalls ?? 0));
    // Offset-adjusted values for search quota section
    const qOff = this._quotaResetOffset;
    const adjSearchCalls = Math.max(0, this._monthlySearchCalls - (qOff?.total ?? 0));

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
        ${tOff ? html`
          <span class="reset-info">
            Since ${new Date(tOff.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            <button class="clear-reset-btn" @click=${this._clearTokenReset}>Clear</button>
          </span>
        ` : ""}
        <button class="reset-btn" @click=${this._resetTokens}>↺ Reset Tokens</button>
        <button class="export-btn" @click=${this._exportCSV}>
          Export CSV
        </button>
      </div>

      ${adjTokens > 0 || adjCost > 0 ? html`
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">Total Tokens</div>
          <div class="summary-value">
            ${this._formatTokens(adjTokens)}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Cost</div>
          <div class="summary-value">$${adjCost.toFixed(2)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Input / Output</div>
          <div class="summary-value">${this._formatTokens(adjInput)} / ${this._formatTokens(adjOutput)}</div>
        </div>
      </div>
      ` : html`
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">Total Messages</div>
          <div class="summary-value">${adjMessages}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Tool Calls</div>
          <div class="summary-value">${adjToolCalls}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Token Tracking</div>
          <div class="summary-value" style="font-size:13px;color:var(--ac-text-muted)">Not available</div>
        </div>
      </div>
      `}

      <div class="card">
        <h2>Daily Usage</h2>
        ${this._daily.length > 0
          ? html`
              <div class="chart">
                ${this._daily.map((d) => {
                  const inH =
                    Math.max((d.input / maxTokens) * 120, 2);
                  const outH =
                    Math.max((d.output / maxTokens) * 120, 2);
                  return html`
                    <div class="bar-group">
                      <div class="bar-stack">
                        <div
                          class="bar output"
                          style="height: ${outH}px"
                          title="Output: ${d.output}"
                        ></div>
                        <div
                          class="bar input"
                          style="height: ${inH}px"
                          title="Input: ${d.input}"
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
            `
          : this._sessionDaily.length > 0
            ? html`
              <div class="chart">
                ${(() => {
                  const maxMsg = Math.max(1, ...this._sessionDaily.map((d) => d.messages));
                  return this._sessionDaily.map((d) => {
                    const h = Math.max((d.messages / maxMsg) * 120, 2);
                    return html`
                      <div class="bar-group">
                        <div class="bar-stack">
                          <div class="bar input" style="height: ${h}px" title="Messages: ${d.messages}"></div>
                        </div>
                        <span class="bar-label">${d.date.slice(5)}</span>
                      </div>
                    `;
                  });
                })()}
              </div>
              <div class="legend">
                <div class="legend-item">
                  <div class="legend-dot" style="background: var(--ac-primary)"></div>
                  Messages
                </div>
              </div>
            `
            : html`<p style="color: var(--ac-text-muted); font-size: 13px">No usage data yet</p>`}
      </div>

      <div class="card">
        <h2>By Day</h2>
        ${this._daily.length > 0
          ? html`
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._daily.map(
                    (d) => html`
                      <tr>
                        <td>${d.date}</td>
                        <td>${this._formatTokens(d.input)}</td>
                        <td>${this._formatTokens(d.output)}</td>
                        <td>$${d.totalCost.toFixed(4)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `
          : this._sessionDaily.length > 0
            ? html`
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Messages</th>
                    <th>Tool Calls</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._sessionDaily.map(
                    (d) => html`
                      <tr>
                        <td>${d.date}</td>
                        <td>${d.messages}</td>
                        <td>${d.toolCalls}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `
            : html`<p style="color: var(--ac-text-muted); font-size: 13px">No daily data yet</p>`}
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0">Search Quota</h2>
          ${qOff ? html`
            <span class="reset-info" style="margin-left:auto">
              Since ${new Date(qOff.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              <button class="clear-reset-btn" @click=${this._clearQuotaReset}>Clear</button>
            </span>
          ` : ""}
          <button class="reset-btn" style="${qOff ? '' : 'margin-left:auto'}" @click=${this._resetQuota}>↺ Reset Quota</button>
        </div>
        <p style="font-size: 13px; color: var(--ac-text-secondary); margin-bottom: 8px">
          Monthly web API usage
          <span class="billing-cycle">
            — resets on day
            <select
              .value=${String(this._billingDay)}
              @change=${(e: Event) => this._setBillingDay(Number((e.target as HTMLSelectElement).value))}
            >
              ${Array.from({ length: 28 }, (_, i) => i + 1).map(
                (d) => html`<option value=${d} ?selected=${d === this._billingDay}>${d}</option>`,
              )}
            </select>
            of each month
          </span>
        </p>
        <div class="summary-cards" style="margin-bottom: 12px">
          <div class="summary-card">
            <div class="summary-label">Total Search Calls</div>
            <div class="summary-value">${adjSearchCalls}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Combined Quota</div>
            <div class="summary-value">${this._totalQuota() || '∞'}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Remaining</div>
            <div class="summary-value">${this._totalQuota() ? Math.max(0, this._totalQuota() - adjSearchCalls) : '∞'}</div>
          </div>
        </div>

        ${this._renderProviderQuotas()}
      </div>

      <div class="card">
        <h2>Tool Usage</h2>
        <div class="summary-cards" style="margin-bottom: 16px">
          <div class="summary-card">
            <div class="summary-label">Total Tool Calls</div>
            <div class="summary-value">${this._totalToolCalls}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Messages</div>
            <div class="summary-value">${this._totalMessages}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Unique Tools</div>
            <div class="summary-value">${this._toolUsage.length}</div>
          </div>
        </div>
        ${this._toolUsage.length === 0
          ? html`<p style="color: var(--ac-text-muted); font-size: 13px">
              No tool usage yet
            </p>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._toolUsage.map(
                    (t) => html`
                      <tr>
                        <td>${this._toolLabel(t.name)}</td>
                        <td>${t.count}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </div>
    `;
  }

  private _setBillingDay(day: number) {
    this._billingDay = day;
    localStorage.setItem("acaclaw-billing-day", String(day));
    this._loadUsage();
  }

  private _resetTokens() {
    const offset: TokenResetOffset = {
      date: new Date().toISOString(),
      tokens: this._totalTokens,
      cost: this._totalCost,
      input: this._totalInput,
      output: this._totalOutput,
      messages: this._totalMessages,
      toolCalls: this._totalToolCalls,
    };
    localStorage.setItem(TOKEN_RESET_KEY, JSON.stringify(offset));
    this._tokenResetOffset = offset;
  }

  private _clearTokenReset() {
    localStorage.removeItem(TOKEN_RESET_KEY);
    this._tokenResetOffset = null;
  }

  private _resetQuota() {
    const toolOffsets: Record<string, number> = {};
    for (const t of this._monthlyToolBreakdown) toolOffsets[t.name] = t.count;
    const offset: QuotaResetOffset = {
      date: new Date().toISOString(),
      total: this._monthlySearchCalls,
      tools: toolOffsets,
    };
    localStorage.setItem(QUOTA_RESET_KEY, JSON.stringify(offset));
    this._quotaResetOffset = offset;
  }

  private _clearQuotaReset() {
    localStorage.removeItem(QUOTA_RESET_KEY);
    this._quotaResetOffset = null;
  }

  private _totalQuota(): number {
    let total = 0;
    for (const tool of SEARCH_TOOLS) {
      total += this._quotas[tool]?.limit ?? 0;
    }
    return total;
  }

  private _setQuota(tool: string, limit: number) {
    this._quotas = { ...this._quotas, [tool]: { limit: Math.max(0, limit) } };
    saveQuotas(this._quotas);
    this._editingQuotaTool = null;
  }

  private _renderProviderQuotas() {
    const tools = [...SEARCH_TOOLS];
    const qOff = this._quotaResetOffset;
    return html`
      ${tools.map((tool) => {
        const usage = this._monthlyToolBreakdown.find((t) => t.name === tool);
        const rawCount = usage?.count ?? 0;
        const count = Math.max(0, rawCount - (qOff?.tools[tool] ?? 0));
        const quota = this._quotas[tool]?.limit ?? 0;
        const pct = quota > 0 ? Math.min(100, (count / quota) * 100) : 0;
        const barClass = quota > 0 && count / quota > 0.9 ? "danger" : quota > 0 && count / quota > 0.7 ? "warning" : "";

        return html`
          <div class="provider-quota-row">
            <div class="pq-label">${this._toolLabel(tool)}</div>
            <div class="pq-bar">
              ${quota > 0
                ? html`
                    <div class="quota-bar-bg">
                      <div class="quota-bar-fill ${barClass}" style="width: ${pct}%"></div>
                    </div>
                  `
                : html`<span style="font-size: 12px; color: var(--ac-text-muted)">no limit</span>`}
            </div>
            <div class="pq-count">${count} / ${this._editingQuotaTool === tool
              ? html`<input
                  class="quota-edit-input"
                  type="number"
                  min="0"
                  .value=${String(quota)}
                  @blur=${(e: Event) => this._setQuota(tool, Number((e.target as HTMLInputElement).value))}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") this._setQuota(tool, Number((e.target as HTMLInputElement).value));
                    if (e.key === "Escape") this._editingQuotaTool = null;
                  }}
                />`
              : html`<span
                  class="quota-limit-btn"
                  title="Click to edit quota"
                  @click=${() => { this._editingQuotaTool = tool; }}
                >${quota || '∞'}</span>`}</div>
          </div>
        `;
      })}
    `;
  }

  private _toolLabel(name: string): string {
    const map: Record<string, string> = {
      web_search: "Web Search (Brave)",
      web_fetch: "Web Fetch",
      browser: "Browser",
      bash: "Terminal",
      file_read: "Read File",
      file_write: "Write File",
      file_edit: "Edit File",
    };
    return map[name] ?? name.replace(/_/g, " ");
  }

  private _formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }
}
