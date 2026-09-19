// perf: 4x CPU throttle at mobile size → median frame time; loop stops
// offscreen / hidden tab; JS heap.
import { test, expect } from "@playwright/test";
import { hab, kst, waitReady } from "./helpers.js";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const countRaf = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__rafN = 0;
  window.requestAnimationFrame = (cb) => { window.__rafN++; return raf(cb); };
};
const rafIn = async (page, ms) => { const a = await page.evaluate(() => window.__rafN); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__rafN)) - a; };

for (const [path, label] of [["/", "embed"], ["/live/", "full"]]) {
  test(`frame time under 4x CPU throttle (${label}, 390 @2x)`, async ({ page }) => {
    await page.goto(hab(path, { clock: kst("10:00") })); // dancing/walking: busiest anim + particles
    await waitReady(page);
    await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => new Promise((res) => {
      const d = []; let last = performance.now(); const t0 = last;
      const f = (t) => { d.push(t - last); last = t; if (t - t0 < 6000) requestAnimationFrame(f); else res(d); };
      requestAnimationFrame(f);
    }));
    r.sort((a, b) => a - b);
    const med = r[Math.floor(r.length / 2)], p95 = r[Math.floor(r.length * 0.95)];
    const fps = await page.evaluate(() => window.__habitat.fps());
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.send("Performance.enable");
    const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
    const heap = m.JSHeapUsedSize / 1048576;
    test.info().annotations.push({ type: "perf", description: `median=${med.toFixed(1)}ms p95=${p95.toFixed(1)}ms frames=${r.length} engineFps=${fps} heap=${heap.toFixed(1)}MB` });
    expect(med).toBeLessThan(33);
    expect(heap).toBeLessThan(60);
  });
}

test("loop stops offscreen and when the tab is hidden", async ({ page }) => {
  await page.addInitScript(countRaf);
  await page.goto(hab("/", { clock: kst("10:00") }));
  await waitReady(page);
  await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded();
  const on = await rafIn(page, 1000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const off = await rafIn(page, 1500);
  await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const back = await rafIn(page, 1000);
  // Hidden tab: flip document.hidden and fire visibilitychange.
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300);
  const hidden = await rafIn(page, 1500);
  test.info().annotations.push({ type: "loop", description: `rAF/s visible=${on} offscreen=${(off / 1.5).toFixed(1)} back=${back} hidden=${(hidden / 1.5).toFixed(1)}` });
  expect(on).toBeGreaterThan(30);
  expect(off).toBeLessThan(3);
  expect(back).toBeGreaterThan(30);
  expect(hidden).toBeLessThan(3);
});

test("heap stays flat over 30 s of play (offline sim + gestures)", async ({ page }) => {
  await page.goto(hab("/live/", { clock: kst("10:00"), clockrate: "20" }));
  await waitReady(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); const m = (await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "JSHeapUsedSize"); return m.value / 1048576; };
  const h0 = await heap();
  for (let k = 0; k < 30; k++) { await page.evaluate((g) => window.__habitat.emit(g), ["poke", "pet", "tickle", "wave", "feed", "toss"][k % 6]); await page.waitForTimeout(1000); }
  const h1 = await heap();
  test.info().annotations.push({ type: "heap", description: `after GC: start=${h0.toFixed(1)}MB end=${h1.toFixed(1)}MB (clockrate 20 → ~10 sim-minutes)` });
  expect(h1).toBeLessThan(40);
  expect(h1 - h0).toBeLessThan(8);
});
