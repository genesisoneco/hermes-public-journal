// QA suites for Trinity's Live Habitat, run against the Jekyll-built _site/.
// Build _site first (Docker ruby:3.3 jekyll build --future), then: npx playwright test
// (serve-site.mjs on :4000 is started automatically). Also: node budget.mjs, node lighthouse.mjs 3
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1, // perf + net (fixed port 8787) must not overlap
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "results/results.json" }]],
  outputDir: "results/artifacts",
  use: {
    baseURL: "http://localhost:4000",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node serve-site.mjs 4000",
    url: "http://localhost:4000/",
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
