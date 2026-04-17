/**
 * DOM component tests for ChatView.
 * Renders the Lit component in happy-dom and simulates button clicks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockOnNotification = vi.fn().mockReturnValue(() => {});

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onNotification: (...args: unknown[]) => mockOnNotification(...args),
  },
}));

const { ChatView } = await import("../ui/src/views/chat.js");

type CV = InstanceType<typeof ChatView>;

async function createElement(): Promise<CV> {
  localStorage.removeItem("acaclaw-staff-customizations");
  localStorage.removeItem("acaclaw-staff-added");

  mockCall.mockImplementation(async (method: string) => {
    if (method === "chat.history") return { messages: [] };
    if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
    if (method === "acaclaw.env.list") return { environments: [] };
    return undefined;
  });
  const el = document.createElement("acaclaw-chat") as CV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: CV) {
  document.body.removeChild(el);
}

function q(el: CV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: CV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("ChatView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockOnNotification.mockReset();
    mockOnNotification.mockReturnValue(() => {});
  });

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent?.trim()).toBe("Chat");
    cleanup(el);
  });

  it("renders textarea and send button", async () => {
    const el = await createElement();
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    const sendBtn = q(el, ".send-btn") as HTMLButtonElement;
    expect(textarea).toBeTruthy();
    expect(sendBtn).toBeTruthy();
    expect(sendBtn.textContent?.trim()).toBe("Send");
    cleanup(el);
  });

  it("send button is disabled when textarea is empty", async () => {
    const el = await createElement();
    const sendBtn = q(el, ".send-btn") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    cleanup(el);
  });

  it("typing text enables send button", async () => {
    const el = await createElement();
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Hello";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;

    const sendBtn = q(el, ".send-btn") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
    cleanup(el);
  });

  it("clicking Send calls gateway chat.send", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "chat.send") return { runId: "test-run-1" };
      return undefined;
    });

    // Type a message
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "What is DNA?";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click send
    const sendBtn = q(el, ".send-btn") as HTMLButtonElement;
    sendBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const sendCall = calls.find((c) => c[0] === "chat.send");
    expect(sendCall).toBeTruthy();
    expect(sendCall![1]).toHaveProperty("message", "What is DNA?");
    expect(sendCall![1]).toHaveProperty("sessionKey");
    cleanup(el);
  });

  it("adds user message to chat after sending", async () => {
    const el = await createElement();
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.send") return { runId: "test-run-1" };
      return undefined;
    });

    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Hello world";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;

    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Should have at least the user message rendered
    const userMessages = qa(el, ".message.user");
    expect(userMessages.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders workdir badge", async () => {
    const el = await createElement();
    const badge = q(el, ".workdir-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toContain("AcaClaw");
    cleanup(el);
  });

  it("clicking workdir badge opens dialog", async () => {
    const el = await createElement();
    const badge = q(el, ".workdir-badge") as HTMLElement;
    badge.click();
    await el.updateComplete;

    // Look for the dialog overlay
    const dialogBtns = qa(el, ".dialog-btn");
    expect(dialogBtns.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("renders tab bar with general tab", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBeGreaterThan(0);
    // General tab should show agent name
    const firstTab = tabs[0];
    expect(firstTab?.textContent).toBeTruthy();
    cleanup(el);
  });

  it("renders empty state with suggestions for new chat", async () => {
    const el = await createElement();
    const suggestions = qa(el, ".suggestions button, .suggestion-btn, .suggestion");
    // Suggestions may or may not be present depending on messages
    const emptyState = q(el, ".empty-state");
    // If no messages, should show empty state
    expect(emptyState).toBeTruthy();
    cleanup(el);
  });

  it("renders + Project button in header", async () => {
    const el = await createElement();
    // Look for project-related button in header
    const headerBtns = qa(el, ".header-right button, .new-project-btn");
    const projectBtn = Array.from(headerBtns).find(
      (b) => b.textContent?.includes("Project"),
    );
    expect(projectBtn).toBeTruthy();
    cleanup(el);
  });

  it("clicking + Project shows new project popover", async () => {
    const el = await createElement();
    const projectBtn = q(el, ".new-project-btn") as HTMLButtonElement;
    projectBtn.click();
    await el.updateComplete;

    const popover = q(el, ".new-project-popover, .new-project-popover-row");
    expect(popover).toBeTruthy();
    cleanup(el);
  });

  it("creating project from chat calls gateway", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    });

    // Open project popover
    const projectBtn = q(el, ".new-project-btn") as HTMLButtonElement;
    projectBtn.click();
    await el.updateComplete;

    // Fill in project name
    const inputs = qa(el, ".new-project-popover-row input, .new-project-popover input");
    const nameInput = inputs[0] as HTMLInputElement;
    nameInput.value = "test-project";
    nameInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click create button
    const createBtns = qa(el, ".new-project-popover-row button, .new-project-popover button");
    const createBtn = Array.from(createBtns).find(
      (b) => b.textContent?.includes("Create"),
    ) as HTMLButtonElement;
    createBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const createCall = calls.find((c) => c[0] === "acaclaw.workspace.createFolder");
    expect(createCall).toBeTruthy();
    expect(createCall![1]).toHaveProperty("path");
    expect((createCall![1] as Record<string, string>).path).toContain("test-project");
    cleanup(el);
  });

  it("textarea clears after sending message", async () => {
    const el = await createElement();
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.send") return { runId: "run" };
      return undefined;
    });

    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Test message";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;

    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // The textarea value should be cleared (bound to tab.input)
    expect(textarea.value).toBe("");
    cleanup(el);
  });

  it("preserves messages when hidden and re-shown (tab navigation)", async () => {
    const el = await createElement();
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.send") return { runId: "run-1" };
      return undefined;
    });

    // Send a message so there's history in the component state
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Hello world";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const messagesBeforeHide = qa(el, ".message").length;
    expect(messagesBeforeHide).toBeGreaterThan(0);

    // Simulate navigating away: hide the component (as main.ts now does)
    el.style.display = "none";
    await el.updateComplete;

    // Simulate navigating back: show the component
    el.style.display = "flex";
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Messages must still be present — no session reset
    const messagesAfterShow = qa(el, ".message").length;
    expect(messagesAfterShow).toBe(messagesBeforeHide);

    cleanup(el);
  });

  it("input actions has attach button", async () => {
    const el = await createElement();
    const actions = qa(el, ".input-actions button");
    expect(actions.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("+ Chat clears messages and rotates session", async () => {
    const el = await createElement();
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.send") return { runId: "run-2" };
      return undefined;
    });

    // Send a message first
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Test message";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const msgsBefore = qa(el, ".message").length;
    expect(msgsBefore).toBeGreaterThan(0);

    // Click "+ Chat" button to intentionally clear (second .new-project-btn)
    const newChatBtns = qa(el, ".new-project-btn");
    const newChatBtn = newChatBtns[1] as HTMLButtonElement;
    expect(newChatBtn).toBeTruthy();
    newChatBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Messages should be cleared
    const msgsAfter = qa(el, ".message").length;
    expect(msgsAfter).toBe(0);

    cleanup(el);
  });

  it("renders tool calls from history as collapsible panels", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return {
        messages: [
          { role: "user", content: "Search for aptamers" },
          {
            role: "assistant",
            content: [
              { type: "thinking", text: "I will search for aptamer info." },
              { type: "toolCall", id: "call_001", name: "web_search", arguments: { query: "aptamer drugs" } },
              { type: "toolCall", id: "call_002", name: "web_fetch", arguments: { url: "https://example.com" } },
            ],
          },
          {
            role: "toolResult",
            toolCallId: "call_001",
            toolName: "web_search",
            content: [{ type: "text", text: '{"results": [{"title": "Aptamer review"}]}' }],
          },
          {
            role: "toolResult",
            toolCallId: "call_002",
            toolName: "web_fetch",
            content: [{ type: "text", text: "Fetched page content" }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Here is the aptamer report." }],
          },
        ],
      };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    // Should have tool call panels rendered
    const toolPanels = qa(el, ".msg-tool");
    expect(toolPanels.length).toBe(2);

    // Check tool icon (⚡) is displayed in each panel
    const toolIcons = qa(el, ".tool-icon");
    expect(toolIcons.length).toBe(2);
    for (const icon of Array.from(toolIcons)) {
      expect(icon.textContent?.trim()).toBe("\u26A1");
    }

    // Check tool names are displayed
    const toolNames = qa(el, ".tool-name");
    const names = Array.from(toolNames).map((n) => n.textContent?.trim());
    expect(names).toContain("web_search");
    expect(names).toContain("web_fetch");

    // Tool results should be attached
    const toolOutputs = qa(el, ".tool-output");
    expect(toolOutputs.length).toBe(2);

    cleanup(el);
  });

  it("renders tool calls from streaming delta events", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    // Capture the notification handlers
    const handlers = new Map<string, (data: unknown) => void>();
    mockOnNotification.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return { messages: [] };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      if (method === "chat.send") return { runId: "run-tool-1" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Send a message to create the assistant placeholder
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Search for papers";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Simulate a chat delta with toolCall content
    const chatHandler = handlers.get("chat");
    expect(chatHandler).toBeTruthy();
    chatHandler!({
      runId: "run-tool-1",
      state: "delta",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_100", name: "web_search", arguments: { query: "test" } },
        ],
      },
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Tool call panel should appear
    const toolPanels = qa(el, ".msg-tool");
    expect(toolPanels.length).toBe(1);
    expect(q(el, ".tool-name")?.textContent?.trim()).toBe("web_search");

    cleanup(el);
  });

  it("session.tool events update tool state", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    const handlers = new Map<string, (data: unknown) => void>();
    mockOnNotification.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return { messages: [] };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      if (method === "chat.send") return { runId: "run-tool-2" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Send a message
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Search something";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Simulate session.tool event (tool starts running)
    const toolHandler = handlers.get("session.tool");
    expect(toolHandler).toBeTruthy();
    const t0 = performance.now();
    toolHandler!({
      runId: "run-tool-2",
      toolName: "bash",
      toolCallId: "call_200",
      input: { command: "ls -la" },
      state: "running",
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;
    const t1 = performance.now();

    // Should show a running tool panel with icon
    let toolPanels = qa(el, ".msg-tool");
    expect(toolPanels.length).toBe(1);
    expect(q(el, ".tool-name")?.textContent?.trim()).toBe("bash");
    expect(q(el, ".tool-icon")?.textContent?.trim()).toBe("\u26A1");
    expect(q(el, ".tool-state-running")).toBeTruthy();
    const renderRunningMs = t1 - t0;

    // Tool completes
    const t2 = performance.now();
    toolHandler!({
      runId: "run-tool-2",
      toolName: "bash",
      toolCallId: "call_200",
      output: "total 42\ndrwxr-xr-x ...",
      state: "done",
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;
    const t3 = performance.now();

    // Running state should be gone, output should be present
    expect(q(el, ".tool-state-running")).toBeFalsy();
    const toolOutput = q(el, ".tool-output");
    expect(toolOutput).toBeTruthy();
    expect(toolOutput?.textContent).toContain("total 42");
    const renderDoneMs = t3 - t2;

    // Report timing
    console.log(`[tool-display] icon rendered: YES (\u26A1)`);
    console.log(`[tool-display] running state rendered in: ${renderRunningMs.toFixed(1)}ms`);
    console.log(`[tool-display] done state rendered in: ${renderDoneMs.toFixed(1)}ms`);
    console.log(`[tool-display] total tool lifecycle (running→done): ${(t3 - t0).toFixed(1)}ms`);

    cleanup(el);
  });

  it("toolResult messages are not rendered as standalone messages", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return {
        messages: [
          { role: "user", content: "Search" },
          {
            role: "assistant",
            content: [{ type: "toolCall", id: "call_300", name: "web_search", arguments: { query: "test" } }],
          },
          {
            role: "toolResult",
            toolCallId: "call_300",
            toolName: "web_search",
            content: [{ type: "text", text: "result data" }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Done." }],
          },
        ],
      };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    // Should have 1 user + 2 assistant messages, NOT a toolResult message
    const userMsgs = qa(el, ".message.user");
    const asstMsgs = qa(el, ".message.assistant");
    expect(userMsgs.length).toBe(1);
    expect(asstMsgs.length).toBe(2);
    // Total messages should be 3, not 4 (toolResult is merged)
    const allMsgs = qa(el, ".message");
    expect(allMsgs.length).toBe(3);

    cleanup(el);
  });

  it("tool icon ⚡ is displayed for every tool in every rendering path", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    const handlers = new Map<string, (data: unknown) => void>();
    mockOnNotification.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return {
        messages: [
          { role: "user", content: "Run tools" },
          {
            role: "assistant",
            content: [
              { type: "toolCall", id: "hist_001", name: "web_search", arguments: { query: "from history" } },
            ],
          },
          { role: "toolResult", toolCallId: "hist_001", toolName: "web_search", content: "result" },
          { role: "assistant", content: [{ type: "text", text: "Done from history." }] },
        ],
      };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      if (method === "chat.send") return { runId: "run-icon-test" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    // 1) History-loaded tool should have icon
    let icons = qa(el, ".tool-icon");
    expect(icons.length).toBeGreaterThanOrEqual(1);
    console.log(`[tool-icon] history-loaded tools: ${icons.length} icon(s) displayed`);
    for (const icon of Array.from(icons)) {
      expect(icon.textContent?.trim()).toBe("\u26A1");
    }

    // 2) Send a new message to test streaming path
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Run more tools";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // 3) session.tool event path
    const toolHandler = handlers.get("session.tool");
    toolHandler!({ runId: "run-icon-test", toolName: "web_fetch", toolCallId: "live_001", state: "running", input: { url: "https://example.com" } });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    icons = qa(el, ".tool-icon");
    expect(icons.length).toBeGreaterThanOrEqual(2);
    console.log(`[tool-icon] after session.tool event: ${icons.length} icon(s) displayed`);
    for (const icon of Array.from(icons)) {
      expect(icon.textContent?.trim()).toBe("\u26A1");
    }

    // 4) chat delta path
    const chatHandler = handlers.get("chat");
    chatHandler!({
      runId: "run-icon-test",
      state: "delta",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "live_002", name: "bash", arguments: { command: "echo hi" } }],
      },
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    icons = qa(el, ".tool-icon");
    console.log(`[tool-icon] after chat delta: ${icons.length} icon(s) displayed`);
    for (const icon of Array.from(icons)) {
      expect(icon.textContent?.trim()).toBe("\u26A1");
    }
    console.log("[tool-icon] PASS — all tool icons correctly render ⚡");

    cleanup(el);
  });

  it("measures web_fetch tool display duration through lifecycle", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    const handlers = new Map<string, (data: unknown) => void>();
    mockOnNotification.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return { messages: [] };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      if (method === "chat.send") return { runId: "run-fetch-timing" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Send a message
    const textarea = q(el, ".input-area textarea") as HTMLTextAreaElement;
    textarea.value = "Fetch a page";
    textarea.dispatchEvent(new Event("input"));
    await el.updateComplete;
    (q(el, ".send-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const toolHandler = handlers.get("session.tool")!;

    // web_fetch starts
    const fetchStart = performance.now();
    toolHandler({
      runId: "run-fetch-timing",
      toolName: "web_fetch",
      toolCallId: "fetch_001",
      input: { url: "https://example.com/paper.html" },
      state: "running",
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;
    const fetchDisplayed = performance.now();

    // Verify running state
    expect(q(el, ".tool-name")?.textContent?.trim()).toBe("web_fetch");
    expect(q(el, ".tool-state-running")).toBeTruthy();
    expect(q(el, ".tool-icon")?.textContent?.trim()).toBe("\u26A1");
    const inputPre = q(el, ".tool-input pre");
    expect(inputPre?.textContent).toContain("example.com");
    console.log(`[web_fetch] running state rendered in: ${(fetchDisplayed - fetchStart).toFixed(1)}ms`);

    // Simulate a realistic delay (the test just measures rendering, not actual fetch)
    // web_fetch completes
    const fetchDoneStart = performance.now();
    toolHandler({
      runId: "run-fetch-timing",
      toolName: "web_fetch",
      toolCallId: "fetch_001",
      output: "<!DOCTYPE html><html><body>Research paper content about aptamers...</body></html>",
      state: "done",
    });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;
    const fetchDoneRendered = performance.now();

    // Verify done state
    expect(q(el, ".tool-state-running")).toBeFalsy();
    const toolOutput = q(el, ".tool-output");
    expect(toolOutput).toBeTruthy();
    expect(toolOutput?.textContent).toContain("aptamers");
    console.log(`[web_fetch] done state rendered in: ${(fetchDoneRendered - fetchDoneStart).toFixed(1)}ms`);
    console.log(`[web_fetch] total display lifecycle: ${(fetchDoneRendered - fetchStart).toFixed(1)}ms`);
    console.log(`[web_fetch] icon displayed: ${q(el, ".tool-icon")?.textContent?.trim() === "\u26A1" ? "YES ⚡" : "NO ❌"}`);

    cleanup(el);
  });

  it("renders thinking content from session format (thinking field, not text)", async () => {
    const el = document.createElement("acaclaw-chat") as CV;
    localStorage.removeItem("acaclaw-staff-customizations");
    localStorage.removeItem("acaclaw-staff-added");

    // Session format: thinking blocks have {type:"thinking", thinking:"...", thinkingSignature:"..."}
    // NOT {type:"thinking", text:"..."} — this is the actual format from OpenClaw sessions
    mockCall.mockImplementation(async (method: string) => {
      if (method === "chat.history") return {
        messages: [
          { role: "user", content: "25+36=? just answer" },
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "This is a simple arithmetic problem. 25 + 36 = 61." },
              { type: "text", text: "61" },
            ],
          },
        ],
      };
      if (method === "acaclaw.workspace.getWorkdir") return { workdir: "~/AcaClaw" };
      return undefined;
    });

    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 100));
    await el.updateComplete;

    // Thinking block should render with content from the `thinking` field
    const thinkingBlock = q(el, ".msg-thinking");
    expect(thinkingBlock).toBeTruthy();
    const thinkingBody = q(el, ".msg-thinking-body");
    expect(thinkingBody?.textContent).toContain("simple arithmetic");

    // Text content should also render
    const msgBodies = qa(el, ".msg-body");
    const assistantText = Array.from(msgBodies).map((b) => b.textContent?.trim()).find((t) => t?.includes("61"));
    expect(assistantText).toBeTruthy();

    console.log(`[thinking-field] thinking block rendered: ${thinkingBlock ? "YES" : "NO"}`);
    console.log(`[thinking-field] thinking content: "${thinkingBody?.textContent?.trim().slice(0, 60)}"`);

    cleanup(el);
  });
});
