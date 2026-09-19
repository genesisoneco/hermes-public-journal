// Wire protocol v1 for the habitat WebSocket (docs/habitat/CONTRACT.md §3).
// Parsing / validation of client frames and shaping of server frames.
import { EMOJI, GESTURES, ITEMS, RULES_VERSION, SKILLS, WORLD } from '../../../assets/js/habitat/sim/rules.js';
import { daysAlive } from '../../../assets/js/habitat/sim/clock.js';
import { levelFor, posAt } from '../../../assets/js/habitat/sim/brain.js';

export const PROTOCOL_V = 1;
export const MAX_IN_BYTES = 512;

// Ephemeral visitor colours (pastels that read on the dark room).
export const COLORS = [
  '#7ee0a8', '#f7a8c9', '#9ec5ff', '#ffd27e', '#c9a8ff', '#8fe3e0',
  '#ffb38a', '#b8e986', '#ff9ec0', '#a0b4ff', '#f5e17a', '#9af0c8',
];

const NONCE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const utf8 = new TextEncoder();

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r3 = (v) => Math.round(v * 1000) / 1000;

export function byteLen(s) { return utf8.encode(s).length; }

// Validate an interaction body ({k, ...}) from WS "i" frames or HTTP.
// Returns { ok:true, msg } or { ok:false, code:'bad_msg' }.
export function normalizeInteraction(o) {
  if (!o || typeof o !== 'object') return { ok: false, code: 'bad_msg' };
  const k = o.k;
  if (!GESTURES.includes(k)) return { ok: false, code: 'bad_msg' };
  const msg = { k };
  if (o.nonce !== undefined) {
    if (typeof o.nonce !== 'string' || !NONCE_RE.test(o.nonce)) return { ok: false, code: 'bad_msg' };
    msg.nonce = o.nonce;
  }
  if (k === 'push') {
    const vi = num(o.vi), vj = num(o.vj), vz = num(o.vz === undefined ? 0 : o.vz);
    if (vi === null || vj === null || vz === null) return { ok: false, code: 'bad_msg' };
    msg.vi = r3(clamp(vi, -1, 1)); msg.vj = r3(clamp(vj, -1, 1)); msg.vz = r3(clamp(vz, -1, 1));
  } else if (k === 'feed') {
    const it = ITEMS[o.item];
    if (!it || !it.visitor || !it.feed) return { ok: false, code: 'bad_msg' };
    msg.item = o.item;
  } else if (k === 'toss') {
    const it = ITEMS[o.item];
    const i = num(o.i), j = num(o.j);
    if (!it || !it.visitor || !it.toss || i === null || j === null) return { ok: false, code: 'bad_msg' };
    msg.item = o.item;
    msg.i = r3(clamp(i, 0, WORLD.cols)); msg.j = r3(clamp(j, 0, WORLD.rows));
  }
  return { ok: true, msg };
}

// Parse one inbound WS frame. `oversize` flags frames over 512 bytes.
export function parseClient(raw) {
  if (typeof raw !== 'string') return { ok: false, code: 'bad_msg' };
  if (raw.length > MAX_IN_BYTES || byteLen(raw) > MAX_IN_BYTES) return { ok: false, code: 'bad_msg', oversize: true };
  if (raw === 'ping') return { ok: true, msg: { t: 'ping' } };
  let o;
  try { o = JSON.parse(raw); } catch { return { ok: false, code: 'bad_msg' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, code: 'bad_msg' };
  if (o.t === 'resync') return { ok: true, msg: { t: 'resync' } };
  if (o.t === 'rx') {
    if (!EMOJI.includes(o.e)) return { ok: false, code: 'bad_msg' };
    return { ok: true, msg: { t: 'rx', e: o.e } };
  }
  if (o.t === 'i') {
    const n = normalizeInteraction(o);
    if (!n.ok) return n;
    return { ok: true, msg: Object.assign({ t: 'i' }, n.msg) };
  }
  return { ok: false, code: 'bad_msg' };
}

export function publicSkills(world) {
  const out = {};
  for (const s of Object.keys(world.skills)) {
    const xp = world.skills[s].xp;
    out[s] = { xp: Math.floor(xp), lvl: levelFor(xp), label: SKILLS[s] ? SKILLS[s].label : s };
  }
  return out;
}

export function publicWorld(world, plan, interrupt, now) {
  const livePos = interrupt && interrupt.pos && now < interrupt.untilMs ? interrupt.pos : posAt(plan, now, world.pos);
  return {
    pos: { i: r3(livePos.i), j: r3(livePos.j) },
    facing: world.facing,
    energy: Math.round(world.energy * 10) / 10,
    mood: { valence: world.mood.valence, arousal: world.mood.arousal, label: world.mood.label },
    crowd: { affection: world.crowd.affection, annoyance: world.crowd.annoyance },
    items: world.items.slice(),
    wishlist: world.wishlist.slice(),
    combos: world.combos.slice(),
    skills: publicSkills(world),
    days_alive: daysAlive(now),
    kst_date: world.kst_date,
    activity: world.activity,
  };
}

export function publicBrief(brief) {
  if (!brief) return null;
  return {
    date: brief.date,
    mood: brief.mood,
    thoughts: (brief.thoughts || []).slice(),
    practicing_skill: brief.practicing_skill || null,
    post_url: brief.post_url || '',
    post_title: brief.post_title || '',
    source: brief.source || 'derived',
  };
}

export function hello(att, now) {
  return { t: 'hello', v: PROTOCOL_V, rules_version: RULES_VERSION, you: { id: att.id, color: att.color }, now };
}
