// net (live): real Worker + Durable Object under `wrangler dev` on :8787.
// Spawns wrangler itself and stops it by PID (tree) afterwards.
// Skip with HABITAT_SKIP_LIVE=1.
import { test, expect } from "@playwright/test";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const WORKER = join(fileURLToPath(new URL(".", import.meta.url)), "../../../worker");
let proc = null, log = "";

async function up(ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch("http://localhost:8787/api/habitat/state"); if (r.ok) return await r.json(); } catch (e) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("wrangler dev did not come up:\n" + log.slice(-2000));
}

test.describe.configure({ mode: "serial" });
test.describe("net (live wrangler dev)", () => {
  test.skip(!!process.env.HABITAT_SKIP_LIVE, "HABITAT_SKIP_LIVE set");
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    proc = spawn("npx wrangler dev --port 8787 --var PIPELINE_TOKEN:dev", { cwd: WORKER, shell: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } });
    proc.stdout.on("data", (d) => (log += d)); proc.stderr.on("data", (d) => (log += d));
    const snap = await up(150_000);
    expect(snap.plan).toBeTruthy();
  });
  test.afterAll(() => {
    if (proc && proc.pid) { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch (e) { /* already gone */ } }
  });

  test("two viewers: 2 watching, and a poke in A shows up in B", async ({ browser }) => {
    const ca = await browser.newContext({ viewport: { width: 1280, height: 900 } }), cb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await ca.newPage(), b = await cb.newPage();
    const errs = [];
    for (const p of [a, b]) p.on("pageerror", (e) => errs.push(e.message));
    await a.goto("/live/?habitat=debug"); await b.goto("/live/?habitat=debug");
    for (const p of [a, b]) {
      await p.locator("[data-hab-stage]").scrollIntoViewIfNeeded();
      await expect(p.locator("[data-habitat]")).toHaveAttribute("data-net", "live", { timeout: 20_000 });
    }
    await expect(a.locator(".habitat-hud__watch")).toHaveText("2 watching", { timeout: 10_000 });
    await expect(b.locator(".habitat-hud__watch")).toHaveText("2 watching", { timeout: 10_000 });
    // Same Trinity in both.
    const [pa, pb] = await Promise.all([a.evaluate(() => window.__habitat.state().plan.id), b.evaluate(() => window.__habitat.state().plan.id)]);
    expect(pa).toBe(pb);
    await a.waitForTimeout(500);
    const t = Date.now();
    await a.click(".habitat-btn[data-gesture=poke]");
    await expect.poll(() => b.evaluate(() => (window.__habitat.state().interrupt || {}).gesture), { timeout: 5000 }).toBe("poke");
    const lag = Date.now() - t;
    await expect(b.locator(".habitat-log")).toContainText("someone poked her", { timeout: 5000 });
    await expect(a.locator(".habitat-log")).toContainText("you poked her");
    test.info().annotations.push({ type: "live", description: `A→B poke visible after ${lag} ms; plan ${pa}` });
    // One leaves → the other sees 1 watching.
    await ca.close();
    await expect(b.locator(".habitat-hud__watch")).toHaveText("1 watching", { timeout: 10_000 });
    await cb.close();
    expect(errs).toEqual([]);
  });

  test("one viewer poking rapidly reaches shield, then teleport", async ({ page }) => {
    await page.goto("/live/?habitat=debug");
    await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-habitat]")).toHaveAttribute("data-net", "live", { timeout: 20_000 });
    await page.waitForTimeout(12_000); // let the previous test's spam window expire
    const kinds = new Set(); let at = null;
    for (let k = 0; k < 50 && !kinds.has("teleport"); k++) {
      await page.evaluate(() => window.__habitat.emit("poke")); await page.waitForTimeout(225);
      const it = await page.evaluate(() => (window.__habitat.state().interrupt || {}).kind);
      if (it) { kinds.add(it); if (it === "teleport" && at == null) at = k + 1; }
    }
    test.info().annotations.push({ type: "live-teleport", description: `kinds ${[...kinds].join(",")}; teleport at poke #${at}` });
    expect(kinds.has("shield")).toBe(true);
    expect(kinds.has("teleport")).toBe(true);
  });
});
