// a11y: axe on the habitat region, reduced motion = no rAF loop, aria-live status.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hab, kst, waitReady } from "./helpers.js";

for (const path of ["/", "/live/"]) for (const theme of ["dark", "light"]) {
  test(`axe: no serious/critical in habitat ${path} ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(hab(path, { clock: kst("14:10") }));
    await waitReady(page); await page.waitForTimeout(800);
    const res = await new AxeBuilder({ page }).include("[data-habitat]").analyze();
    const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    const all = res.violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    test.info().annotations.push({ type: "axe", description: all.join(" ; ") || "clean" });
    expect(bad.map((v) => v.id)).toEqual([]);
  });
}

test("reduced motion: no continuous rAF loop, static redraws only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__rafN = 0;
    window.requestAnimationFrame = (cb) => { window.__rafN++; return raf(cb); };
  });
  await page.goto(hab("/live/", { clock: kst("18:20") }));
  await waitReady(page);
  await page.waitForTimeout(1000);
  const a = await page.evaluate(() => window.__rafN);
  await page.waitForTimeout(5000);
  const b = await page.evaluate(() => window.__rafN);
  test.info().annotations.push({ type: "raf", description: `${b - a} rAF calls in 5 s under reduced motion` });
  expect(b - a).toBeLessThan(6); // ≈1 redraw per 4 s tick; 60 fps would be ~300
  // Still interactive: a gesture triggers a redraw.
  await page.click(".habitat-btn[data-gesture=wave]");
  await expect.poll(() => page.evaluate(() => window.__habitat.state().interrupt?.gesture)).toBe("wave");
});

test("aria-live status reflects her activity and updates", async ({ page }) => {
  await page.goto(hab("/live/", { clock: kst("18:20") }));
  await waitReady(page);
  const live = page.locator("[data-hab-live]");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(/^Trinity: .+/);
  const before = await live.textContent();
  await page.click(".habitat-btn[data-gesture=push]");
  await expect.poll(() => live.textContent(), { timeout: 3000 }).not.toBe(before);
  test.info().annotations.push({ type: "live", description: `${before} → ${await live.textContent()}` });
  // Canvas is aria-hidden; the stage is a focusable, labelled group.
  await expect(page.locator(".habitat__canvas")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("[data-hab-stage]")).toHaveAttribute("tabindex", "0");
  await expect(page.locator("[data-hab-stage]")).toHaveAttribute("aria-label", /Keys/);
});
