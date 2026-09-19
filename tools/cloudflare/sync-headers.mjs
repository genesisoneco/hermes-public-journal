// Applies cloudflare/security-headers.json to the zone's response-header
// Transform Rule. Only the one rule that sets Content-Security-Policy (or that
// carries our description) is touched; every other rule in the phase is kept
// exactly as it is.
//
//   node tools/cloudflare/sync-headers.mjs            # dry run: print the diff
//   node tools/cloudflare/sync-headers.mjs --apply    # write it
//
// Needs Zone:Read + Zone:Transform Rules:Edit on doaia.com.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cf, zone } from "./cf.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, "../../cloudflare/security-headers.json"), "utf8"));
const apply = process.argv.includes("--apply");
const PHASE = "http_response_headers_transform";
const DEFAULT_EXPR = '(http.host eq "www.doaia.com") or (http.host eq "doaia.com")';

const wanted = Object.fromEntries(
  Object.entries(spec.headers).map(([k, v]) => [k, { operation: "set", value: v }]),
);

function ours(rule) {
  const h = rule?.action_parameters?.headers || {};
  return rule.description === spec.description || Object.keys(h).some((k) => k.toLowerCase() === "content-security-policy");
}

function show(label, headers) {
  console.log(label);
  for (const [k, v] of Object.entries(headers || {})) console.log(`  ${k}: ${v.value ?? `(${v.operation})`}`);
}

const z = await zone();
let ruleset = null;
try {
  ruleset = await cf(`/zones/${z.id}/rulesets/phases/${PHASE}/entrypoint`);
} catch (e) {
  if (e.status !== 404) throw e; // 404 = no response-header rules yet
}

const rules = (ruleset?.rules || []).map((r) => ({ ...r }));
const idx = rules.findIndex(ours);
const before = idx >= 0 ? rules[idx].action_parameters.headers : null;

const norm = (h) => JSON.stringify(Object.keys(h).sort().map((k) => [k.toLowerCase(), h[k].operation, h[k].value ?? null]));
const same = before && norm(before) === norm(wanted);
if (same && rules[idx].description === spec.description) {
  console.log("Security headers already match cloudflare/security-headers.json. Nothing to do.");
  process.exit(0);
}

if (before) show(`Current rule "${rules[idx].description}" (expression: ${rules[idx].expression}):`, before);
else console.log(`No existing security-header rule; a new one will be added for: ${DEFAULT_EXPR}`);
show("Desired headers:", wanted);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

const next = {
  ...(idx >= 0 ? rules[idx] : { expression: DEFAULT_EXPR, enabled: true }),
  description: spec.description,
  action: "rewrite",
  action_parameters: { headers: wanted },
};
if (idx >= 0) rules[idx] = next;
else rules.push(next);

// The entrypoint PUT replaces the whole phase, so send every rule back,
// stripping read-only fields.
const clean = rules.map(({ version, last_updated, ...r }) => r);
await cf(`/zones/${z.id}/rulesets/phases/${PHASE}/entrypoint`, {
  method: "PUT",
  body: JSON.stringify({ rules: clean }),
});
console.log(`Applied security headers to ${z.name ?? "zone"} (${clean.length} rule(s) in phase).`);
