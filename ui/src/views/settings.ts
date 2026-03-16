import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("acaclaw-settings")
export class SettingsView extends LitElement {
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

    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--ac-border);
      flex-wrap: wrap;
    }
    .tab {
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ac-text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: nowrap;
      transition: color var(--ac-transition-fast);
    }
    .tab:hover {
      color: var(--ac-text-secondary);
    }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
    }

    .connection-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .conn-item {
      display: flex;
      align-items: center;
      padding: 24px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.01);
      transition: transform var(--ac-transition-fast), box-shadow var(--ac-transition-fast);
    }
    
    .conn-item:hover {
      transform: translateY(-2px);
      box-shadow: var(--ac-shadow-sm);
    }

    .conn-info {
      flex: 1;
    }

    .conn-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ac-text);
      margin-bottom: 4px;
    }

    .conn-desc {
      font-size: 13px;
      color: var(--ac-text-secondary);
    }

    .conn-status {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-right: 32px;
      min-width: 140px;
    }

    .status-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: var(--ac-radius-full);
      margin-bottom: 4px;
    }

    .status-badge.healthy {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    
    .status-badge.warning {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }
    
    .status-badge.error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .status-meta {
      font-size: 11px;
      color: var(--ac-text-tertiary);
    }

    .btn-action {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-text);
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: var(--ac-radius-full);
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    }

    .btn-action:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-muted);
    }
  `;

  override render() {
    return html`
      <div class="header-row">
        <div>
          <h1>Connection health</h1>
          <div class="subtitle">3/4 links healthy</div>
        </div>
      </div>
      
      <div class="tabs">
        <div class="tab active">Gateway</div>
        <div class="tab">Runtime</div>
        <div class="tab">Workspace</div>
        <div class="tab">Security</div>
      </div>

      <div class="connection-list">
        <div class="conn-item">
          <div class="conn-info">
            <div class="conn-title">Loopback API</div>
            <div class="conn-desc">OpenClaw Gateway on localhost (port 2090)</div>
          </div>
          <div class="conn-status">
            <div class="status-badge healthy">Healthy</div>
            <div class="status-meta">2026-03-16T12:47:04.145Z</div>
            <div class="status-meta">11ms latency</div>
          </div>
          <button class="btn-action">Verify</button>
        </div>

        <div class="conn-item">
          <div class="conn-info">
            <div class="conn-title">System Runtime</div>
            <div class="conn-desc">Underlying container execution environment</div>
          </div>
          <div class="conn-status">
            <div class="status-badge healthy">Healthy</div>
            <div class="status-meta">Podman v5.2.2</div>
            <div class="status-meta">Memory limit ok</div>
          </div>
          <button class="btn-action">Verify</button>
        </div>

        <div class="conn-item">
          <div class="conn-info">
            <div class="conn-title">Local Workspace Map</div>
            <div class="conn-desc">~/AcaClaw directory ready for read/write operations</div>
          </div>
          <div class="conn-status">
            <div class="status-badge warning">Syncing</div>
            <div class="status-meta">Checking indices</div>
            <div class="status-meta">File handle valid</div>
          </div>
          <button class="btn-action">Verify</button>
        </div>
        
        <div class="conn-item">
          <div class="conn-info">
            <div class="conn-title">LLM Gateway</div>
            <div class="conn-desc">Outbound connection to model routing service</div>
          </div>
          <div class="conn-status">
            <div class="status-badge healthy">Healthy</div>
            <div class="status-meta">Latency 43ms</div>
            <div class="status-meta">Last ping ok</div>
          </div>
          <button class="btn-action">Verify</button>
        </div>
      </div>
    `;
  }
}
