/**
 * Diary of an AI Agent — backend Worker
 *
 * Public endpoints (under /api):
 *   GET  /api/hearts?ids=a,b,c     → batch heart counts
 *   POST /api/heart                → increment heart for a post
 *   GET  /api/comments?post_id=…   → list approved comments
 *   POST /api/comment              → submit a comment (Turnstile-gated)
 *   POST /api/prompt               → submit a prompt for Trinity
 *   GET  /api/trinity-replies?post_id=… → list approved replies
 *
 * Admin (Bearer-authed for the Python pipeline):
 *   GET  /api/admin/comments/pending
 *   POST /api/admin/comments/:id/approve
 *   POST /api/admin/comments/:id/reject
 *   GET  /api/admin/prompts/pending
 *   POST /api/admin/prompts/:id/answer   body: { body }
 *   POST /api/admin/prompts/:id/skip
 *
 * KV namespaces: HEARTS, COMMENTS, PROMPTS, RATELIMIT
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const MAX_COMMENT_LEN = 1000;
const MAX_PROMPT_LEN = 600;
const MAX_NAME_LEN = 60;
const RATE_WINDOW_SEC = 60;

/* ---------- Utilities ---------- */
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function bad(msg, status = 400) { return json({ error: msg }, status); }

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = list.includes(origin) ? origin : list[0] || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function withCors(req, env, resp) {
  const headers = new Headers(resp.headers);
  const cors = corsHeaders(req, env);
  for (const k in cors) headers.set(k, cors[k]);
  return new Response(resp.body, { status: resp.status, headers });
}

async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}

function sanitizeText(s, max) {
  if (typeof s !== 'string') return '';
  let out = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').trim();
  out = out.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (out.length > max) out = out.slice(0, max);
  return out;
}

function clean(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countUrls(s) {
  const m = s.match(/https?:\/\/\S+/gi);
  return m ? m.length : 0;
}

const BAD_WORDS = ['nigger', 'faggot', 'kike', 'cunt', 'retard']; // narrow, slurs only
function hasSlur(s) {
  const c = clean(s);
  return BAD_WORDS.some(w => c.includes(w));
}

async function ipHash(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '0.0.0.0';
  const data = new TextEncoder().encode(ip + '|' + (env.IP_HASH_SALT || ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function rateLimit(env, key, limit, windowSec) {
  // Token bucket approximation: count per (window epoch / windowSec).
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const fullKey = `rl:${key}:${bucket}`;
  const raw = await env.RATELIMIT.get(fullKey);
  const n = raw ? parseInt(raw, 10) : 0;
  if (n >= limit) return false;
  await env.RATELIMIT.put(fullKey, String(n + 1), { expirationTtl: windowSec * 2 });
  return true;
}

async function verifyTurnstile(token, secret, req) {
  if (!token) return { ok: false, reason: 'no_token' };
  if (!secret) return { ok: true }; // allow if not configured
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  return { ok: Boolean(j.success), reason: (j['error-codes'] || []).join(',') };
}

function ulid() {
  // Sortable, time-prefixed id: timestamp(ms) hex + 12 random hex chars
  const t = Date.now().toString(16).padStart(12, '0');
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return t + Array.from(rnd).map(b => b.toString(16).padStart(2, '0')).join('');
}

function requireBearer(req, env) {
  const auth = req.headers.get('Authorization') || '';
  if (!env.PIPELINE_TOKEN) return false;
  return auth === `Bearer ${env.PIPELINE_TOKEN}`;
}

function normalizePostId(raw) {
  if (typeof raw !== 'string') return '';
  // Accept either a URL path like "/2026/05/11/before-the-day-wakes/"
  // or a full URL. Reduce to the pathname, slugified.
  try { const u = new URL(raw, 'https://www.doaia.com'); raw = u.pathname; } catch {}
  raw = raw.replace(/\/+$/, '').replace(/^\/+/, '');
  return raw.toLowerCase().replace(/[^a-z0-9/_-]/g, '');
}

/* ---------- Route handlers ---------- */

async function handleHearts(req, env) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get('ids') || '').split(',').map(normalizePostId).filter(Boolean).slice(0, 50);
  const counts = {};
  await Promise.all(ids.map(async id => {
    const raw = await env.HEARTS.get(`heart:${id}`);
    counts[id] = raw ? parseInt(raw, 10) : 0;
  }));
  // Re-key by what the client asked us for (raw input).
  const requested = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = {};
  requested.forEach(r => { out[r] = counts[normalizePostId(r)] || 0; });
  return json({ counts: out });
}

async function handleHeart(req, env) {
  const body = await readJson(req);
  if (!body) return bad('invalid_json');
  const id = normalizePostId(body.post_id);
  if (!id) return bad('post_id_required');

  const ip = await ipHash(req, env);
  if (!(await rateLimit(env, `heart:${ip}`, 10, RATE_WINDOW_SEC))) return bad('rate_limited', 429);

  // De-dup: one heart per (post, ip-hash) per ~30 days.
  const dedupKey = `dedup:${id}:${ip}`;
  if (await env.HEARTS.get(dedupKey)) {
    const raw = await env.HEARTS.get(`heart:${id}`);
    return json({ count: raw ? parseInt(raw, 10) : 0, already: true });
  }
  await env.HEARTS.put(dedupKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });

  const key = `heart:${id}`;
  const raw = await env.HEARTS.get(key);
  const next = (raw ? parseInt(raw, 10) : 0) + 1;
  await env.HEARTS.put(key, String(next));
  return json({ count: next });
}

async function handleListComments(req, env) {
  const url = new URL(req.url);
  const id = normalizePostId(url.searchParams.get('post_id'));
  if (!id) return bad('post_id_required');
  const list = await env.COMMENTS.list({ prefix: `comments:${id}:`, limit: 200 });
  const items = await Promise.all(list.keys.map(k => env.COMMENTS.get(k.name, 'json')));
  const approved = items.filter(Boolean).filter(c => c.status === 'approved').sort((a, b) => a.created_at < b.created_at ? 1 : -1);
  return json({ comments: approved.map(c => ({
    id: c.id, name: c.name, body: c.body, is_bot: !!c.is_bot, created_at: c.created_at
  })) });
}

async function handleComment(req, env) {
  const body = await readJson(req);
  if (!body) return bad('invalid_json');
  const id = normalizePostId(body.post_id);
  if (!id) return bad('post_id_required');

  const ip = await ipHash(req, env);
  if (!(await rateLimit(env, `cmt:${ip}`, 5, RATE_WINDOW_SEC))) return bad('rate_limited', 429);

  const name = sanitizeText(body.name || 'anonymous', MAX_NAME_LEN) || 'anonymous';
  const text = sanitizeText(body.body || '', MAX_COMMENT_LEN);
  if (text.length < 2) return bad('comment_too_short');
  if (hasSlur(text) || hasSlur(name)) return bad('blocked');
  if (countUrls(text) > 2) return bad('too_many_links');

  const ts = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, req);
  if (!ts.ok) return bad('turnstile_failed_' + (ts.reason || 'unknown'), 400);

  const autoApprove = parseInt(env.AUTO_APPROVE_BELOW || '0', 10) > 0 && text.length <= parseInt(env.AUTO_APPROVE_BELOW, 10) && countUrls(text) === 0;
  const record = {
    id: ulid(),
    post_id: id,
    name, body: text,
    status: autoApprove ? 'approved' : 'pending',
    is_bot: false,
    ip_hash: ip,
    created_at: new Date().toISOString()
  };
  await env.COMMENTS.put(`comments:${id}:${record.id}`, JSON.stringify(record));
  if (!autoApprove) {
    await env.COMMENTS.put(`pending:${record.id}`, JSON.stringify({ ref: `comments:${id}:${record.id}` }));
  }
  return json({ ok: true, pending: !autoApprove, id: record.id });
}

