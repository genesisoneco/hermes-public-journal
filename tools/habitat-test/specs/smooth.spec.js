// Animation smoothness: in-between (smooth) atlas pages, crossfades, anim
// transitions, walk cycle synced to ground speed, and position continuity.
import { test, expect, chromium } from "@playwright/test";
import { hab, waitReady, collectErrors } from "./helpers.js";

// KST clock with seconds (helpers.kst takes HH:MM only).
const kst = (hms) => `2026-09-19T${hms.length === 5 ? hms + ":00" : hms}+09:00`;

const motion = (page) => page.evaluate(() => window.__habitat.motion());
// Sample motion() every rAF for `ms`.
const sampleMotion = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  const out = [], t0 = performance.now();
  const f = (t) => { out.push(window.__habitat.motion()); if (t - t0 < ms) requestAnimationFrame(f); else res(out); };
  requestAnimationFrame(f);
}), ms);
const hasSmooth = (a) => Object.values(a.anims).some((x) => x.s);
// Serve atlas.json without the in-between pages (the pre-RIFE atlas).
const stripSmooth = (page) => page.route(/habitat\/atlas\/atlas\.json/, async (route) => {
  const r = await route.fetch(), j = await r.json();
  for (const k in j.anims) delete j.anims[k].s;
  for (const p of Object.keys(j.pages)) if (/smooth/.test(p)) delete j.pages[p];
  await route.fulfill({ response: r, json: j });
});

