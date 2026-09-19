// Tiny Cloudflare API helpers shared by the tools/cloudflare scripts.
// Auth: CLOUDFLARE_API_TOKEN (GitHub Actions secret). Zone: doaia.com, looked
// up by name so no IDs have to be stored anywhere.

export const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || "doaia.com";
const API = "https://api.cloudflare.com/client/v4";

export function token() {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) {
    console.error("CLOUDFLARE_API_TOKEN is not set.");
    process.exit(1);
  }
  return t;
}

export async function cf(path, init = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.success === false) {
    const errs = (body.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ");
    const err = new Error(`${init.method || "GET"} ${path} -> ${r.status} ${errs}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body.result;
}

// { id, account: { id } } for ZONE_NAME. Needs Zone:Read.
export async function zone() {
  const res = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  if (!res || !res.length) throw new Error(`zone ${ZONE_NAME} not visible to this token`);
  return res[0];
}
