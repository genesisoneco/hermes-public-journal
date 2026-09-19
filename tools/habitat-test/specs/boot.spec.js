// boot: lazy loading, first paint, ready state, console hygiene, ?habitat=off.
import { test, expect } from "@playwright/test";
import { hab, kst, collectErrors, waitReady } from "./helpers.js";

for (const path of ["/", "/live/"]) {
  test.describe(`boot ${path}`, () => {
    test("no engine/atlas requests before window load", async ({ page }) => {
      await page.goto(hab(path, { clock: kst("14:10") }));
      await waitReady(page);
      const r = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const res = performance.getEntriesByType("resource").filter((e) => /\/habitat|habitat\//.test(e.name) && !/habitat-boot\.js/.test(e.name));
        return { loadEnd: nav.loadEventEnd, first: Math.min(...res.map((e) => e.startTime)), n: res.length,
          early: res.filter((e) => e.startTime < nav.loadEventEnd).map((e) => e.name) };
      });
      test.info().annotations.push({ type: "timing", description: `load=${r.loadEnd.toFixed(0)}ms firstHabitatReq=${r.first.toFixed(0)}ms n=${r.n}` });
      // bundle (or raw graph with ?habitat=dev) + atlas.json + eager atlas pages
      expect(r.n).toBeGreaterThanOrEqual(4);
      expect(r.early).toEqual([]);
    });

    test("canvas paints, is-ready set, zero console errors", async ({ page }) => {
      const errs = collectErrors(page);
      await page.goto(hab(path, { clock: kst("14:10") }));
      await waitReady(page);
      await page.waitForTimeout(1500);
      const px = await page.evaluate(() => {
        const cv = document.querySelector(".habitat__canvas"), c = cv.getContext("2d");
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let opaque = 0, colors = new Set();
        for (let k = 0; k < d.length; k += 4 * 97) { if (d[k + 3] > 0) opaque++; colors.add((d[k] >> 4) << 8 | (d[k + 1] >> 4) << 4 | (d[k + 2] >> 4)); }
        return { opaque, samples: d.length / (4 * 97), colors: colors.size, w: cv.width, h: cv.height };
      });
      expect(px.opaque / px.samples).toBeGreaterThan(0.5);
      expect(px.colors).toBeGreaterThan(40);
      await expect(page.locator("[data-habitat]")).toHaveAttribute("data-habitat-state", "ready");
      await expect(page.locator(".habitat-btn[data-gesture=poke]")).toBeEnabled();
      expect(errs).toEqual([]);
    });

    test("?habitat=off keeps the static card and loads no engine", async ({ page }) => {
      const reqs = [];
      page.on("request", (r) => { if (/js\/habitat\/|habitat\/atlas/.test(r.url())) reqs.push(r.url()); });
      await page.goto(`${path}?habitat=off`);
      await page.waitForLoadState("load");
      await page.waitForTimeout(3000);
      const el = page.locator("[data-habitat]");
      await expect(el).toHaveClass(/habitat--static/);
      await expect(page.locator(".habitat__static-note")).toBeVisible();
      await expect(page.locator(".habitat__bar")).toBeHidden();
      await expect(page.locator(".habitat__canvas")).toHaveCount(0);
      expect(reqs).toEqual([]);
    });
  });
}

test("default (net=live) on a host with no Worker falls back to solo view", async ({ page }) => {
  const errs = collectErrors(page);
  await page.goto(`/?habitat=debug&seed=7`);
  await waitReady(page);
  await expect(page.locator("[data-habitat]")).toHaveAttribute("data-net", "offline", { timeout: 12_000 });
  await expect(page.locator(".habitat-hud__watch")).toHaveText("solo view");
  test.info().annotations.push({ type: "console", description: errs.join(" | ") || "none" });
});
