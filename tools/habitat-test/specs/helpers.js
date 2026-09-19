// Shared helpers for the habitat specs.
import { expect } from "@playwright/test";

// KST wall-clock → ISO with +09:00 offset (the flags parser uses Date.parse).
export const kst = (hhmm, date = "2026-09-19") => `${date}T${hhmm}:00+09:00`;
export const CLOCKS = { morning: "07:40", afternoon: "14:10", evening: "18:20", night: "21:30", sleep: "02:30" };

export function hab(path = "/", q = {}) {
  const p = new URLSearchParams({ habitat: "debug", net: "offline", seed: "7", ...q });
  return `${path}?${p.toString()}`;
}

// Console errors from our origin only (third-party API calls from other widgets are out of scope).
export function collectErrors(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const src = (m.location() && m.location().url) || "";
    if (/api.doaia.com/.test(src + m.text())) return; // production API widgets (supporters/replies), not the habitat
    errs.push("console: " + m.text() + (src ? " @ " + src : ""));
  });
  return errs;
}

export async function waitReady(page, sel = "[data-habitat]") {
  await expect(page.locator(sel)).toHaveClass(/is-ready/, { timeout: 20_000 });
  await page.waitForFunction(() => window.__habitat && window.__habitat.state().atlas, null, { timeout: 15_000 });
}

export async function scrollHabitatIntoView(page) {
  await page.locator("[data-habitat]").scrollIntoViewIfNeeded();
}

// Poll the page until fn(state) is truthy; returns elapsed ms.
export async function until(page, fnSrc, arg, timeout = 5000) {
  const h = await page.waitForFunction(fnSrc, arg, { timeout, polling: "raf" });
  return h.jsonValue();
}

export const interrupt = (page) => page.evaluate(() => { const s = window.__habitat.state(); return s.interrupt ? { kind: s.interrupt.kind, gesture: s.interrupt.gesture, anims: s.interrupt.anims } : null; });
