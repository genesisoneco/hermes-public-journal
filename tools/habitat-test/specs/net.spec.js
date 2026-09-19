// net (mock): a ws-package server on :8787 plays the Durable Object.
// On localhost the client always dials ws://localhost:8787/api/habitat/ws.
import { test, expect } from "@playwright/test";
import { WebSocketServer } from "ws";

const PORT = 8787;
let wss = null, clients = [], inbox = [], seq = 0, origins = [];

function world() {
  return { pos: { i: 8, j: 5 }, facing: "R", energy: 64, mood: { valence: 0.2, arousal: 0.1, label: "curious" },
    crowd: { affection: 0.3, annoyance: 0 }, items: [], wishlist: [], skills: { dancing: { xp: 120, lvl: 2 } }, days_alive: 132, kst_date: "2026-09-19" };
}
const walkPlan = (id, from, to, t0, ms) => ({ id, activity: "wander", status: "Wandering around the room", started_at: t0, ends_at: t0 + ms + 20000,
  steps: [{ kind: "walk", t0, t1: t0 + ms, path: [from, to], speed: Math.hypot(to[0] - from[0], to[1] - from[1]) / (ms / 1000), anim: "walk" },
          { kind: "anim", t0: t0 + ms, t1: t0 + ms + 20000, anim: "idle", loop: true }] });

let snapPlan = null;
function start() {
  return new Promise((res) => {
    wss = new WebSocketServer({ port: PORT, path: "/api/habitat/ws" }, res);
    wss.on("connection", (ws, req) => {
      origins.push(req.headers.origin); clients.push(ws);
      const now = Date.now();
      snapPlan = walkPlan(1, [2, 5], [8, 5], now + 200, 6000);
      seq = 1;
      ws.send(JSON.stringify({ t: "hello", v: 1, rules_version: "test", you: { id: "v1", color: "#7ee0a8" }, now }));
      ws.send(JSON.stringify({ t: "snap", seq, world: world(), plan: snapPlan, interrupt: null, brief: null, presence: { n: 1, colors: ["#7ee0a8"] }, recent: [] }));
      ws.on("message", (d) => {
        const s = d.toString(); inbox.push(s);
        if (s === "ping") return ws.send("pong");
        const m = JSON.parse(s);
        if (m.t === "i") ws.send(JSON.stringify({ t: "ev", seq: ++seq, kind: "reaction", by: "#7ee0a8", at: Date.now(), nonce: m.nonce, data: { gesture: m.k } }));
      });
    });
  });
}
const send = (m) => clients.forEach((c) => c.readyState === 1 && c.send(JSON.stringify(m)));
function kill() {
  return new Promise((res) => { for (const c of clients) c.terminate(); clients = []; wss.close(() => res()); });
}