test.describe("desktop 1280", () => {
  test("walk plays the in-between sequence once trinity-smooth-core is loaded", async ({ page, request }) => {
    const atlas = await (await request.get("/assets/habitat/atlas/atlas.json")).json();
    test.skip(!hasSmooth(atlas), "atlas has no smooth (s) sequences yet");
    const errs = collectErrors(page);
    await page.goto(hab("/live/", { clock: kst("09:58:28") }));
    await waitReady(page);
    await page.waitForFunction(() => window.__habitat.motion().pages.includes("trinity-smooth-core"), null, { timeout: 20_000 });
    await page.waitForFunction(() => /^walk_/.test(window.__habitat.motion().key), null, { timeout: 20_000, polling: "raf" });
    const ms = (await sampleMotion(page, 1500)).filter((m) => /^walk_/.test(m.key));
    expect(ms.length).toBeGreaterThan(20);
    expect(ms.every((m) => m.smooth)).toBe(true);
    // Walk in-betweens have no held frames → no crossfade needed; playback rate tracks ground speed.
    expect(ms.filter((m) => m.blend > 0 && !m.trans).length).toBe(0);
    for (const m of ms) { expect(m.rate).toBeGreaterThanOrEqual(0.6); expect(m.rate).toBeLessThanOrEqual(1.6); }
    expect(errs).toEqual([]);
  });

  test("without smooth pages: source frames crossfade, anim changes crossfade", async ({ page }) => {
    const errs = collectErrors(page);
    await stripSmooth(page);
    await page.goto(hab("/live/", { clock: kst("09:51:06") })); // sit → hack
    await waitReady(page);
    await page.waitForFunction(() => window.__habitat.motion().trans, null, { timeout: 20_000, polling: "raf" }); // sit→hack transition
    await page.waitForFunction(() => window.__habitat.motion().key === "hack", null, { timeout: 20_000, polling: "raf" });
    const ms = await sampleMotion(page, 2500);
    expect(ms.some((m) => m.smooth)).toBe(false);
    const mid = ms.filter((m) => m.blend > 0.05 && m.blend < 0.95 && !m.trans);
    expect(mid.length).toBeGreaterThan(3); // crossfade drawn around every frame switch
    expect(ms.filter((m) => m.blend > 0).length).toBeLessThan(ms.length * 0.6); // …but only at the end of each frame
    expect(errs).toEqual([]);
  });

  test("missing smooth page files degrade to crossfaded source frames", async ({ page }) => {
    const errs = collectErrors(page);
    await page.route(/trinity-smooth-(core|ext)@/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(hab("/live/", { clock: kst("10:00:05") })); // dancing
    await waitReady(page);
    await page.waitForTimeout(2500);
    const ms = await sampleMotion(page, 1500);
    expect(ms.some((m) => m.smooth)).toBe(false);
    expect(ms.some((m) => m.blend > 0 && m.blend < 1)).toBe(true);
    expect(errs.filter((e) => !/404|Failed to load/.test(e))).toEqual([]);
  });

  test("reduced motion never fetches smooth pages and draws no crossfades", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(), urls = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(hab("/live/", { clock: kst("10:00:05") }));
    await waitReady(page);
    await page.waitForTimeout(7000);
    const m = await motion(page);
    expect(urls.filter((u) => /smooth/.test(u))).toEqual([]);
    expect(m.smooth).toBe(false);
    expect(m.blend).toBe(0);
    await ctx.close();
  });

  test("no position jump > 0.1 tiles/frame over 60 s (offline, real time, with gestures)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(hab("/live/", { clock: kst("09:57:44") })); // walks, plan changes, interrupts + recovery walks
    await waitReady(page);
    const r = await page.evaluate(() => new Promise((res) => {
      const H = window.__habitat; let prev = H.pos(), pa = H.anim(), lt = performance.now(), max = 0, pk = 0; const t0 = lt, bad = [];
      const f = (t) => {
        const c = H.pos(), a = H.anim(), d = Math.hypot(c.i - prev.i, c.j - prev.j), norm = d / (Math.max(1, t - lt) / 16.667);
        if (!/fall/.test(a + pa) && c.z < 1 && prev.z < 1) { max = Math.max(max, norm); if (norm > 0.1) bad.push([((t - t0) / 1000).toFixed(2), pa + ">" + a, norm.toFixed(3)]); }
        prev = c; pa = a; lt = t;
        if (t - t0 > (pk + 1) * 7000) { pk++; H.emit(pk % 2 ? "poke" : "tickle"); }
        if (t - t0 < 60_000) requestAnimationFrame(f); else res({ max, bad });
      };
      requestAnimationFrame(f);
    }));
    test.info().annotations.push({ type: "continuity", description: `max ${r.max.toFixed(3)} tiles per 60 Hz frame` });
    expect(r.bad).toEqual([]);
  });

  test("clockrate=30: no position jumps while she's standing (60 s offline)", async ({ page }) => {
    test.setTimeout(120_000);
    // At 30× walks cover ~0.8 tiles per frame by design, so jumps are measured
    // where she should be still: late plans / interrupt landings used to snap here.
    await page.goto(hab("/live/", { clock: kst("06:00"), clockrate: "30" }));
    await waitReady(page);
    const r = await page.evaluate(() => new Promise((res) => {
      const H = window.__habitat, LOCO = /^(walk|run|carry|hover|fall|turn|teleport|fly|dash)/; let prev = H.pos(), pa = H.anim(), max = 0, lt = performance.now(); const t0 = performance.now(), bad = [];
      const f = (t) => {
        const c = H.pos(), a = H.anim(), d = Math.hypot(c.i - prev.i, c.j - prev.j);
        if (!LOCO.test(a) && !LOCO.test(pa) && c.z < 1 && prev.z < 1) { max = Math.max(max, d); if (d > 0.1) bad.push([((t - t0) / 1000).toFixed(2), pa + ">" + a, d.toFixed(3), Math.round(t - lt), H.motion().src]); }
        prev = c; pa = a; lt = t;
        if (t - t0 < 60_000) requestAnimationFrame(f); else res({ max, bad });
      };
      requestAnimationFrame(f);
    }));
    test.info().annotations.push({ type: "continuity30", description: `max stationary step ${r.max.toFixed(3)} tiles` });
    expect(r.bad).toEqual([]);
  });

  test("high refresh (uncapped rAF): animation and motion advance by real time", async () => {
    // A separate browser without vsync / frame-rate limit runs rAF far above 60 Hz
    // (stands in for 120/144 Hz displays). Phase must advance at 1/total per second
    // regardless of the rAF rate, and positions must move every frame (sub-pixel).
    const b = await chromium.launch({ args: ["--disable-gpu-vsync", "--disable-frame-rate-limit"] });
    const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("http://localhost:4000" + hab("/live/", { clock: kst("09:51:08") }));
    await waitReady(page);
    await page.waitForFunction(() => window.__habitat.motion().key === "hack", null, { timeout: 20_000, polling: "raf" });
    const r = await page.evaluate(() => new Promise((res) => {
      const H = window.__habitat; let n = 0, acc = 0, prevPh = null, total = 0; const t0 = performance.now();
      const f = (t) => {
        const m = H.motion(); n++; total = m.total;
        if (prevPh != null) acc += (m.phase - prevPh + 1) % 1;
        prevPh = m.phase;
        if (t - t0 < 3000) requestAnimationFrame(f); else res({ fps: (n * 1000) / (t - t0), cycles: acc, secs: (t - t0) / 1000, total });
      };
      requestAnimationFrame(f);
    }));
    await b.close();
    test.info().annotations.push({ type: "hz", description: `rAF ${r.fps.toFixed(0)} Hz, ${r.cycles.toFixed(3)} cycles in ${r.secs.toFixed(2)} s (expected ${(r.secs / r.total).toFixed(3)})` });
    expect(r.fps).toBeGreaterThan(90);
    expect(Math.abs(r.cycles - r.secs / r.total) / (r.secs / r.total)).toBeLessThan(0.05);
  });
});

test.describe("mobile 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test("phones get the @1x in-between page (sprite is drawn below @1x size)", async ({ page, request }) => {
    const atlas = await (await request.get("/assets/habitat/atlas/atlas.json")).json();
    test.skip(!hasSmooth(atlas), "atlas has no smooth (s) sequences yet");
    const urls = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(hab("/", { clock: kst("09:58:28") }));
    await page.locator("[data-habitat]").scrollIntoViewIfNeeded();
    await waitReady(page);
    await page.waitForFunction(() => window.__habitat.motion().pages.includes("trinity-smooth-core"), null, { timeout: 20_000 });
    const sm = urls.filter((u) => /trinity-smooth-core/.test(u));
    expect(sm.length).toBeGreaterThan(0);
    expect(sm.every((u) => /@1x/.test(u))).toBe(true);
    expect(urls.some((u) => /trinity-core@2x/.test(u))).toBe(true); // core stays @2x
  });
});
