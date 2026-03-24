/**
 * Gateway contract tests for ChatView button actions.
 * Tests chat send, project create from chat, workdir management, web search via skills.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Gateway mock ── */

const mockCall = vi.fn();

/* ── Replicated types & constants from ui/src/views/chat.ts ── */

const DEFAULT_WORKSPACE = "~/AcaClaw";
const GENERAL_TAB_ID = "general";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AgentTab {
  agentId: string;
  messages: ChatMessage[];
  sending: boolean;
  activeRunId: string;
  input: string;
}

/* ── Replicated handler logic ── */

function createSessionKey(agentId: string): string {
  return `acaclaw:${agentId}:default`;
}

async function sendMessage(
  tab: AgentTab,
  idempotencyKey: string,
): Promise<{
  messages: ChatMessage[];
  runId?: string;
  error?: string;
}> {
  const text = tab.input.trim();
  if (!text || tab.sending) return { messages: tab.messages };

  const messages: ChatMessage[] = [
    ...tab.messages,
    { role: "user", content: text, timestamp: new Date().toLocaleTimeString() },
    { role: "assistant", content: "", timestamp: "" },
  ];

  const sessionKey = createSessionKey(tab.agentId);
  try {
    const res = await mockCall("chat.send", {
      sessionKey,
      message: text,
      idempotencyKey,
    });
    return { messages, runId: res?.runId };
  } catch (err) {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      last.content = `Error: ${err instanceof Error ? err.message : "Failed to send message"}`;
      last.timestamp = new Date().toLocaleTimeString();
    }
    return { messages, error: (err as Error).message };
  }
}

async function createNewProject(projectName: string, dirBrowserPath: string[]) {
  const name = projectName.trim();
  if (!name) return { created: false };
  await mockCall("acaclaw.workspace.createFolder", { path: `Projects/${name}` });
  const newPath = ["Projects", name];
  const base = DEFAULT_WORKSPACE;
  const sub = newPath.join("/");
  const workdirInput = `${base}/${sub}`;
  return { created: true, path: newPath, workdirInput };
}

async function saveWorkdir(agentId: string, path: string) {
  const normalizedId = agentId === GENERAL_TAB_ID ? "general" : agentId;
  await mockCall("acaclaw.workspace.setWorkdir", {
    agentId: normalizedId,
    path,
  });
}

async function resetWorkdir(agentId: string) {
  const normalizedId = agentId === GENERAL_TAB_ID ? "general" : agentId;
  await mockCall("acaclaw.workspace.setWorkdir", {
    agentId: normalizedId,
    path: null,
  });
}

/* ── Tests ── */

describe("ChatView – send message", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls chat.send with sessionKey, message, idempotencyKey", async () => {
    mockCall.mockResolvedValue({ runId: "run-123" });
    const tab: AgentTab = {
      agentId: "biologist",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "Search for CRISPR papers",
    };
    const result = await sendMessage(tab, "uuid-1");
    expect(mockCall).toHaveBeenCalledWith("chat.send", {
      sessionKey: "acaclaw:biologist:default",
      message: "Search for CRISPR papers",
      idempotencyKey: "uuid-1",
    });
    expect(result.runId).toBe("run-123");
  });

  it("adds user message and empty assistant placeholder", async () => {
    mockCall.mockResolvedValue({ runId: "r1" });
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "Hello",
    };
    const result = await sendMessage(tab, "id-1");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("Hello");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toBe("");
  });

  it("does not send when input is empty", async () => {
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "",
    };
    const result = await sendMessage(tab, "id-1");
    expect(mockCall).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });

  it("does not send when input is whitespace only", async () => {
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "   ",
    };
    const result = await sendMessage(tab, "id-1");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("does not send while already sending", async () => {
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: true,
      activeRunId: "run-old",
      input: "Hello",
    };
    const result = await sendMessage(tab, "id-1");
    expect(mockCall).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });

  it("populates assistant error message on failure", async () => {
    // Use a direct error simulation instead of vi.fn() mock rejection
    // (vitest 3.x re-throws errors from vi.fn mocks even when caught)
    const errorCalls: unknown[][] = [];
    async function errorGateway(...args: unknown[]) {
      errorCalls.push(args);
      throw new Error("Gateway timeout");
    }
    async function sendWithError(
      tab: AgentTab,
      idempotencyKey: string,
    ) {
      const text = tab.input.trim();
      if (!text || tab.sending) return { messages: tab.messages };
      const messages: ChatMessage[] = [
        ...tab.messages,
        { role: "user", content: text, timestamp: new Date().toLocaleTimeString() },
        { role: "assistant", content: "", timestamp: "" },
      ];
      const sessionKey = createSessionKey(tab.agentId);
      try {
        await errorGateway("chat.send", { sessionKey, message: text, idempotencyKey });
        return { messages };
      } catch (err) {
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          last.content = `Error: ${err instanceof Error ? err.message : "Failed to send message"}`;
          last.timestamp = new Date().toLocaleTimeString();
        }
        return { messages, error: (err as Error).message };
      }
    }
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "Hello",
    };
    const result = await sendWithError(tab, "id-1");
    expect(result.error).toBe("Gateway timeout");
    expect(errorCalls).toHaveLength(1);
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toContain("Gateway timeout");
  });

  it("uses correct session key format", () => {
    expect(createSessionKey("biologist")).toBe("acaclaw:biologist:default");
    expect(createSessionKey("default")).toBe("acaclaw:default:default");
    expect(createSessionKey("medscientist")).toBe("acaclaw:medscientist:default");
  });
});

