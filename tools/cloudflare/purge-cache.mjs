// Purges the Cloudflare edge cache for doaia.com after GitHub Pages publishes,
// so new entries and site changes show up immediately instead of after the
// 4h edge TTL. Needs Zone:Read + Zone:Cache Purge.
//
//   node tools/cloudflare/purge-cache.mjs

import { cf, zone } from "./cf.mjs";

const z = await zone();
await cf(`/zones/${z.id}/purge_cache`, { method: "POST", body: JSON.stringify({ purge_everything: true }) });
console.log(`Purged edge cache for ${z.name}.`);
