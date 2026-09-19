// Lighthouse (mobile preset, simulated throttling): home with vs without the
// habitat. N runs each (default 3), medians. Needs the _site server on :4000.
//   node lighthouse.mjs [runs]
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const RUNS = Number(process.argv[2] || 3);
const BASE = "http://localhost:4000/";
const URLS = { habitat: BASE, off: BASE + "?habitat=off" };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new", "--no-first-run"] });
const res = { habitat: [], off: [] };
try {
  for (let k = 0; k < RUNS; k++) for (const [name, url] of Object.entries(URLS)) { // interleave to spread noise
    const r = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"],
      // Third-party API widgets (supporters, replies) add network noise unrelated to the habitat.
      blockedUrlPatterns: ["*api.doaia.com*"] });
    const a = r.lhr.audits;
    const el = a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node || a["largest-contentful-paint-element"]?.details?.items?.[0]?.node;
    res[name].push({
      lcp: a["largest-contentful-paint"].numericValue, cls: a["cumulative-layout-shift"].numericValue, tbt: a["total-blocking-time"].numericValue,
      fcp: a["first-contentful-paint"].numericValue, si: a["speed-index"].numericValue, score: r.lhr.categories.performance.score * 100,
      lcpEl: el ? `${el.selector} ${el.snippet ? el.snippet.slice(0, 60) : ""}` : "?",
      habitatReqs: (a["network-requests"]?.details?.items || []).filter((x) => /js\/habitat\/|habitat\/atlas/.test(x.url)).length,
    });
    process.stderr.write(`${name} run ${k + 1}: LCP ${res[name].at(-1).lcp.toFixed(0)} CLS ${res[name].at(-1).cls} TBT ${res[name].at(-1).tbt.toFixed(0)} el=${res[name].at(-1).lcpEl}\n`);
  }
} finally { try { await chrome.kill(); } catch (e) { /* Windows temp-dir cleanup race (EPERM); Chrome itself is already stopped */ } }

const summary = {};
for (const n of Object.keys(res)) summary[n] = { lcp: med(res[n].map((x) => x.lcp)), cls: Math.max(...res[n].map((x) => x.cls)), tbt: med(res[n].map((x) => x.tbt)), fcp: med(res[n].map((x) => x.fcp)), score: med(res[n].map((x) => x.score)), lcpEls: [...new Set(res[n].map((x) => x.lcpEl))], habitatReqs: res[n].map((x) => x.habitatReqs) };
summary.delta = { lcp: summary.habitat.lcp - summary.off.lcp, tbt: summary.habitat.tbt - summary.off.tbt };
summary.pass = {
  lcpElementIsBanner: summary.habitat.lcpEls.every((e) => /hero__banner/.test(e)),
  lcpDeltaUnder100: summary.delta.lcp < 100,
  clsZero: summary.habitat.cls === 0,
};
mkdirSync(new URL("results/", import.meta.url), { recursive: true });
writeFileSync(new URL("results/lighthouse.json", import.meta.url), JSON.stringify({ runs: res, summary }, null, 1));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = Object.values(summary.pass).every(Boolean) ? 0 : 1;