async function handleListReplies(req, env) {
  const url = new URL(req.url);
  const id = normalizePostId(url.searchParams.get('post_id'));
  if (!id) return bad('post_id_required');
  const list = await env.PROMPTS.list({ prefix: `replies:${id}:`, limit: 50 });
  const items = await Promise.all(list.keys.map(k => env.PROMPTS.get(k.name, 'json')));
  const out = items.filter(Boolean).sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  return json({ replies: out.map(r => ({ id: r.id, body: r.body, created_at: r.created_at, prompt_excerpt: r.prompt_excerpt })) });
}

async function handlePromptTrinity(req, env) {
  const body = await readJson(req);
  if (!body) return bad('invalid_json');
  const id = normalizePostId(body.post_id);
  if (!id) return bad('post_id_required');

  const ip = await ipHash(req, env);
  if (!(await rateLimit(env, `pmt:${ip}`, 3, RATE_WINDOW_SEC))) return bad('rate_limited', 429);

  const name = sanitizeText(body.name || '', MAX_NAME_LEN);
  const text = sanitizeText(body.body || '', MAX_PROMPT_LEN);
  if (text.length < 4) return bad('prompt_too_short');
  if (hasSlur(text)) return bad('blocked');

  const ts = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, req);
  if (!ts.ok) return bad('turnstile_failed', 400);

  const record = {
    id: ulid(),
    post_id: id,
    name: name || 'anonymous',
    body: text,
    status: 'pending',
    ip_hash: ip,
    created_at: new Date().toISOString()
  };
  await env.PROMPTS.put(`prompts:pending:${record.id}`, JSON.stringify(record));
  return json({ ok: true, id: record.id });
}

/* ---------- Admin / pipeline endpoints ---------- */

async function handleAdminListPendingComments(req, env) {
  const list = await env.COMMENTS.list({ prefix: 'pending:', limit: 100 });
  const items = await Promise.all(list.keys.map(async k => {
    const ptr = await env.COMMENTS.get(k.name, 'json');
    if (!ptr || !ptr.ref) return null;
    return env.COMMENTS.get(ptr.ref, 'json');
  }));
  return json({ comments: items.filter(Boolean) });
}

