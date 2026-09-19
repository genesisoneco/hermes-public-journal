// TrinityHabitat: the one authoritative Trinity.
//
// A single Durable Object instance (idFromName("main")) owns her brain.
// There is no fixed tick. The brain emits a Plan (a timestamped list of
// steps) and clients play it back. While sockets are connected, an alarm
// fires at plan.ends_at to pick the next one. With nobody watching there is
// no alarm at all; the next visitor wakes the object and a coarse catchUp()
// fast-forwards her through the gap (asleep, charged, mid-task...).
//
// Storage: SQLite (ctx.storage.sql). State is written at plan boundaries
// (throttled to one row a minute), on level-ups, and on brief ingest.
// Per-poke changes stay in memory until the next boundary.
import { DurableObject } from 'cloudflare:workers';
import { ACTIVITIES, CROWD, ENERGY, ITEMS, SKILLS } from '../../../assets/js/habitat/sim/rules.js';
import { hashSeed, mulberry32 } from '../../../assets/js/habitat/sim/rng.js';
import { kstParts } from '../../../assets/js/habitat/sim/clock.js';
import {
  addXp, buildPlan, buildVictoryPlan, catchUp, checkUnlocks, chooseActivity, completePlan,
  integrate, levelFor, newWorld, nudgeMood, posAt, remember, rollDay, setMoodBaseline,
} from '../../../assets/js/habitat/sim/brain.js';
import { selectReaction } from '../../../assets/js/habitat/sim/reactions.js';
import { COLORS, hello, normalizeInteraction, parseClient, publicBrief, publicWorld } from './protocol.js';
import { Limits } from './limits.js';
import { deriveBrief, newItemStatus, validateBrief } from './brief.js';

const SCHEMA_VERSION = 1;
const EVENTS_RING = 500;
const RECENT_MAX = 20;
const PERSIST_EVERY_MS = 60 * 1000;
const CATCHUP_GAP_MS = 2 * 60 * 1000;
const PRESENCE_DEBOUNCE_MS = 1000;
const WORLD_SEED = hashSeed('trinity:main');

