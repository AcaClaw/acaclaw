/**
 * Unit tests for provider-mapping module.
 * Verifies catalog-to-config provider mapping and filtering.
 */
import { describe, it, expect } from "vitest";
import {
  catalogToConfigProvider,
  isProviderConfigured,
  CATALOG_TO_CONFIG_PROVIDER,
  LLM_PROVIDERS,
  BROWSER_PROVIDERS,
} from "../ui/src/models/provider-mapping.js";

describe("provider-mapping", () => {
  describe("catalogToConfigProvider", () => {
    it("maps kimi-coding to moonshot", () => {
      expect(catalogToConfigProvider("kimi-coding")).toBe("moonshot");
    });

    it("maps kimi to moonshot", () => {
      expect(catalogToConfigProvider("kimi")).toBe("moonshot");
    });

    it("maps azure-openai-responses to azure", () => {
      expect(catalogToConfigProvider("azure-openai-responses")).toBe("azure");
    });

    it("maps google-vertex to google", () => {
      expect(catalogToConfigProvider("google-vertex")).toBe("google");
    });

    it("maps openai-codex to openai", () => {
      expect(catalogToConfigProvider("openai-codex")).toBe("openai");
    });

    it("returns identity for direct-match providers", () => {
      expect(catalogToConfigProvider("anthropic")).toBe("anthropic");
      expect(catalogToConfigProvider("openrouter")).toBe("openrouter");
      expect(catalogToConfigProvider("deepseek")).toBe("deepseek");
    });

    it("returns identity for unknown catalog providers", () => {
      expect(catalogToConfigProvider("some-unknown")).toBe("some-unknown");
    });
  });

  describe("isProviderConfigured", () => {
    const configured = new Set(["moonshot", "openrouter"]);

    it("returns true for kimi-coding when moonshot is configured", () => {
      expect(isProviderConfigured("kimi-coding", configured)).toBe(true);
    });

    it("returns true for openrouter when openrouter is configured", () => {
      expect(isProviderConfigured("openrouter", configured)).toBe(true);
    });

    it("returns false for anthropic when not configured", () => {
      expect(isProviderConfigured("anthropic", configured)).toBe(false);
    });

    it("returns false for unknown provider when not configured", () => {
      expect(isProviderConfigured("groq", configured)).toBe(false);
    });
  });

  describe("CATALOG_TO_CONFIG_PROVIDER completeness", () => {
    it("every LLM_PROVIDERS id has at least one catalog mapping", () => {
      const configIds = new Set(Object.values(CATALOG_TO_CONFIG_PROVIDER));
      for (const p of LLM_PROVIDERS) {
        expect(configIds.has(p.id), `Missing mapping for config provider: ${p.id}`).toBe(true);
      }
    });
  });

  describe("LLM_PROVIDERS", () => {
    it("has unique ids", () => {
      const ids = LLM_PROVIDERS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("BROWSER_PROVIDERS", () => {
    it("has unique ids", () => {
      const ids = BROWSER_PROVIDERS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
