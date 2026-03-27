import DOMPurify from "dompurify";
import { marked } from "marked";

const allowedTags = [
  "a", "b", "blockquote", "br", "button", "code", "del", "details", "div", "em",
  "h1", "h2", "h3", "h4", "hr", "i", "li", "ol", "p", "pre", "span",
  "strong", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul", "img",
];

const allowedAttrs = [
  "class", "href", "rel", "target", "title", "start",
  "src", "alt", "data-code", "type", "aria-label",
];

const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_DATA_URI_TAGS: ["img"],
};

let hooksInstalled = false;
const CHAR_LIMIT = 140_000;
const PARSE_LIMIT = 40_000;
const CACHE_LIMIT = 200;
const CACHE_MAX_CHARS = 50_000;
const INLINE_DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const cache = new Map<string, string>();

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    const href = node.getAttribute("href");
    if (!href) return;

    try {
      const url = new URL(href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") {
        node.removeAttribute("href");
        return;
      }
    } catch { /* relative URLs are fine */ }

    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const renderer = new marked.Renderer();
renderer.html = ({ text }: { text: string }) => escapeHtml(text);
renderer.image = (token: { href?: string | null; text?: string | null }) => {
  const label = token.text?.trim() || "image";
  const href = token.href?.trim() ?? "";
  if (!INLINE_DATA_IMAGE_RE.test(href)) return escapeHtml(label);
  return `<img class="md-inline-image" src="${escapeHtml(href)}" alt="${escapeHtml(label)}">`;
};
renderer.code = ({ text, lang, escaped }: { text: string; lang?: string; escaped?: boolean }) => {
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  const safeText = escaped ? text : escapeHtml(text);
  const codeBlock = `<pre><code${langClass}>${safeText}</code></pre>`;
  const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
  const attrSafe = text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const copyBtn = `<button type="button" class="code-copy" data-code="${attrSafe}" aria-label="Copy code"><span class="copy-idle">Copy</span><span class="copy-done">Copied!</span></button>`;
  const header = `<div class="code-header">${langLabel}${copyBtn}</div>`;
  return `<div class="code-wrapper">${header}${codeBlock}</div>`;
};

export function toMarkdownHtml(markdown: string): string {
  const input = markdown.trim();
  if (!input) return "";
  installHooks();

  if (input.length <= CACHE_MAX_CHARS) {
    const cached = cache.get(input);
    if (cached !== undefined) {
      cache.delete(input);
      cache.set(input, cached);
      return cached;
    }
  }

  const truncated = input.length > CHAR_LIMIT ? input.slice(0, CHAR_LIMIT) : input;
  const suffix = truncated !== input
    ? `\n\n… truncated (${input.length} chars, showing first ${CHAR_LIMIT}).`
    : "";

  let rendered: string;
  if (truncated.length > PARSE_LIMIT) {
    rendered = `<div class="md-plain-fallback">${escapeHtml(truncated + suffix)}</div>`;
  } else {
    try {
      rendered = marked.parse(truncated + suffix, { renderer, gfm: true, breaks: true }) as string;
    } catch {
      rendered = `<pre class="code-wrapper">${escapeHtml(truncated + suffix)}</pre>`;
    }
  }

  const sanitized = DOMPurify.sanitize(rendered, sanitizeOptions);
  if (input.length <= CACHE_MAX_CHARS) {
    cache.set(input, sanitized);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  return sanitized;
}
