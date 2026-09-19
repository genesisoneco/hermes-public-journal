// budget: gz sizes of habitat JS and atlas WebP totals (see ../budget.mjs).
import { test, expect } from "@playwright/test";

test("size budgets", async () => {
  const b = (await import("../budget.mjs")).default;
  test.info().annotations.push({ type: "budget", description:
    `boot ${b.boot.gz} B gz | shipped bundle ${b.shippedBundle.gzKB} KB gz | raw graph: client ${b.client.gzKB} KB + sim ${b.sim.gzKB} KB = ${b.habitatJsGzKB} KB gz (per-file) | esbuild bundle+min ${b.esbuild.bundleMinGzKB} KB gz | ` +
    `atlas webp ${b.atlas.webpTotalKB} KB (@1x ${b.atlas.webp1xKB}, @2x ${b.atlas.webp2xKB}, core@2x ${b.atlas.coreAt2xKB}) | lazy in-betweens @1x ${b.atlas.smooth1xKB} KB, @2x ${b.atlas.smooth2xKB} KB` });
  expect(b.boot.gz, "boot < 2 KB gz").toBeLessThan(2048);
  expect(b.atlas.webpTotalKB, "atlas WebP (excl. lazy in-betweens) < 1.5 MB").toBeLessThan(1536);
  expect(b.atlas.coreAt2xKB, "trinity-core@2x < 700 KB").toBeLessThan(700);
  expect(b.atlas.smooth1xKB, "smooth pages @1x ≤ 1.6 MB").toBeLessThanOrEqual(1.6 * 1024);
  expect(b.atlas.smooth2xKB, "smooth pages @2x ≤ 3.5 MB").toBeLessThanOrEqual(3.5 * 1024);
  expect(b.shippedBundle.gzKB, "shipped habitat bundle < 60 KB gz").toBeLessThan(60);
});
