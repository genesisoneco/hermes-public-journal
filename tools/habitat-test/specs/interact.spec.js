// interact: pointer gestures, spam escalation, pet, fling, tray, keyboard parity.
// Offline authority, fixed clock 18:20 KST (she's listening to music on the rug, stationary).
import { test, expect } from "@playwright/test";
import { hab, kst, waitReady, interrupt } from "./helpers.js";

const URL = (path = "/live/") => hab(path, { clock: kst("18:20") });

// Install a watcher that timestamps the first interrupt with a given gesture,
// measured from the pointerup / click / keydown that caused it.
async function armWatch(page, gesture) {
  await page.evaluate((g) => {
    window.__w = { t0: null, t1: null };
    const cv = document.querySelector(".habitat__canvas");
    const mark = () => { if (window.__w.t0 == null) window.__w.t0 = performance.now(); };
    cv.addEventListener("pointerup", mark, { once: true, capture: true });
    for (const b of document.querySelectorAll("[data-gesture],[data-item]")) b.addEventListener("click", mark, { once: true, capture: true });
    document.querySelector("[data-hab-stage]").addEventListener("keydown", mark, { once: true, capture: true });
    const poll = () => {
      const s = window.__habitat.state();
      if (s.interrupt && s.interrupt.gesture === g && window.__w.t0 != null) { window.__w.t1 = performance.now(); return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }, gesture);
}
const latency = (page) => page.waitForFunction(() => window.__w.t1 != null && window.__w.t1 - window.__w.t0, null, { timeout: 5000 }).then((h) => h.jsonValue());
const herXY = (page) => page.evaluate(() => window.__habitat.screen());

test.describe("interact", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL()); await waitReady(page);
    // Stage + toolbar/tray both on screen (the tray sits below the stage).
    await page.evaluate(() => document.querySelector(".habitat__bar").scrollIntoView({ block: "end" })); await page.waitForTimeout(400);
  });

  test("poke via toolbar reacts within ~150 ms", async ({ page }) => {
    await armWatch(page, "poke");
    await page.click(".habitat-btn[data-gesture=poke]");
    const ms = await latency(page);
    test.info().annotations.push({ type: "latency", description: `toolbar poke → reaction ${ms.toFixed(0)} ms` });
    expect(ms).toBeLessThan(150);
  });

  test("poke via tap on her reacts within 150 ms (no double-tap wait)", async ({ page }) => {
    await armWatch(page, "poke");
    const p = await herXY(page);
    await page.mouse.click(p.x, p.y);
    const ms = await latency(page);
    test.info().annotations.push({ type: "latency", description: `tap poke → reaction ${ms.toFixed(0)} ms` });
    expect(ms, "tap poke fires on pointerup; a 2nd tap upgrades it to a tickle").toBeLessThan(150);
  });

  test("double-tap tickles", async ({ page }) => {
    const p = await herXY(page);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("tickle");
  });

  test("rapid pokes escalate: angry → shield", async ({ page }) => {
    const seen = new Set(), kinds = new Set();
    const start = Date.now();
    for (let k = 0; k < 34; k++) {
      await page.click(".habitat-btn[data-gesture=poke]");
      await page.waitForTimeout(235);
      const it = await interrupt(page); if (it) { kinds.add(it.kind); for (const a of it.anims || []) seen.add(a); }
      seen.add(await page.evaluate(() => window.__habitat.anim()));
    }
    const s = await page.evaluate(() => ({ annoy: window.__habitat.state().world.crowd.annoyance, status: window.__habitat.state().status }));
    test.info().annotations.push({ type: "spam", description: `in ${(Date.now() - start) / 1000}s anims=${[...seen].join(",")} kinds=${[...kinds].join(",")} annoy=${s.annoy.toFixed(2)}` });
    expect([...seen].some((a) => /angry/.test(a))).toBe(true);
    expect(kinds.has("shield")).toBe(true);
  });

  test("teleport reachable from one client (teleportAt 35 in 10 s vs 220 ms client throttle)", async ({ page }) => {
    // One gesture per 220 ms (≤45 per 10 s) comfortably passes CROWD.spam.teleportAt = 35.
    const kinds = new Set(); let at = null; const t0 = Date.now();
    for (let k = 0; k < 50 && !kinds.has("teleport"); k++) {
      await page.evaluate(() => window.__habitat.emit("poke")); await page.waitForTimeout(225);
      const it = await interrupt(page); if (it) { kinds.add(it.kind); if (it.kind === "teleport" && at == null) at = k + 1; }
    }
    test.info().annotations.push({ type: "teleport", description: `kinds seen: ${[...kinds].join(",")}; teleport at poke #${at} after ${((Date.now() - t0) / 1000).toFixed(1)} s` });
    expect(kinds.has("shield")).toBe(true);
    expect(kinds.has("teleport"), "single-client teleport reachable").toBe(true);
  });

  test("long-press pets: happy/love", async ({ page }) => {
    const p = await herXY(page);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.waitForTimeout(1300);
    const it = await interrupt(page);
    const a = await page.evaluate(() => window.__habitat.anim());
    await page.mouse.up();
    expect(it && it.gesture).toBe("pet");
    expect((it.anims || []).concat(a).some((x) => /happy|love/.test(x))).toBe(true);
  });

  test("drag + fling: airborne, then lands", async ({ page }) => {
    const p = await herXY(page), before = await page.evaluate(() => window.__habitat.pos());
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 15, p.y - 10, { steps: 3 });
    await page.waitForTimeout(250);
    const held = await page.evaluate(() => ({ ...window.__habitat.pos(), anim: window.__habitat.anim(), status: window.__habitat.state().status }));
    for (let k = 1; k <= 5; k++) { await page.mouse.move(p.x + 15 + k * 40, p.y - 10 - k * 6); await page.waitForTimeout(16); }
    await page.mouse.up();
    const zs = [];
    for (let k = 0; k < 20; k++) { zs.push(await page.evaluate(() => window.__habitat.pos().z)); await page.waitForTimeout(50); }
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => ({ ...window.__habitat.pos(), anim: window.__habitat.anim() }));
    test.info().annotations.push({ type: "fling", description: `held z=${held.z.toFixed(0)} (${held.anim}, "${held.status}") maxZ after release=${Math.max(...zs).toFixed(0)} from ${before.i.toFixed(1)},${before.j.toFixed(1)} → ${after.i.toFixed(1)},${after.j.toFixed(1)} ${after.anim}` });
    expect(held.z).toBeGreaterThan(10);
    expect(Math.max(...zs)).toBeGreaterThan(5);
    expect(after.z).toBeLessThan(1);
  });

  test("tray: tap carrot feeds her", async ({ page }) => {
    await page.click(".habitat-item[data-item=carrot]");
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("feed");
  });

  test("tray: drag carrot onto her feeds her", async ({ page }) => {
    const btn = await page.locator(".habitat-item[data-item=carrot]").boundingBox();
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2); await page.mouse.down();
    await page.mouse.move(btn.x + 30, btn.y - 30, { steps: 4 });
    const p2 = await herXY(page);
    await page.mouse.move(p2.x, p2.y, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("feed");
  });

  for (const item of ["ball", "box"]) test(`tray: ${item} tosses (tap, then drag to floor)`, async ({ page }) => {
    await page.click(`.habitat-item[data-item=${item}]`);
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("toss");
    await page.waitForTimeout(3500);
    const st = await page.locator("[data-hab-stage]").boundingBox(), btn = await page.locator(`.habitat-item[data-item=${item}]`).boundingBox();
    await page.click(".habitat-btn[data-gesture=wave]"); await page.waitForTimeout(400);
    await page.mouse.move(btn.x + 10, btn.y + 10); await page.mouse.down();
    await page.mouse.move(st.x + st.width * 0.3, st.y + st.height * 0.75, { steps: 10 }); await page.mouse.up();
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("toss");
  });

  test("keyboard + toolbar parity with gestures", async ({ page }) => {
    const got = {};
    await page.focus("[data-hab-stage]");
    for (const [key] of [["p"], ["t"], ["h"], ["w"], ["s"], ["ArrowLeft"]]) {
      await page.waitForTimeout(3000);
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      got["key:" + key] = (await interrupt(page))?.gesture;
    }
    for (const g of ["wave", "poke", "pet", "tickle", "push"]) {
      await page.waitForTimeout(3000);
      await page.click(`.habitat-btn[data-gesture=${g}]`); await page.waitForTimeout(150);
      got["btn:" + g] = (await interrupt(page))?.gesture;
    }
    test.info().annotations.push({ type: "parity", description: JSON.stringify(got) });
    expect(got).toEqual({ "key:p": "poke", "key:t": "tickle", "key:h": "pet", "key:w": "wave", "key:s": "push", "key:ArrowLeft": "push",
      "btn:wave": "wave", "btn:poke": "poke", "btn:pet": "pet", "btn:tickle": "tickle", "btn:push": "push" });
    // Tray is keyboard reachable too (real <button>s).
    await page.waitForTimeout(3000);
    await page.focus(".habitat-item[data-item=battery]"); await page.keyboard.press("Enter");
    await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("feed");
  });
});

test("home embed: tap poke works in the cropped view", async ({ page }) => {
  await page.goto(URL("/")); await waitReady(page); await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const p = await herXY(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await interrupt(page))?.gesture, { timeout: 3000 }).toBe("poke");
});
