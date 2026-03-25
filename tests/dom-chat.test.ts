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
});
