import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.ACACLAW_URL ?? "http://localhost:2090";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/e2e/test-results",
  snapshotDir: "tests/e2e/__screenshots__",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      // Allow 1% pixel diff — prevents flaky failures from font rendering
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Tablet/mobile projects exist but are opt-in to avoid screenshot bloat.
    // Run explicitly: npx playwright test --project=tablet
    // {
    //   name: "tablet",
    //   use: { ...devices["iPad Mini"], viewport: { width: 768, height: 1024 } },
    // },
    // {
    //   name: "mobile",
    //   use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    // },
  ],
});