test.describe.configure({ mode: "serial" });
test.describe("net (mock WS)", () => {
  let page;
  test.beforeAll(async ({ browser }) => {
    await start();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("/live/?habitat=debug&seed=7");
    await expect(page.locator("[data-habitat]")).toHaveAttribute("data-net", "live", { timeout: 15_000 });
    await page.locator("[data-hab-stage]").scrollIntoViewIfNeeded();
  });
  test.afterAll(async () => { await page?.close(); if (wss) await kill().catch(() => {}); });

  test("Origin header is sent and HUD shows live presence", async () => {
    expect(origins[0]).toBe("http://localhost:4000");
    await expect(page.locator(".habitat-hud__watch")).toHaveText("1 watching");
    send({ t: "pr", seq: ++seq, n: 3, colors: [] });
    await expect(page.locator(".habitat-hud__watch")).toHaveText("3 watching");
  });

  test("position interpolates along the snap's walk path", async () => {
    const t0 = snapPlan.steps[0].t0, t1 = snapPlan.steps[0].t1;
    const errs = [];
    await page.waitForFunction((t) => Date.now() > t + 500, t0);
    for (let k = 0; k < 8; k++) {
      const s = await page.evaluate(() => ({ ...window.__habitat.pos(), now: Date.now(), anim: window.__habitat.anim() }));
      const u = Math.max(0, Math.min(1, (s.now - t0) / (t1 - t0)));
      if (u > 0 && u < 1) { errs.push(Math.abs(s.i - (2 + 6 * u)) + Math.abs(s.j - 5)); expect(s.anim).toMatch(/^walk_/); }
      await page.waitForTimeout(500);
    }
    test.info().annotations.push({ type: "interp", description: `samples=${errs.length} maxErr=${Math.max(...errs).toFixed(3)} tiles` });
    expect(errs.length).toBeGreaterThan(4);
    expect(Math.max(...errs)).toBeLessThan(0.25);
    await page.waitForFunction((t) => Date.now() > t + 300, t1);
    const end = await page.evaluate(() => window.__habitat.pos());
    expect(Math.abs(end.i - 8) + Math.abs(end.j - 5)).toBeLessThan(0.1);
  });

  test("a follow-up plan message drives the next walk", async () => {
    const now = Date.now(), p = walkPlan(2, [8, 5], [8, 2], now, 3000);
    send({ t: "plan", seq: ++seq, plan: p });
    await page.waitForTimeout(1500);
    const mid = await page.evaluate(() => window.__habitat.pos());
    expect(mid.j).toBeLessThan(4.6); expect(mid.j).toBeGreaterThan(2.4);
    await expect(page.locator(".habitat-hud__text")).toHaveText("Wandering around the room");
  });

  test("own gesture: frame shape, prediction, nonce echo", async () => {
    inbox = [];
    await page.click(".habitat-btn[data-gesture=poke]");
    await expect.poll(() => inbox.find((s) => s.startsWith("{") && JSON.parse(s).t === "i"), { timeout: 3000 }).toBeTruthy();
    const m = JSON.parse(inbox.find((s) => s.startsWith("{") && JSON.parse(s).t === "i"));
    expect(m).toMatchObject({ t: "i", k: "poke" }); expect(m.nonce).toMatch(/^\w{4,12}$/);
    const it = await page.evaluate(() => window.__habitat.state().interrupt);
    expect(it && it.gesture).toBe("poke"); // predicted locally
  });

  test("remote teleport event is applied", async () => {
    await page.waitForTimeout(2600);
    const now = Date.now();
    send({ t: "ev", seq: ++seq, kind: "teleport", by: "#ff00aa", at: now, data: { gesture: "poke" },
      reaction: { gesture: "poke", anims: ["teleport_out", "teleport_in"], annoyDelta: 0, affectionDelta: 0, energyDelta: 0, interrupt: { kind: "teleport", untilMs: now + 2200, pos: { i: 7, j: 7 } } } });
    await expect.poll(() => page.evaluate(() => window.__habitat.state().interrupt?.kind), { timeout: 2000 }).toBe("teleport");
    await expect(page.locator(".habitat-hud__ticker")).toContainText("teleported");
  });

  test("seq gap triggers a resync request", async () => {
    inbox = [];
    seq += 5; send({ t: "stat", seq, energy: 50 });
    await expect.poll(() => inbox.includes('{"t":"resync"}'), { timeout: 3000 }).toBe(true);
  });

  test("socket dies → solo view (offline sim) → reconnect resumes live", async () => {
    await kill();
    const t = Date.now();
    await expect(page.locator("[data-habitat]")).toHaveAttribute("data-net", "offline", { timeout: 10_000 });
    await expect(page.locator(".habitat-hud__watch")).toHaveText("solo view");
    const offMs = Date.now() - t;
    const anim = await page.evaluate(() => window.__habitat.anim());
    expect(anim).toBeTruthy();
    await start();
    const t2 = Date.now();
    await expect(page.locator("[data-habitat]")).toHaveAttribute("data-net", "live", { timeout: 40_000 });
    await expect(page.locator(".habitat-hud__watch")).toHaveText("1 watching");
    test.info().annotations.push({ type: "reconnect", description: `offline after ${offMs} ms; live again ${Date.now() - t2} ms after server restart` });
  });
});
