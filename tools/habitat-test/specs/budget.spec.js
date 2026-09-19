// budget: gz sizes of habitat JS and atlas WebP totals (see ../budget.mjs).
import { test, expect } from "@playwright/test";

test("size budgets", async () => {
  const b = (await import("../budget.mjs")).default;
  test.info().annotations.push({ type: "budget", description:
    `boot ${b.boot.gz} B gz | shipped bundle ${b.shippedBundle.gzKB} KB gz | raw graph: client ${b.client.gzKB} KB + sim ${b.sim.gzKB} KB = ${b.habitatJsGzKB} KB gz (per-file) | esbuild bundle+min ${b.esbuild.bundleMinGzKB} KB gz | ` +
    `atlas webp ${b.atlas.webpTotalKB} KB (@1x ${b.atlas.webp1xKB}, @2x ${b.atlas.webp2xKB}, core@2x ${b.atlas.coreAt2xKB})` });
  expect(b.boot.gz, "boot < 2 KB gz").toBeLessThan(2048);
  expect(b.atlas.webpTotalKB, "atlas WebP < 1.5 MB").toBeLessThan(1536);
  expect(b.atlas.coreAt2xKB, "trinity-core@2x < 700 KB").toBeLessThan(700);
  expect(b.shippedBundle.gzKB, "shipped habitat bundle < 60 KB gz").toBeLessThan(60);
});