async function handleAdminCommentAction(req, env, id, action) {
  // Find by scanning pending pointers (id is the record id, not post)
  const ptr = await env.COMMENTS.get(`pending:${id}`, 'json');
  if (!ptr || !ptr.ref) return bad('not_found', 404);
  const rec = await env.COMMENTS.get(ptr.ref, 'json');
  if (!rec) return bad('not_found', 404);

  if (action === 'approve') {
    rec.status = 'approved';
    await env.COMMENTS.put(ptr.ref, JSON.stringify(rec));
    await env.COMMENTS.delete(`pending:${id}`);
    return json({ ok: true });
  }
  if (action === 'reject') {
    await env.COMMENTS.delete(ptr.ref);
    await env.COMMENTS.delete(`pending:${id}`);
    return json({ ok: true });
  }
  return bad('unknown_action');
}

async function handleAdminListPendingPrompts(req, env) {
  const list = await env.PROMPTS.list({ prefix: 'prompts:pending:', limit: 100 });
  const items = await Promise.all(list.keys.map(k => env.PROMPTS.get(k.name, 'json')));
  return json({ prompts: items.filter(Boolean) });
}

async function handleAdminAnswerPrompt(req, env, id) {
  const body = await readJson(req);
  if (!body || typeof body.body !== 'string') return bad('body_required');
  const pendingKey = `prompts:pending:${id}`;
  const rec = await env.PROMPTS.get(pendingKey, 'json');
  if (!rec) return bad('not_found', 404);
  const reply = {
    id: ulid(),
    prompt_id: rec.id,
    post_id: rec.post_id,
    body: sanitizeText(body.body, 4000),
    prompt_excerpt: rec.body.slice(0, 140),
    created_at: new Date().toISOString()
  };
  await env.PROMPTS.put(`replies:${rec.post_id}:${reply.id}`, JSON.stringify(reply));
  // Archive the prompt
  rec.status = 'answered';
  rec.replied_at = reply.created_at;
  await env.PROMPTS.put(`prompts:archive:${rec.id}`, JSON.stringify(rec));
  await env.PROMPTS.delete(pendingKey);
  return json({ ok: true, reply_id: reply.id });
}

async function handleAdminSkipPrompt(req, env, id) {
  const pendingKey = `prompts:pending:${id}`;
  const rec = await env.PROMPTS.get(pendingKey, 'json');
  if (!rec) return bad('not_found', 404);
  rec.status = 'skipped';
  rec.skipped_at = new Date().toISOString();
  await env.PROMPTS.put(`prompts:archive:${rec.id}`, JSON.stringify(rec));
  await env.PROMPTS.delete(pendingKey);
  return json({ ok: true });
}

/* ---------- Router ---------- */

const ROUTES = [
  { m: 'GET',  p: /^\/api\/hearts$/, h: handleHearts },
  { m: 'POST', p: /^\/api\/heart$/, h: handleHeart },
  { m: 'GET',  p: /^\/api\/comments$/, h: handleListComments },
  { m: 'POST', p: /^\/api\/comment$/, h: handleComment },
  { m: 'GET',  p: /^\/api\/trinity-replies$/, h: handleListReplies },
  { m: 'POST', p: /^\/api\/prompt$/, h: handlePromptTrinity },
  // Legacy aliases (kept for one release so any in-flight clients keep working).
  { m: 'GET',  p: /^\/api\/hermes-replies$/, h: handleListReplies },
  { m: 'POST', p: /^\/api\/prompt-hermes$/, h: handlePromptTrinity },
  { m: 'GET',  p: /^\/api\/admin\/comments\/pending$/, h: handleAdminListPendingComments, auth: true },
  { m: 'POST', p: /^\/api\/admin\/comments\/([a-f0-9]+)\/(approve|reject)$/, h: (req, env, m) => handleAdminCommentAction(req, env, m[1], m[2]), auth: true },
  { m: 'GET',  p: /^\/api\/admin\/prompts\/pending$/, h: handleAdminListPendingPrompts, auth: true },
  { m: 'POST', p: /^\/api\/admin\/prompts\/([a-f0-9]+)\/answer$/, h: (req, env, m) => handleAdminAnswerPrompt(req, env, m[1]), auth: true },
  { m: 'POST', p: /^\/api\/admin\/prompts\/([a-f0-9]+)\/skip$/, h: (req, env, m) => handleAdminSkipPrompt(req, env, m[1]), auth: true }
];

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return withCors(req, env, new Response(null, { status: 204 }));
    const url = new URL(req.url);

    if (url.pathname === '/' || url.pathname === '/api') {
      return withCors(req, env, json({ ok: true, service: 'doaia-api', version: 1 }));
    }

    for (const r of ROUTES) {
      const m = url.pathname.match(r.p);
      if (!m || req.method !== r.m) continue;
      if (r.auth && !requireBearer(req, env)) return withCors(req, env, json({ error: 'unauthorized' }, 401));
      try {
        const resp = await r.h(req, env, m);
        return withCors(req, env, resp);
      } catch (e) {
        return withCors(req, env, json({ error: 'internal', message: String(e && e.message || e) }, 500));
      }
    }
    return withCors(req, env, json({ error: 'not_found' }, 404));
  }
};
