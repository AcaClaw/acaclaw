interface ChatMessage {
  role: string;
  content: string;
  thinking?: string;
  timestamp?: string;
}

export function exportChatMarkdown(messages: ChatMessage[], assistantName: string): void {
  const md = buildChatMarkdown(messages, assistantName);
  if (!md) return;
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chat-${assistantName}-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildChatMarkdown(messages: ChatMessage[], assistantName: string): string | null {
  if (messages.length === 0) return null;
  const lines: string[] = [`# Chat with ${assistantName}`, ""];
  for (const m of messages) {
    const role = m.role === "user" ? "You" : assistantName;
    const ts = m.timestamp ? ` (${m.timestamp})` : "";
    lines.push(`## ${role}${ts}`, "");
    if (m.thinking) {
      lines.push("> **Reasoning:**", "> " + m.thinking.replace(/\n/g, "\n> "), "");
    }
    lines.push(m.content, "");
  }
  return lines.join("\n");
}
