// visual: {morning, afternoon, evening, night, sleep} × {dark, light} × {embed, full} × {1280, 390}.
// Saves element screenshots to shots/ and runs geometric layout checks
// (page overflow, HUD overlap/clipping, bubble/Trinity inside the stage).
import { test, expect } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hab, kst, CLOCKS, waitReady } from "./helpers.js";

const SHOTS = fileURLToPath(new URL("../shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

function layoutProbe() {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const inside = (a, o) => !a || (a.l >= o.l - 1 && a.r <= o.r + 1 && a.t >= o.t - 1 && a.b <= o.b + 1);
  const root = document.querySelector("[data-habitat]"), stage = R(root.querySelector("[data-hab-stage]"));
  const q = (s) => R(root.querySelector(s));
  const issues = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page h-overflow ${document.documentElement.scrollWidth}>${innerWidth}`);
  const st = q(".habitat-hud__status"), right = q(".habitat-hud__right"), ticker = q(".habitat-hud__ticker");
  if (hit(st, right)) issues.push("HUD status overlaps right chips");
  for (const [n, r] of [["status", st], ["chips", right], ["ticker", ticker]]) if (!inside(r, stage)) issues.push(`HUD ${n} clipped by stage`);
  const txt = root.querySelector(".habitat-hud__text");
  if (txt && txt.scrollWidth > txt.clientWidth + 1 && getComputedStyle(txt).textOverflow !== "ellipsis") issues.push("status text overflows without ellipsis");
  for (const c of root.querySelectorAll(".habitat-hud__right > *")) { const r = R(c); if (r && !inside(r, stage)) issues.push("chip clipped: " + c.className); }
  const br = R(root.querySelector(".habitat-bubble.is-on"));
  if (br && !inside(br, stage)) issues.push("bubble outside stage");
  if (br && (hit(br, st) || hit(br, right))) issues.push("bubble overlaps HUD");
  const bar = q(".habitat__bar");
  for (const b of root.querySelectorAll(".habitat__bar button, .habitat__bar a")) { const r = R(b); if (r && bar && !inside(r, bar)) issues.push("bar control overflows: " + (b.dataset.gesture || b.dataset.item || b.className)); }
  const bs = [...root.querySelectorAll(".habitat__controls .habitat-btn")].map(R).filter(Boolean);
  for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) if (hit(bs[a], bs[b])) issues.push("toolbar buttons overlap");
  const h = window.__habitat, s = h.screen(), p = h.pos();
  if (!(s.x > stage.l && s.x < stage.r && s.y > stage.t && s.y < stage.b)) issues.push(`Trinity body centre outside stage (${s.x | 0},${s.y | 0})`);
  if (p.i < -0.05 || p.j < -0.05 || p.i > 10.05 || p.j > 10.05) issues.push(`Trinity off the floor grid (${p.i.toFixed(2)},${p.j.toFixed(2)})`);
  if (hit(st, { l: s.x - 30, r: s.x + 30, t: s.y - 50, b: s.y + 40 })) issues.push("HUD status covers Trinity");
  if (hit(right, { l: s.x - 30, r: s.x + 30, t: s.y - 50, b: s.y + 40 })) issues.push("HUD chips cover Trinity");
  return { issues, anim: h.anim(), pos: { i: +p.i.toFixed(2), j: +p.j.toFixed(2) }, stage: { w: Math.round(stage.r - stage.l), h: Math.round(stage.b - stage.t) }, status: root.querySelector(".habitat-hud__text")?.textContent };
}

for (const mode of ["embed", "full"]) for (const width of [1280, 390]) for (const theme of ["dark", "light"]) {
  test.describe(`${mode} ${width} ${theme}`, () => {
    test.use({ viewport: { width, height: width > 500 ? 900 : 844 }, colorScheme: theme, deviceScaleFactor: width > 500 ? 1 : 2, isMobile: width < 500, hasTouch: width < 500 });
    for (const [tod, t] of Object.entries(CLOCKS)) {
      test(tod, async ({ page }) => {
        await page.goto(hab(mode === "embed" ? "/" : "/live/", { clock: kst(t), seed: "3" }));
        await waitReady(page);
        await page.locator("[data-habitat]").scrollIntoViewIfNeeded();
        await page.waitForTimeout(1800);
        const r = await page.evaluate(layoutProbe);
        const name = `${mode}-${width}-${theme}-${tod}.png`;
        await page.locator("[data-habitat]").screenshot({ path: SHOTS + name, animations: "allow" });
        appendFileSync(SHOTS + "report.jsonl", JSON.stringify({ name, ...r }) + "\n");
        test.info().annotations.push({ type: "layout", description: `${r.anim} @${r.pos.i},${r.pos.j} "${r.status}" ${r.issues.join("; ") || "ok"}` });
        expect.soft(r.issues, name).toEqual([]);
      });
    }
  });
}