const COUNTER_FOR = { poke: 'pokes', pet: 'pets', tickle: 'tickles', wave: 'waves', push: 'pushes', feed: 'feeds', toss: 'tosses' };
// Visitors can help her practise a little (capped by XP_CAPS.visitorsPerDay).
const VISITOR_XP = { tickle: ['dancing', 1], push: ['flying', 1], toss: ['juggling', 2], feed: ['tea', 0.5] };
const NOTABLE = new Set(['level_up', 'unlock', 'item_arrived', 'brief']);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r4 = (v) => Math.round(v * 10000) / 10000;

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(3));
  return 'v' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class TrinityHabitat extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.limits = new Limits({ maxConn: parseInt(env.HABITAT_MAX_CONN || '300', 10) || 300 });
    this.world = null;
    this.plan = null;
    this.interrupt = null;
    this.brief = null;
    this.seq = 0;
    this.recent = [];
    this.lastPersist = 0;
    this.rowsWritten = 0;
    this.presenceTimer = null;
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.load(Date.now());
    });
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    } catch {}
  }

  /* ----------------------------------------------------------- storage */

  // Durable Object SQLite refuses `PRAGMA user_version = N` (SQLITE_AUTH),
  // so the schema version lives in a one-row meta table instead.
  migrate() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    const row = this.sql.exec("SELECT v FROM meta WHERE k = 'schema'").toArray()[0];
    const v = row ? parseInt(row.v, 10) || 0 : 0;
    if (v < 1) {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS world  (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS events (slot INTEGER PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT);
        CREATE TABLE IF NOT EXISTS briefs (date TEXT PRIMARY KEY, json TEXT NOT NULL, source TEXT, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS daily  (date TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      `);
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)", String(SCHEMA_VERSION));
    }
  }

  load(now) {
    const row = this.sql.exec('SELECT v FROM world WHERE k = ?', 'state').toArray()[0];
    let saved = null;
    if (row) { try { saved = JSON.parse(row.v); } catch { saved = null; } }
    if (saved && saved.world && saved.world.v === 1) {
      this.world = saved.world;
      this.plan = saved.plan || null;
      this.seq = saved.seq || 0;
    } else {
      this.world = newWorld(WORLD_SEED, now);
      this.plan = null;
    }
    // seq must never go backwards across restarts (clients resync on gaps).
    this.seq = Math.max(this.seq, Math.floor(now / 1000) * 16);
    const b = this.sql.exec('SELECT json FROM briefs ORDER BY date DESC LIMIT 1').toArray()[0];
    this.brief = b ? JSON.parse(b.json) : null;
    this.recent = this.sql.exec('SELECT seq, at, kind, data FROM events ORDER BY seq DESC LIMIT ?', RECENT_MAX)
      .toArray().reverse().map((e) => ({ at: e.at, kind: e.kind, data: e.data ? JSON.parse(e.data) : null }));
  }

  persist(now, force) {
    if (!force && now - this.lastPersist < PERSIST_EVERY_MS) return false;
    const state = { world: this.world, plan: this.plan, seq: this.seq };
    this.sql.exec('INSERT OR REPLACE INTO world (k, v, at) VALUES (?, ?, ?)', 'state', JSON.stringify(state), now);
    this.lastPersist = now;
    this.rowsWritten++;
    return true;
  }

  logEvent(seq, at, kind, data) {
    this.recent.push({ at, kind, data });
    if (this.recent.length > RECENT_MAX) this.recent.splice(0, this.recent.length - RECENT_MAX);
    if (!NOTABLE.has(kind)) return;
    this.sql.exec('INSERT OR REPLACE INTO events (slot, seq, at, kind, data) VALUES (?, ?, ?, ?, ?)',
      seq % EVENTS_RING, seq, at, kind, JSON.stringify(data || null));
    this.rowsWritten++;
  }

  /* ----------------------------------------------------------- sockets */

  sockets(exclude) {
    return this.ctx.getWebSockets().filter((ws) => ws !== exclude && ws.readyState === 1);
  }

  broadcast(obj, exclude) {
    if (obj.t !== 'pr' && obj.t !== 'rx') obj.seq = ++this.seq;
    const s = JSON.stringify(obj);
    for (const ws of this.sockets(exclude)) { try { ws.send(s); } catch {} }
    return obj;
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }

  presence(exclude) {
    const list = this.sockets(exclude);
    const colors = [];
    for (const ws of list) {
      if (colors.length >= 50) break;
      const a = ws.deserializeAttachment();
      if (a && a.color) colors.push(a.color);
    }
    return { n: list.length, colors };
  }

  schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const p = this.presence();
      this.broadcast({ t: 'pr', n: p.n, colors: p.colors });
    }, PRESENCE_DEBOUNCE_MS);
  }

  async scheduleAlarm(exclude) {
    if (this.sockets(exclude).length > 0 && this.plan) {
      const cur = await this.ctx.storage.getAlarm();
      if (cur !== this.plan.ends_at) await this.ctx.storage.setAlarm(this.plan.ends_at);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  /* ------------------------------------------------------------- brain */

  ctxFor(now, extra) {
    return Object.assign({
      nowMs: now,
      visitors: this.sockets().length,
      brief: this.brief,
      unlockedItems: this.world.items,
    }, extra || {});
  }

  rngFor(now) {
    return mulberry32(hashSeed(this.world.seed + ':' + this.world.plan_seq + ':' + now));
  }

  snapshotLevels() {
    const w = this.world;
    const levels = {};
    for (const s of Object.keys(w.skills)) levels[s] = levelFor(w.skills[s].xp);
    return { levels, items: w.items.slice(), combos: w.combos.slice(), date: w.kst_date, today: Object.assign({}, w.counters.today) };
  }

  // Compare against a snapshot; broadcast level_up / unlock / item_arrived,
  // handle the KST day rollover side effects. Returns level-ups found.
  emitDiff(before, now) {
    const w = this.world;
    const ups = [];
    const newItems = w.items.filter((x) => !before.items.includes(x));
    const newCombos = w.combos.filter((x) => !before.combos.includes(x));
    const newSkills = Object.keys(w.skills).filter((s) => !(s in before.levels));
    for (const s of Object.keys(w.skills)) {
      if (!(s in before.levels)) continue;
      const lvl = levelFor(w.skills[s].xp);
      if (lvl > before.levels[s]) ups.push({ skill: s, level: lvl });
    }
    const unlocks = newItems.map((x) => 'item:' + x).concat(newCombos.map((x) => 'combo:' + x), newSkills.map((x) => 'skill:' + x));
    for (const u of ups) {
      const data = { skill: u.skill, level: u.level, label: SKILLS[u.skill] ? SKILLS[u.skill].label : u.skill, unlocks };
      this.emitEvent('level_up', data, now);
    }
    for (const x of newSkills.concat(newCombos)) this.emitEvent('unlock', { unlock: newSkills.includes(x) ? 'skill:' + x : 'combo:' + x }, now);
    for (const x of newItems) this.emitEvent('item_arrived', { item: x, via: 'unlock' }, now);

    if (before.date !== w.kst_date) {
      // Day rolled over: keep yesterday's stats, and make sure today has a brief.
      this.sql.exec('INSERT OR REPLACE INTO daily (date, json, at) VALUES (?, ?, ?)', before.date, JSON.stringify(before.today), now);
      this.rowsWritten++;
      if (!this.brief || this.brief.date < w.kst_date) {
        this.brief = deriveBrief(this.brief, w.kst_date, w);
        this.sql.exec('INSERT OR REPLACE INTO briefs (date, json, source, at) VALUES (?, ?, ?, ?)',
          this.brief.date, JSON.stringify(this.brief), 'derived', now);
        this.rowsWritten++;
        setMoodBaseline(w, this.brief);
        this.emitEvent('brief', publicBrief(this.brief), now);
      }
    }
    if (ups.length || unlocks.length) this.persist(now, true);
    return ups;
  }

  emitEvent(kind, data, now, extra) {
    const ev = Object.assign({ t: 'ev', kind, by: null, at: now, data }, extra || {});
    this.broadcast(ev);
    this.logEvent(ev.seq, now, kind, data);
    return ev;
  }

  // Start the next plan at `at` (defaults to now). Level-ups get a victory lap.
  nextPlan(at, ups) {
    const w = this.world;
    const ctx = this.ctxFor(at);
    const rng = this.rngFor(at);
    if (ups && ups.length && w.activity !== 'sleep') {
      const u = ups[ups.length - 1];
      this.plan = buildVictoryPlan(w, u.skill, u.level, [], ctx, rng, at);
    } else {
      this.plan = buildPlan(w, chooseActivity(w, ctx, rng), ctx, rng, at);
    }
    return this.plan;
  }

  // Bring the world up to `now`. Returns true when a new plan was made.
  advance(now) {
    const w = this.world;
    const before = this.snapshotLevels();
    let changed = false;
    let ups = [];
    if (this.interrupt && now >= this.interrupt.untilMs) this.interrupt = null;

    if (!this.plan) {
      if (now - w.sim_at > CATCHUP_GAP_MS) catchUp(w, w.sim_at, now, this.ctxFor(now), hashSeed('cu:' + w.sim_at));
      else integrate(w, (now - w.sim_at) / 1000, this.ctxFor(now));
      rollDay(w, now);
      ups = this.emitDiff(before, now);
      this.nextPlan(now, ups);
      changed = true;
    } else if (now >= this.plan.ends_at) {
      const end = this.plan.ends_at;
      if (end > w.sim_at) integrate(w, (end - w.sim_at) / 1000, this.ctxFor(end));
      completePlan(w, this.plan, this.ctxFor(end));
      if (now - end > CATCHUP_GAP_MS) catchUp(w, Math.max(end, w.sim_at), now, this.ctxFor(now), hashSeed('cu:' + end));
      else if (now > w.sim_at) integrate(w, (now - w.sim_at) / 1000, this.ctxFor(now));
      rollDay(w, now);
      ups = this.emitDiff(before, now);
      this.nextPlan(now, ups);
      changed = true;
    } else if (now > w.sim_at) {
      integrate(w, (now - w.sim_at) / 1000, this.ctxFor(now));
    }
    if (changed) {
      this.broadcast({ t: 'plan', plan: this.plan });
      this.broadcastStat();
      this.persist(now, false);
    }
    return changed;
  }

  broadcastStat() {
    const w = this.world;
    this.broadcast({
      t: 'stat', energy: Math.round(w.energy * 10) / 10,
      mood: { valence: w.mood.valence, arousal: w.mood.arousal, label: w.mood.label },
      crowd: { affection: w.crowd.affection, annoyance: w.crowd.annoyance },
    });
  }

  activeInterrupt(now) {
    const it = this.interrupt;
    return it && now < it.untilMs ? it : null;
  }

  snapBody(now, withColors) {
    const p = withColors ? this.presence() : { n: this.sockets().length, colors: [] };
    return {
      t: 'snap',
      seq: this.seq,
      world: publicWorld(this.world, this.plan, this.activeInterrupt(now), now),
      plan: this.plan,
      interrupt: this.activeInterrupt(now),
      brief: publicBrief(this.brief),
      presence: withColors ? p : { n: p.n },
      recent: this.recent.slice(-RECENT_MAX),
    };
  }

  /* ------------------------------------------------------ interactions */

  // Shared by WebSocket "i" frames and POST /api/habitat/interact.
  // `who` = { id, color }. Returns { ok:true, ev } or { ok:false, code }.
  interactCore(msg, who, now) {
    this.advance(now);
    const w = this.world;
    const k = msg.k;
    // Spam keeps counting while the shield is up so a real flood escalates
    // to a teleport; everything below that just bounces off the shield.
    const spamCount = this.limits.spamHit(now);
    const shield = this.activeInterrupt(now);
    if (shield && shield.kind === 'shield' && spamCount < CROWD.spam.teleportAt) return { ok: false, code: 'shielded' };

    const sleepPokes = w.activity === 'sleep' && k === 'poke' ? this.limits.sleepPoke(now) : 0;
    const live = this.activeInterrupt(now);
    const pos = live && live.pos ? live.pos : posAt(this.plan, now, w.pos);
    const ctx = this.ctxFor(now, { pos, spamCount, sleepPokes });
    const rng = this.rngFor(now);
    const before = this.snapshotLevels();
    const reaction = selectReaction(w, k, msg, ctx, rng);

    // Apply deltas.
    integrate(w, Math.max(0, (now - w.sim_at) / 1000), this.ctxFor(now));
    w.crowd.annoyance = r4(clamp(w.crowd.annoyance + (reaction.annoyDelta || 0), 0, 1));
    w.crowd.affection = r4(clamp(w.crowd.affection + (reaction.affectionDelta || 0), 0, 1));
    w.energy = clamp(w.energy + (reaction.energyDelta || 0), 0, ENERGY.max);
    if (reaction.moodDelta) nudgeMood(w, reaction.moodDelta.v, reaction.moodDelta.a);
    const ck = COUNTER_FOR[k];
    if (ck) { w.counters.today[ck] = (w.counters.today[ck] || 0) + 1; w.counters.lifetime[ck] = (w.counters.lifetime[ck] || 0) + 1; }
    const vx = VISITOR_XP[k];
    if (vx && reaction.interrupt.kind !== 'asleep' && reaction.toss !== 'miss') addXp(w, vx[0], vx[1], 'visitor');
    checkUnlocks(w, now);
    if (k === 'feed' && reaction.item) remember(w, 'fed', 'the ' + reaction.item + ' earlier was nice.', now);

    // Event.
    const kind = { pushed: 'pushed', shield: 'shield', teleport: 'teleport' }[reaction.interrupt.kind] || (k === 'feed' ? 'fed' : 'reaction');
    const data = { gesture: k };
    if (reaction.fling) data.fling = { start: reaction.fling.start, v: reaction.fling.v, landing: reaction.fling.landing, outcome: reaction.fling.outcome };
    if (k === 'feed') data.item = reaction.item;
    if (k === 'toss') Object.assign(data, { item: msg.item, i: msg.i, j: msg.j, result: reaction.toss });
    const extra = { by: who.color, reaction };
    if (msg.nonce) extra.nonce = msg.nonce;
    const ev = this.broadcast(Object.assign({ t: 'ev', kind, at: now, data }, extra));
    this.logEvent(ev.seq, now, kind, { gesture: k, by: who.color });

    // Interrupt the current plan and replan after the reaction.
    const ups = this.emitDiff(before, now);
    if (reaction.interrupt.kind !== 'asleep' || ups.length) {
      if (this.plan && now < this.plan.ends_at) completePlan(w, this.plan, this.ctxFor(now), now);
      const it = reaction.interrupt;
      this.interrupt = {
        kind: it.kind, untilMs: it.untilMs, anims: reaction.anims, fx: reaction.fx || null,
        say: reaction.say || null, pos: it.pos || null,
      };
      w.pos = it.pos ? { i: it.pos.i, j: it.pos.j } : { i: pos.i, j: pos.j };
      this.nextPlan(Math.max(now, it.untilMs), ups);
      this.broadcast({ t: 'plan', plan: this.plan });
    }
    this.broadcastStat();
    return { ok: true, ev };
  }

  /* -------------------------------------------------------- WebSockets */

  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.endsWith('/ws')) return new Response('not found', { status: 404 });
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const now = Date.now();
    const ipTag = (req.headers.get('X-Hab-Ip') || 'anon').replace(/[^a-f0-9a-z]/gi, '').slice(0, 16) || 'anon';
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];

    const full = this.ctx.getWebSockets().length >= this.limits.o.maxConn ||
      this.ctx.getWebSockets(ipTag).length >= this.limits.o.perIpConn;
    if (full) {
      server.accept();
      server.send(JSON.stringify({ t: 'err', code: 'full' }));
      server.close(1013, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server, [ipTag]);
    const att = { id: randomId(), color: COLORS[Math.floor(Math.random() * COLORS.length)], ipTag, joined: now };
    server.serializeAttachment(att);

    this.advance(now);
    const w = this.world;
    w.counters.today.visitors = (w.counters.today.visitors || 0) + 1;
    w.counters.lifetime.visitors = (w.counters.lifetime.visitors || 0) + 1;
    this.send(server, hello(att, now));
    this.send(server, this.snapBody(now, true));
    this.schedulePresence();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const now = Date.now();
    const att = ws.deserializeAttachment() || { id: 'x', color: COLORS[0], ipTag: 'anon' };
    const p = parseClient(typeof message === 'string' ? message : null);
    if (!p.ok) {
      this.send(ws, { t: 'err', code: 'bad_msg' });
      if (this.limits.strike(att.id) >= this.limits.o.strikes) { try { ws.close(1008, 'policy'); } catch {} }
      return;
    }
    if (p.msg.t === 'ping') { try { ws.send('pong'); } catch {} return; }
    if (p.msg.t !== 'resync' && !this.limits.allowMsg(att.id, att.ipTag, now)) {
      this.send(ws, { t: 'err', code: 'rate_limited' });
      if (this.limits.rateStrike(att.id) >= this.limits.o.rateStrikes) { try { ws.close(1008, 'rate'); } catch {} }
      return;
    }
    if (p.msg.t === 'resync') {
      this.advance(now);
      this.send(ws, this.snapBody(now, true));
    } else if (p.msg.t === 'rx') {
      this.broadcast({ t: 'rx', e: p.msg.e, by: att.color });
    } else if (p.msg.t === 'i') {
      const res = this.interactCore(p.msg, att, now);
      if (!res.ok) this.send(ws, { t: 'err', code: res.code });
    }
    await this.scheduleAlarm();
  }

  async webSocketClose(ws, code) {
    const att = ws.deserializeAttachment();
    if (att) this.limits.forget(att.id);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch {}
    this.schedulePresence();
    await this.scheduleAlarm(ws);
    if (this.sockets(ws).length === 0) this.persist(Date.now(), true);
  }

  async webSocketError(ws) {
    const att = ws.deserializeAttachment();
    if (att) this.limits.forget(att.id);
    this.schedulePresence();
    await this.scheduleAlarm(ws);
  }

  async alarm() {
    const now = Date.now();
    if (this.sockets().length === 0) {
      this.persist(now, true);
      await this.ctx.storage.deleteAlarm();
      return;
    }
    this.advance(now);
    await this.scheduleAlarm();
  }

  /* --------------------------------------------------------------- RPC */

  async getSnapshot() {
    const now = Date.now();
    this.advance(now);
    await this.scheduleAlarm();
    return this.snapBody(now, false);
  }

  async interact(payload) {
    const now = Date.now();
    const p = payload && typeof payload === 'object' ? payload : {};
    const ipTag = String(p.ipTag || 'anon').slice(0, 16);
    const n = normalizeInteraction(p);
    if (!n.ok) return { ok: false, error: n.code };
    if (!this.limits.allowIp(ipTag, now)) return { ok: false, error: 'rate_limited' };
    const who = { id: 'h' + ipTag.slice(0, 4), color: COLORS[hashSeed(ipTag) % COLORS.length] };
    const res = this.interactCore(n.msg, who, now);
    await this.scheduleAlarm();
    return res.ok ? { ok: true, ev: res.ev } : { ok: false, error: res.code };
  }

  async ingestBrief(json) {
    const now = Date.now();
    this.advance(now);
    const v = validateBrief(json, now);
    if (!v.ok) return { ok: false, error: v.error };
    const b = v.brief;
    this.sql.exec('INSERT OR REPLACE INTO briefs (date, json, source, at) VALUES (?, ?, ?, ?)', b.date, JSON.stringify(b), b.source, now);
    this.rowsWritten++;
    const w = this.world;
    let item = null;
    if (!this.brief || b.date >= this.brief.date) {
      this.brief = b;
      setMoodBaseline(w, b);
      this.emitEvent('brief', publicBrief(b), now);
      if (b.new_item) {
        const st = newItemStatus(w, b.new_item);
        item = { item: b.new_item, status: st };
        if (st === 'arrive') {
          w.items.push(b.new_item);
          const wi = w.wishlist.indexOf(b.new_item);
          if (wi >= 0) w.wishlist.splice(wi, 1);
          remember(w, 'item', 'the ' + b.new_item.replace(/_/g, ' ') + ' is new. I like it.', now);
          this.emitEvent('item_arrived', { item: b.new_item, via: 'brief' }, now);
        } else if (st === 'wishlist' && !w.wishlist.includes(b.new_item)) {
          w.wishlist.push(b.new_item);
        }
      }
    }
    this.persist(now, true);
    await this.scheduleAlarm();
    return { ok: true, brief: b, dropped: v.dropped, item };
  }

  async debug() {
    const now = Date.now();
    return {
      now,
      kst: kstParts(now),
      world: this.world,
      plan: this.plan,
      interrupt: this.interrupt,
      brief: this.brief,
      seq: this.seq,
      conns: this.sockets().length,
      limits: this.limits.stats(),
      rowsWritten: this.rowsWritten,
      lastPersist: this.lastPersist,
      alarm: await this.ctx.storage.getAlarm(),
      recent: this.recent,
      briefs: this.sql.exec('SELECT date, source, at FROM briefs ORDER BY date DESC LIMIT 7').toArray(),
      daily: this.sql.exec('SELECT date, json FROM daily ORDER BY date DESC LIMIT 7').toArray(),
      activities: Object.keys(ACTIVITIES).length,
      crowdRules: CROWD.spam,
      visitorItems: Object.keys(ITEMS).filter((k) => ITEMS[k].visitor),
    };
  }

  /* ------------------------------------------------------- test hooks */

  // Used by tests (runInDurableObject) and handy from debug tooling.
  _setWorld(mut) { mut(this.world, this); }
}
