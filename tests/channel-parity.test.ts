/**
 * Pairwise comparison: AcaClaw channel card files vs OpenClaw originals.
 *
 * For each per-channel render file, strips import lines and compares
 * the function bodies character-by-character. Any drift in the
 * rendering logic (labels, status rows, HTML structure, callbacks)
 * is caught immediately.
 *
 * The shared helper file is also compared (only the functions that
 * exist in both codebases — AcaClaw consolidates extra helpers from
 * OpenClaw's format.ts and channels.ts into channels.shared.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ACACLAW_VIEWS = resolve(__dirname, "../ui/src/views");
const OPENCLAW_VIEWS = resolve(__dirname, "../../open/openclaw-2026.4.2/ui/src/ui/views");

/**
 * Strip all import blocks (including multi-line), blank lines,
 * comment-only section headers, and "Ported from" comments
 * so we compare only the actual function bodies.
 */
function stripBoilerplate(src: string): string {
  // Remove all import statements (including multi-line)
  let cleaned = src.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  // Also remove multi-line import blocks that start with "import {" or "import type {"
  cleaned = cleaned.replace(/^import\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?\s*$/gm, "");
  // Remove any remaining lone import continuation lines (just identifiers with commas)
  // by removing everything before the first export/function/const/class/describe/type definition
  const firstDef = cleaned.search(/^(export |function |const |class |describe\(|type |interface )/m);
  if (firstDef > 0) {
    cleaned = cleaned.slice(firstDef);
  }

  return cleaned
    .split("\n")
    .filter((line) => {
      // Remove "// Ported from …" header comments
      if (/^\s*\/\/\s*Ported from/.test(line)) return false;
      // Remove section-header comments like "// ─── Display state ─────"
      if (/^\s*\/\/\s*─/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * Normalize trivial whitespace differences: collapse multiple blank lines
 * into a single one, trim trailing whitespace per line.
 */
function normalizeWhitespace(src: string): string {
  return src
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readFileOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/**
 * Per-channel card files: the function body should be identical across repos.
 * Import paths differ (.js vs .ts, ./channels.types vs ../types) but
 * the rendering logic must match exactly.
 */
const CARD_FILES = [
  "channels.whatsapp.ts",
  "channels.telegram.ts",
  "channels.discord.ts",
  "channels.googlechat.ts",
  "channels.slack.ts",
  "channels.signal.ts",
  "channels.imessage.ts",
];

describe("channel card parity with OpenClaw", () => {
  for (const file of CARD_FILES) {
    it(`${file}: function body matches OpenClaw`, () => {
      const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, file));
      const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, file));

      expect(acaclawSrc).not.toBeNull();
      expect(openclawSrc).not.toBeNull();

      const acaclawBody = normalizeWhitespace(stripBoilerplate(acaclawSrc!));
      const openclawBody = normalizeWhitespace(stripBoilerplate(openclawSrc!));

      expect(acaclawBody).toBe(openclawBody);
    });
  }
});

describe("channels.nostr.ts parity with OpenClaw", () => {
  /**
   * The Nostr card in AcaClaw imports truncatePubkey from shared.ts while
   * OpenClaw defines it inline. Strip the local function definition from
   * OpenClaw and the import-related extra type names from AcaClaw, then
   * compare the remaining render function body.
   */
  it("renderNostrCard function body matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.nostr.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.nostr.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    // Strip imports + boilerplate
    let acaclawBody = normalizeWhitespace(stripBoilerplate(acaclawSrc!));
    let openclawBody = normalizeWhitespace(stripBoilerplate(openclawSrc!));

    // OpenClaw has inline truncatePubkey — strip it for comparison
    // (AcaClaw imports it from channels.shared.ts)
    openclawBody = openclawBody.replace(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?function truncatePubkey[\s\S]*?return `\$\{pubkey\.slice\(0, 8\)\}\.\.\..*?\n\}\n*/,
      "",
    );

    // Strip inline JSDoc comments from OpenClaw (AcaClaw omits them)
    openclawBody = openclawBody.replace(/\s*\/\*\*[^]*?\*\//g, "");
    // Strip single-line inline comments
    openclawBody = openclawBody.replace(/\s*\/\/\s+If showing form.*/g, "");
    openclawBody = openclawBody.replace(/\s*\/\/\s+Profile form .*/g, "");
    openclawBody = openclawBody.replace(/\s*\/\/\s+Called when .*/g, "");

    // Re-normalize after stripping
    acaclawBody = normalizeWhitespace(acaclawBody);
    openclawBody = normalizeWhitespace(openclawBody);

    expect(acaclawBody).toBe(openclawBody);
  });
});

describe("channels.nostr-profile-form.ts parity with OpenClaw", () => {
  it("function body matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.nostr-profile-form.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.nostr-profile-form.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    const acaclawBody = normalizeWhitespace(stripBoilerplate(acaclawSrc!));
    const openclawBody = normalizeWhitespace(stripBoilerplate(openclawSrc!));

    expect(acaclawBody).toBe(openclawBody);
  });
});

describe("channels.config.ts: core rendering parity", () => {
  /**
   * channels.config.ts in AcaClaw has an extra ChannelConfigSectionParams
   * flat interface overload. The core rendering functions (resolveSchemaNode,
   * renderExtraChannelFields, renderChannelConfigForm, and the HTML template
   * inside renderChannelConfigSection) should match OpenClaw's.
   */
  it("renderChannelConfigForm function matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.config.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.config.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    // Extract renderChannelConfigForm from both
    const extractConfigForm = (src: string) => {
      const match = src.match(
        /export function renderChannelConfigForm\([\s\S]*?\n\}/,
      );
      return match ? normalizeWhitespace(match[0]) : null;
    };

    const acaclawFn = extractConfigForm(acaclawSrc!);
    const openclawFn = extractConfigForm(openclawSrc!);
    expect(acaclawFn).not.toBeNull();
    expect(openclawFn).not.toBeNull();

    // The only expected diffs:
    // 1. AcaClaw uses `as JsonSchema` cast where OpenClaw assigns directly
    // 2. AcaClaw adds an empty-schema guard for WeChat/plugin channels
    // 3. AcaClaw imports `nothing` from lit (OpenClaw doesn't need it here)
    const normalizedAcaclaw = acaclawFn!
      .replace(/\s+as JsonSchema/g, "")
      .replace(
        /\/\/ Plugin channels with empty configSchema[\s\S]*?return nothing;\s*\}\s*/,
        "",
      );
    const normalizedOpenclaw = openclawFn!.replace(/\s+as JsonSchema/g, "");

    expect(normalizedAcaclaw).toBe(normalizedOpenclaw);
  });

  it("resolveSchemaNode function matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.config.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.config.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    const extractFn = (src: string) => {
      const match = src.match(
        /function resolveSchemaNode\([\s\S]*?\n\}/,
      );
      return match ? normalizeWhitespace(match[0]) : null;
    };

    expect(extractFn(acaclawSrc!)).toBe(extractFn(openclawSrc!));
  });

  it("EXTRA_CHANNEL_FIELDS list matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.config.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.config.ts"));

    const extractFields = (src: string) => {
      const match = src!.match(/EXTRA_CHANNEL_FIELDS\s*=\s*\[([^\]]+)\]/);
      return match ? match[1].replace(/\s/g, "") : null;
    };

    expect(extractFields(acaclawSrc!)).toBe(extractFields(openclawSrc!));
  });
});

describe("channels.shared.ts: shared helper parity", () => {
  /**
   * Only compare functions that exist in BOTH codebases.
   * AcaClaw's shared.ts consolidates extra helpers from OpenClaw's
   * format.ts and main channels.ts — those extras are AcaClaw-specific
   * and are excluded from this parity check.
   */
  const SHARED_FUNCTIONS = [
    "channelEnabled",
    "formatNullableBoolean",
    "resolveChannelDisplayState",
    "resolveChannelConfigured",
    "renderSingleAccountChannelCard",
    "renderChannelAccountCount",
  ];

  for (const fnName of SHARED_FUNCTIONS) {
    it(`${fnName} matches OpenClaw`, () => {
      const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.shared.ts"));
      const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.shared.ts"));
      expect(acaclawSrc).not.toBeNull();
      expect(openclawSrc).not.toBeNull();

      const extractFn = (src: string) => {
        // Match exported function with its body
        const pattern = new RegExp(
          `export function ${fnName}\\([\\s\\S]*?\\n\\}`,
        );
        const match = src.match(pattern);
        return match ? normalizeWhitespace(match[0]) : null;
      };

      const acaclawFn = extractFn(acaclawSrc!);
      const openclawFn = extractFn(openclawSrc!);

      expect(acaclawFn).not.toBeNull();
      expect(openclawFn).not.toBeNull();
      expect(acaclawFn).toBe(openclawFn);
    });
  }
});

describe("channel-config-extras.ts parity with OpenClaw", () => {
  it("function body matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channel-config-extras.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channel-config-extras.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    const acaclawBody = normalizeWhitespace(stripBoilerplate(acaclawSrc!));
    const openclawBody = normalizeWhitespace(stripBoilerplate(openclawSrc!));

    expect(acaclawBody).toBe(openclawBody);
  });
});

describe("channels.test.ts parity with OpenClaw", () => {
  it("test file matches OpenClaw", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.test.ts"));
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.test.ts"));
    expect(acaclawSrc).not.toBeNull();
    expect(openclawSrc).not.toBeNull();

    const acaclawBody = normalizeWhitespace(stripBoilerplate(acaclawSrc!));
    const openclawBody = normalizeWhitespace(stripBoilerplate(openclawSrc!));

    expect(acaclawBody).toBe(openclawBody);
  });
});

describe("channels.types.ts: type parity", () => {
  /**
   * AcaClaw defines types inline; OpenClaw imports them from ../types.ts.
   * Verify key type names are exported from AcaClaw's types file.
   */
  const REQUIRED_EXPORTS = [
    "ChannelsStatusSnapshot",
    "ChannelsProps",
    "ChannelKey",
    "ChannelsChannelData",
    "ChannelAccountSnapshot",
    "NostrProfile",
    "WhatsAppStatus",
    "TelegramStatus",
    "DiscordStatus",
    "GoogleChatStatus",
    "SlackStatus",
    "SignalStatus",
    "IMessageStatus",
    "NostrStatus",
  ];

  for (const typeName of REQUIRED_EXPORTS) {
    it(`exports ${typeName}`, () => {
      const src = readFileOrNull(join(ACACLAW_VIEWS, "channels.types.ts"))!;
      // Check either "export interface …" or "export type …" or re-export
      const pattern = new RegExp(
        `export\\s+(interface|type)\\s+${typeName}\\b`,
      );
      expect(src).toMatch(pattern);
    });
  }

  /**
   * ChannelsProps must have the same callback properties as OpenClaw.
   */
  it("ChannelsProps has all required callback properties", () => {
    const acaclawSrc = readFileOrNull(join(ACACLAW_VIEWS, "channels.types.ts"))!;
    const openclawSrc = readFileOrNull(join(OPENCLAW_VIEWS, "channels.types.ts"))!;

    const extractProps = (src: string) => {
      const match = src.match(/export\s+(?:interface|type)\s+ChannelsProps\s*(?:=\s*)?\{([\s\S]*?)\n\}/);
      if (!match) return [];
      // Extract property names
      return match[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//") && !l.startsWith("/*"))
        .map((l) => l.match(/^(\w+)/)?.[1])
        .filter(Boolean)
        .sort();
    };

    const openclawProps = extractProps(openclawSrc);
    const acaclawProps = extractProps(acaclawSrc);

    // AcaClaw must have at least all props that OpenClaw has
    for (const prop of openclawProps) {
      expect(acaclawProps).toContain(prop);
    }
  });
});