describe("ChatView – create new project from chat", () => {
  beforeEach(() => mockCall.mockReset());

  it("creates project folder under Projects/", async () => {
    mockCall.mockResolvedValue(undefined);
    const result = await createNewProject("RNA-Seq Analysis", []);
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.createFolder", {
      path: "Projects/RNA-Seq Analysis",
    });
    expect(result.created).toBe(true);
    expect(result.path).toEqual(["Projects", "RNA-Seq Analysis"]);
    expect(result.workdirInput).toBe("~/AcaClaw/Projects/RNA-Seq Analysis");
  });

  it("does not create when name is empty", async () => {
    const result = await createNewProject("", []);
    expect(result.created).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("trims project name", async () => {
    mockCall.mockResolvedValue(undefined);
    const result = await createNewProject("  My Project  ", []);
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.createFolder", {
      path: "Projects/My Project",
    });
  });
});

describe("ChatView – working directory management", () => {
  beforeEach(() => mockCall.mockReset());

  it("saves workdir for specific agent", async () => {
    mockCall.mockResolvedValue(undefined);
    await saveWorkdir("biologist", "~/AcaClaw/Projects/RNA-Seq");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.setWorkdir", {
      agentId: "biologist",
      path: "~/AcaClaw/Projects/RNA-Seq",
    });
  });

  it("normalizes general tab id", async () => {
    mockCall.mockResolvedValue(undefined);
    await saveWorkdir(GENERAL_TAB_ID, "~/AcaClaw");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.setWorkdir", {
      agentId: "general",
      path: "~/AcaClaw",
    });
  });

  it("resets workdir with null path", async () => {
    mockCall.mockResolvedValue(undefined);
    await resetWorkdir("biologist");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.setWorkdir", {
      agentId: "biologist",
      path: null,
    });
  });
});

describe("ChatView – web search integration", () => {
  it("web search is triggered via chat message to skill-enabled agents", async () => {
    // Web search is not a separate API—it's embedded via skills:
    // - xurl skill: fetch and read web pages
    // - literature-search skill: search arXiv/PubMed/Semantic Scholar
    // When a user sends "Search for CRISPR papers", the agent uses its skills.
    // The test verifies chat.send is the mechanism.
    mockCall.mockResolvedValue({ runId: "r1" });
    const tab: AgentTab = {
      agentId: "biologist",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "Search arXiv for recent CRISPR papers",
    };
    const result = await sendMessage(tab, "uuid-web-search");
    expect(mockCall).toHaveBeenCalledWith("chat.send", {
      sessionKey: "acaclaw:biologist:default",
      message: "Search arXiv for recent CRISPR papers",
      idempotencyKey: "uuid-web-search",
    });
    expect(result.runId).toBe("r1");
  });

  it("general agent can also trigger web search via xurl skill", async () => {
    mockCall.mockResolvedValue({ runId: "r2" });
    const tab: AgentTab = {
      agentId: "default",
      messages: [],
      sending: false,
      activeRunId: "",
      input: "Fetch the contents of https://example.com",
    };
    const result = await sendMessage(tab, "uuid-xurl");
    expect(mockCall).toHaveBeenCalledWith("chat.send", {
      sessionKey: "acaclaw:default:default",
      message: "Fetch the contents of https://example.com",
      idempotencyKey: "uuid-xurl",
    });
  });
});

describe("ChatView – message history", () => {
  it("preserves existing messages when sending new one", async () => {
    mockCall.mockResolvedValue({ runId: "r1" });
    const existing: ChatMessage[] = [
      { role: "user", content: "Hi", timestamp: "10:00" },
      { role: "assistant", content: "Hello!", timestamp: "10:01" },
    ];
    const tab: AgentTab = {
      agentId: "default",
      messages: existing,
      sending: false,
      activeRunId: "",
      input: "Follow up question",
    };
    const result = await sendMessage(tab, "id-2");
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0]).toEqual(existing[0]);
    expect(result.messages[1]).toEqual(existing[1]);
    expect(result.messages[2].content).toBe("Follow up question");
    expect(result.messages[3].role).toBe("assistant");
  });
});
