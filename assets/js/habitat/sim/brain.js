// Trinity's brain: a small utility AI.
//
// Every few minutes she asks "what do I feel like doing?" Each activity is
// scored from her needs, the hour, her mood, today's brief (wishes and the
// skill she's practising), how good she is at it, and how recently she did
// it. The pick is a softmax over those scores. The chosen activity is then
// expanded into a Plan: a timestamped list of walk / anim / say / fx steps
// that every client plays back identically.
//
// Pure module: no DOM, no Workers APIs. Mutates only the `world` passed in.
import {
  ACTIVITIES, CIRCADIAN, CROWD, ENERGY, FUMBLE_CHANCE, HOUR_CURVE, LEVEL_XP, LINES,
  MOODS, NEEDS, SKILLS, UNLOCKS, WORLD, XP_CAPS, ZONES,
} from "./rules.js";
import { mulberry32, pick, range } from "./rng.js";
import { daysAlive, isSleepHour, kstMidnight, kstParts, nextKstHour, todBucket } from "./clock.js";
import { buildGrid, findPath, isBlocked, nearestFree, pathLength } from "./grid.js";
import { facingFromDelta } from "./iso.js";

export const SOFTMAX_T = 0.15;
export const MOOD_HALF_LIFE_SEC = 20 * 60;
export const WALK_SPEED = 1.6;  // tiles/s
export const TIRED_SPEED = 1.1; // tiles/s below 25% energy
export const RUN_SPEED = 2.6;   // tiles/s when wired (high arousal, high energy)
const NEUTRAL = { v: 0.1, a: 0.35 };
const MEMORY_MAX = 12;
const RECENT_MAX = 6;
const DAY_MS = 86400000;
const COUNTER_KEYS = ["pokes", "pets", "tickles", "waves", "pushes", "feeds", "tosses", "visitors"];

// Thought-bubble activities (everything else speaks out loud).
const THOUGHTFUL = new Set(["think", "stargaze", "write_journal", "read_archive"]);

// Small flourishes unlocked by combos (UNLOCKS[].combos).
const COMBO_EXTRAS = {
  headphone_adjust_while_typing: { activity: "write_journal", at: "end", anim: "headphone_adjust", dur: 2 },
  victory_after_entry:           { activity: "write_journal", at: "end", anim: "victory", dur: 2.5 },
  scan_then_hack:                { activity: "code", at: "start", anim: "scan", dur: 3 },
  carry_pot:                     { activity: "tend_plants", at: "end", anim: "carry", dur: 3 },
  climb_shelf:                   { activity: "read_archive", at: "start", anim: "climb", dur: 2 },
  spin:                          { activity: "dance", at: "end", anim: "spin", dur: 2 },
  juggle_three:                  { activity: "play_ball", at: "end", anim: "spin", dur: 2 },
};

/* ------------------------------------------------------------------ utils */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;

function emptyCounters(dateStr) {
  const o = { date: dateStr, journal: 0 };
  for (const k of COUNTER_KEYS) o[k] = 0;
  return o;
}

function zonePos(key) {
  const z = ZONES[key];
  return { i: z.i, j: z.j };
}

function insideRoom(p) {
  return p.i >= 0 && p.j >= 0 && p.i < WORLD.cols && p.j < WORLD.rows;
}

// "{n}", "{skill}", "{item}", "{title}" templating for LINES.
export function fillLine(text, vars) {
  const v = vars || {};
  return String(text || "").replace(/\{(n|skill|item|title)\}/g, (m, k) => {
    if (v[k] === undefined || v[k] === null || v[k] === "") return k === "n" ? "some" : "";
    return String(v[k]);
  }).replace(/\s+/g, " ").trim();
}

export function lineFrom(pool, rng, vars) {
  return fillLine(pick(rng, LINES[pool] || LINES.brief_fallback), vars);
}

export function skillLevel(world, skill) {
  const s = world.skills && world.skills[skill];
  return s ? levelFor(s.xp) : 0;
}

export function remember(world, kind, text, at) {
  if (!text) return;
  world.memory.push({ at: at || world.sim_at, kind, text: String(text).slice(0, 90) });
  if (world.memory.length > MEMORY_MAX) world.memory.splice(0, world.memory.length - MEMORY_MAX);
}

/* ------------------------------------------------------------------ world */

export function newWorld(seed, nowMs) {
  const p = kstParts(nowMs);
  const world = {
    v: 1,
    seed: seed >>> 0,
    plan_seq: 0,
    sim_at: nowMs,
    kst_date: p.dateStr,
    pos: zonePos("rug"),
    facing: "F",
    energy: 80,
    needs: { curiosity: 0.3, creativity: 0.3, social: 0.3, play: 0.3, tidiness: 0.2 },
    mood: { valence: NEUTRAL.v, arousal: NEUTRAL.a, base_v: NEUTRAL.v, base_a: NEUTRAL.a, label: "" },
    crowd: { affection: 0.2, annoyance: 0 },
    skills: {},
    items: [],
    wishlist: [],
    combos: [],
    memory: [],
    counters: { today: emptyCounters(p.dateStr), lifetime: {} },
    xpToday: {},
    // Extras beyond the contract's World shape (additive):
    activity: "think", // activity of the current / last plan
    recent: [],        // last few activities, for the novelty penalty
    mods: {},          // UNLOCKS[].mods merged (nightOwlChance, chargeRate)
  };
  for (const k of COUNTER_KEYS) world.counters.lifetime[k] = 0;
  for (const s of Object.keys(SKILLS)) if (SKILLS[s].start) world.skills[s] = { xp: 0 };
  // She has been alive for a while: backfill the daily alive bonus.
  const bonus = XP_CAPS.dailyAliveBonus * daysAlive(nowMs);
  if (bonus > 0) for (const s of Object.keys(world.skills)) grantXp(world, s, bonus, nowMs, true);
  checkUnlocks(world, nowMs);
  if (isSleepHour(p.h)) {
    world.activity = "sleep";
    world.pos = zonePos("pod");
  }
  world.mood.label = moodLabel(world);
  return world;
}

/* ------------------------------------------------------------ skills & XP */

export function levelFor(xp) {
  let lvl = 1;
  for (let k = 1; k < LEVEL_XP.length; k++) if (xp >= LEVEL_XP[k]) lvl = k + 1;
  return lvl;
}

function applyLevelUnlocks(world, skill, fromLvl, toLvl) {
  const out = [];
  for (const u of UNLOCKS) {
    if (u.skill !== skill || u.level <= fromLvl || u.level > toLvl) continue;
    for (const it of u.items || []) {
      if (!world.items.includes(it)) { world.items.push(it); out.push("item:" + it); }
      const w = world.wishlist.indexOf(it);
      if (w >= 0) world.wishlist.splice(w, 1);
    }
    for (const c of u.combos || []) {
      if (!world.combos.includes(c)) { world.combos.push(c); out.push("combo:" + c); }
    }
    if (u.mods) {
      for (const k of Object.keys(u.mods)) { world.mods[k] = u.mods[k]; out.push("mod:" + k); }
    }
  }
  return out;
}

// Skills with an `unlock` condition (level of another skill, days alive,
// lifetime counters). Returns ["skill:<name>", ...] for newly unlocked ones.
export function checkUnlocks(world, nowMs) {
  const out = [];
  for (const s of Object.keys(SKILLS)) {
    const def = SKILLS[s];
    if (def.start || world.skills[s] || !def.unlock) continue;
    const u = def.unlock;
    let met = false;
    if (u.skill && skillLevel(world, u.skill) >= (u.level || 1)) met = true;
    if (u.daysAlive && daysAlive(nowMs == null ? world.sim_at : nowMs) >= u.daysAlive) met = true;
    const oc = u.orCounter || u.counter;
    if (oc) {
      const lt = world.counters.lifetime;
      if (Object.keys(oc).every((k) => (lt[k] || 0) >= oc[k])) met = true;
    }
    if (met) {
      world.skills[s] = { xp: 0 };
      out.push("skill:" + s);
    }
  }
  return out;
}

// Uncapped grant (daily alive bonus, backfill). Handles level-ups + unlocks.
function grantXp(world, skill, gain, nowMs, quiet) {
  const s = world.skills[skill];
  if (!s || !(gain > 0)) return { leveledUp: false, level: s ? levelFor(s.xp) : 1, unlocks: [] };
  const before = levelFor(s.xp);
  s.xp = r2(s.xp + gain);
  const after = levelFor(s.xp);
  let unlocks = [];
  if (after > before) {
    unlocks = applyLevelUnlocks(world, skill, before, after);
    unlocks = unlocks.concat(checkUnlocks(world, nowMs));
    if (!quiet) remember(world, "level_up", fillLine("I can {skill} better now.", { skill: SKILLS[skill].label }), nowMs);
  }
  return { leveledUp: after > before, level: after, unlocks };
}

export function addXp(world, skill, amount, source) {
  const s = world.skills[skill];
  if (!s || !(amount > 0)) return { leveledUp: false, level: s ? levelFor(s.xp) : 1, unlocks: [] };
  const key = source === "visitor" ? "visitor" : "self";
  const cap = key === "visitor" ? XP_CAPS.visitorsPerDay : XP_CAPS.selfPerDay;
  const today = world.xpToday[skill] || (world.xpToday[skill] = { self: 0, visitor: 0 });
  const gain = Math.min(amount, Math.max(0, cap - today[key]));
  if (!(gain > 0)) return { leveledUp: false, level: levelFor(s.xp), unlocks: [] };
  today[key] = r2(today[key] + gain);
  return grantXp(world, skill, gain, world.sim_at, false);
}

// XP for (part of) a plan she actually did. Call at the plan boundary,
// or with endMs < plan.ends_at when a plan gets interrupted.
export function completePlan(world, plan, ctx, endMs) {
  const A = plan && ACTIVITIES[plan.activity];
  if (!A || !A.skill || !(A.xpPerMin > 0)) return null;
  const end = Math.min(endMs == null ? plan.ends_at : endMs, plan.ends_at);
  const mins = Math.max(0, end - plan.started_at) / 60000;
  const brief = ctx && ctx.brief;
  const mult = brief && brief.practicing_skill === A.skill ? XP_CAPS.practicingMultiplier : 1;
  const res = addXp(world, A.skill, A.xpPerMin * mins * mult, "self");
  return Object.assign({ skill: A.skill }, res);
}

// KST day rollover: daily alive bonus to every skill, reset today's caps
// and counters. Returns null if the date hasn't changed.
export function rollDay(world, nowMs) {
  const p = kstParts(nowMs);
  if (p.dateStr === world.kst_date) return null;
  const days = Math.round((kstMidnight(p.dateStr) - kstMidnight(world.kst_date)) / DAY_MS);
  if (!(days >= 1)) return null; // only ever roll forward
  const levelUps = [];
  let unlocks = [];
  for (const s of Object.keys(world.skills)) {
    const r = grantXp(world, s, XP_CAPS.dailyAliveBonus * days, nowMs, false);
    if (r.leveledUp) levelUps.push({ skill: s, level: r.level, unlocks: r.unlocks });
    unlocks = unlocks.concat(r.unlocks);
  }
  unlocks = unlocks.concat(checkUnlocks(world, nowMs));
  world.xpToday = {};
  world.counters.today = emptyCounters(p.dateStr);
  world.kst_date = p.dateStr;
  return { days, levelUps, unlocks };
}

/* ------------------------------------------------------------------- mood */

export function moodLabel(world) {
  const v = world.mood.valence, a = world.mood.arousal;
  let best = "quiet", bestD = Infinity;
  for (const k of Object.keys(MOODS)) {
    const dv = MOODS[k].v - v, da = MOODS[k].a - a;
    const d = dv * dv + da * da;
    if (d < bestD - 1e-12) { bestD = d; best = k; }
  }
  return best;
}

export function setMoodBaseline(world, brief) {
  const m = brief && MOODS[brief.mood];
  if (!m) { world.mood.base_v = NEUTRAL.v; world.mood.base_a = NEUTRAL.a; return; }
  const inten = clamp(Number.isFinite(+brief.mood_intensity) ? +brief.mood_intensity : 0.6, 0, 1);
  const k = 0.4 + 0.6 * inten;
  world.mood.base_v = r4(NEUTRAL.v + (m.v - NEUTRAL.v) * k);
  world.mood.base_a = r4(NEUTRAL.a + (m.a - NEUTRAL.a) * k);
}

export function nudgeMood(world, dv, da) {
  world.mood.valence = r4(clamp(world.mood.valence + (dv || 0), -1, 1));
  world.mood.arousal = r4(clamp(world.mood.arousal + (da || 0), 0, 1));
  world.mood.label = moodLabel(world);
}

/* -------------------------------------------------------------- integrate */

export function integrate(world, dtSec, ctx) {
  const c = ctx || {};
  if (!(dtSec > 0)) { if (c.nowMs != null) world.sim_at = c.nowMs; return; }
  const act = ACTIVITIES[world.activity] || ACTIVITIES.think;
  const asleep = world.activity === "sleep";

  // Energy.
  let eph = act.energyPerHour;
  if (world.activity === "charge") eph *= world.mods.chargeRate || 1;
  world.energy = r3(clamp(world.energy + (eph * dtSec) / 3600, 0, ENERGY.max));

  // Needs grow while awake; the current activity satisfies some of them.
  const dtMin = dtSec / 60;
  const visitors = Math.max(0, c.visitors || 0);
  if (!asleep) {
    for (const k of Object.keys(NEEDS)) {
      let rate = NEEDS[k].rate;
      if (k === "social") rate = rate / (1 + visitors);
      world.needs[k] = world.needs[k] + rate * dtMin;
    }
    if (visitors > 0) world.needs.social -= 0.01 * Math.min(visitors, 10) * dtMin;
  }
  for (const k of Object.keys(act.satisfies || {})) {
    if (k in world.needs) world.needs[k] -= act.satisfies[k] * dtMin;
  }
  for (const k of Object.keys(world.needs)) world.needs[k] = r4(clamp(world.needs[k], 0, 1));

  // Mood decays toward the baseline (set from today's brief).
  setMoodBaseline(world, c.brief);
  const km = 1 - Math.pow(0.5, dtSec / MOOD_HALF_LIFE_SEC);
  world.mood.valence = r4(world.mood.valence + (world.mood.base_v - world.mood.valence) * km);
  world.mood.arousal = r4(world.mood.arousal + (world.mood.base_a - world.mood.arousal) * km);
  world.mood.label = moodLabel(world);

  // Crowd feelings fade.
  world.crowd.annoyance = r4(world.crowd.annoyance * Math.pow(0.5, dtSec / CROWD.annoy.halfLifeSec));
  world.crowd.affection = r4(world.crowd.affection * Math.pow(1 - CROWD.affection.dailyDecay, dtSec / 86400));

  world.sim_at = c.nowMs != null ? c.nowMs : world.sim_at + Math.round(dtSec * 1000);
}

/* ---------------------------------------------------------------- choose */

function hasItem(world, ctx, item) {
  const list = (ctx && ctx.unlockedItems) || world.items;
  return list.includes(item);
}

export function scoreActivity(world, a, ctx, h, ignoreHours) {
  const A = ACTIVITIES[a];
  if (!A || a === "sleep") return 0;
  if (!ignoreHours && !(h >= A.hours[0] && h < A.hours[1])) return 0;
  if (A.requiresItem && !hasItem(world, ctx, A.requiresItem)) return 0;
  if (A.requiresSkill && !world.skills[A.requiresSkill]) return 0;
  if (A.skill && !world.skills[A.skill]) return 0;
  const visitors = (ctx && ctx.visitors) || 0;
  const brief = ctx && ctx.brief;

  let s = 0.15;
  for (const k of Object.keys(A.satisfies || {})) s += A.satisfies[k] * (world.needs[k] || 0);
  if (a === "charge") { const e = 1 - world.energy / ENERGY.max; s = e * e * 2.2; }
  if (a === "away") s = visitors > 0 ? 0.03 : 0.12;
  if (a === "wander") s *= 0.8;

  const curve = HOUR_CURVE[todBucket(h)];
  if (curve && curve[a]) s *= curve[a];

  if (brief && Array.isArray(brief.wishes)) {
    for (const w of brief.wishes) {
      if (w && w.activity === a) s *= 1 + clamp(+w.weight || 0, 0, 3);
    }
  }
  const m = MOODS[world.mood.label];
  if (m && m.fits.includes(a)) s *= 1.35;
  const bm = brief && MOODS[brief.mood];
  if (bm && bm.fits.includes(a)) s *= 1.2;

  if (A.skill && world.skills[A.skill]) {
    s *= 1 + 0.06 * (levelFor(world.skills[A.skill].xp) - 1);
    if (brief && brief.practicing_skill === A.skill) s *= 1.6;
  }

  const rec = world.recent;
  if (rec.length && rec[rec.length - 1] === a) s *= 0.3;
  else if (rec.slice(-4).includes(a)) s *= 0.65;

  if (A.energyPerHour <= -15) s *= clamp(world.energy / 60, 0.1, 1);
  return s;
}

export function chooseActivity(world, ctx, rng) {
  const now = ctx && ctx.nowMs != null ? ctx.nowMs : world.sim_at;
  const p = kstParts(now);
  const h = p.h;
  let restrict = null;

  if (isSleepHour(h)) {
    const owl = CIRCADIAN.nightOwl;
    const chance = world.mods.nightOwlChance != null ? world.mods.nightOwlChance : owl.chance;
    const eligible = h === CIRCADIAN.sleepStart && p.mi < owl.untilMinute &&
      world.energy >= owl.minEnergy && world.needs.curiosity >= owl.minCuriosity &&
      world.activity !== "sleep";
    if (!eligible || rng() >= chance) return "sleep";
    restrict = ["stargaze", "think", "listen_music"];
  }

  if (world.energy < ENERGY.lowBattery) return "charge";

  if (!restrict && h >= CIRCADIAN.journalHourStart && h < CIRCADIAN.journalHourEnd &&
      !world.counters.today.journal && hasSkillOrNone(world, "write_journal")) {
    return "write_journal";
  }

  const cands = restrict || Object.keys(ACTIVITIES);
  const names = [], scores = [];
  let max = 0;
  for (const a of cands) {
    const s = scoreActivity(world, a, ctx, h, !!restrict);
    if (s > 0) { names.push(a); scores.push(s); if (s > max) max = s; }
  }
  if (!names.length) return restrict ? "sleep" : "think";
  let sum = 0;
  const w = scores.map((s) => { const e = Math.exp((s / max - 1) / SOFTMAX_T); sum += e; return e; });
  let r = rng() * sum;
  for (let k = 0; k < names.length; k++) {
    r -= w[k];
    if (r <= 0) return names[k];
  }
  return names[names.length - 1];
}

function hasSkillOrNone(world, a) {
  const sk = ACTIVITIES[a].skill;
  return !sk || !!world.skills[sk];
}

/* ------------------------------------------------------------------- plan */

// Live position along a plan at time `ms` (world.pos is where she ends up).
export function posAt(plan, ms, fallback) {
  let pos = plan && plan.from ? { i: plan.from.i, j: plan.from.j } : fallback ? { i: fallback.i, j: fallback.j } : { i: 5.5, j: 5.5 };
  if (!plan) return pos;
  for (const st of plan.steps) {
    if (st.t0 > ms) break;
    if (st.kind === "teleport") pos = { i: st.to.i, j: st.to.j };
    if (st.kind !== "walk") continue;
    const path = st.path;
    if (ms >= st.t1) { const e = path[path.length - 1]; pos = { i: e[0], j: e[1] }; continue; }
    const total = pathLength(path);
    let d = total * (ms - st.t0) / Math.max(1, st.t1 - st.t0);
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= seg || k === path.length - 1) {
        const f = seg > 0 ? Math.min(1, d / seg) : 1;
        return { i: r3(a[0] + (b[0] - a[0]) * f), j: r3(a[1] + (b[1] - a[1]) * f) };
      }
      d -= seg;
    }
  }
  return pos;
}

// Which step (if any) is running at `ms`.
export function stepAt(plan, ms) {
  if (!plan) return null;
  let cur = null;
  for (const st of plan.steps) {
    if (st.kind === "say" || st.kind === "fx") continue;
    if (st.t0 <= ms) cur = st; else break;
  }
  return cur;
}

function briefLine(world, ctx, rng) {
  const brief = ctx && ctx.brief;
  const vars = lineVars(world, ctx);
  if (world.memory.length && rng() < 0.2) return pick(rng, world.memory).text;
  if (brief && Array.isArray(brief.thoughts) && brief.thoughts.length) return fillLine(pick(rng, brief.thoughts), vars);
  return lineFrom("brief_fallback", rng, vars);
}

function lineVars(world, ctx, extra) {
  const brief = ctx && ctx.brief;
  return Object.assign({
    n: ctx && ctx.visitors != null ? ctx.visitors : 0,
    title: brief && brief.post_title ? brief.post_title : "",
    skill: brief && brief.practicing_skill && SKILLS[brief.practicing_skill] ? SKILLS[brief.practicing_skill].label : "",
  }, extra || {});
}

export function buildPlan(world, activity, ctx, rng, nowMs) {
  const c = ctx || {};
  const act = ACTIVITIES[activity] ? activity : "think";
  const A = ACTIVITIES[act];
  const grid = buildGrid(c.unlockedItems || world.items);
  const id = ++world.plan_seq;
  const steps = [];
  const from = { i: r3(world.pos.i), j: r3(world.pos.j) };
  let t = nowMs;
  let pos = { i: from.i, j: from.j };
  let facing = world.facing || "F";
  let fumbles = 0;
  let note;

  const tired = world.energy < 25;
  const wired = !tired && world.energy > 60 && world.mood.arousal > 0.7;
  const floaty = world.combos.includes("float_instead_of_walk");
  const speed = tired ? TIRED_SPEED : wired ? RUN_SPEED : WALK_SPEED;
  const walkAnim = floaty ? "float" : wired ? "run" : "walk";

  const pushWalk = (path, anim, spd) => {
    const len = pathLength(path);
    if (len < 0.05) return;
    const dur = Math.round((len / spd) * 1000);
    steps.push({ kind: "walk", t0: t, t1: t + dur, path, speed: spd, anim });
    t += dur;
    const a = path[path.length - 2], b = path[path.length - 1];
    facing = facingFromDelta(b[0] - a[0], b[1] - a[1]);
    pos = { i: b[0], j: b[1] };
  };

  const walkTo = (target, anim, spd) => {
    anim = anim || walkAnim; spd = spd || speed;
    if (!insideRoom(pos)) {
      // Coming back from outside: straight in through the door.
      const door = zonePos("door");
      pushWalk([[pos.i, pos.j], [door.i, door.j]], anim, spd);
      pos = door;
    }
    const dest = insideRoom(target) ? nearestFree(grid, target) : target;
    let path = findPath(grid, pos, dest);
    if (!path.length) {
      const start = nearestFree(grid, pos);
      const rest = findPath(grid, start, dest);
      path = rest.length ? [[pos.i, pos.j]].concat(rest) : [[pos.i, pos.j], [dest.i, dest.j]];
    }
    pushWalk(path.map(([i, j]) => [r3(i), r3(j)]), anim, spd);
    pos = { i: r3(dest.i), j: r3(dest.j) };
  };

  const pushAnim = (anim, sec, extra) => {
    const dur = Math.max(200, Math.round(sec * 1000));
    const st = { kind: "anim", t0: t, t1: t + dur, anim, facing };
    if (extra) Object.assign(st, extra);
    steps.push(st);
    t += dur;
  };

  const pushSay = (text, style) => {
    if (!text) return;
    const ttl = clamp(1800 + 60 * text.length, 2500, 6000);
    steps.push({ kind: "say", t0: t, text, ttl, style: style || "speech" });
  };

  const vars = lineVars(world, c, { skill: A.skill && SKILLS[A.skill] ? SKILLS[A.skill].label : "" });

  // Just woke up? Stretch first.
  if (world.activity === "sleep" && act !== "sleep") pushAnim("wake_up", 1.6, { facing: "F" });

  // Go where the activity happens.
  if (act === "wander") {
    let dest = null;
    for (let k = 0; k < 20 && !dest; k++) {
      const i = Math.floor(rng() * WORLD.cols), j = Math.floor(rng() * WORLD.rows);
      if (isBlocked(grid, i, j)) continue;
      if (Math.hypot(i + 0.5 - pos.i, j + 0.5 - pos.j) < 2) continue;
      dest = { i: i + 0.5, j: j + 0.5 };
    }
    walkTo(dest || zonePos("rug"));
  } else if (act === "away") {
    walkTo(zonePos("door"));
    note = lineFrom("away", rng, vars);
    pushSay(note, "thought");
    const off = zonePos("off");
    pushWalk([[pos.i, pos.j], [off.i, off.j]], "walk", WALK_SPEED);
  } else if (A.zone && ZONES[A.zone]) {
    walkTo(zonePos(A.zone));
    facing = ZONES[A.zone].facing;
  }

  // Combo flourishes at the start.
  for (const cb of world.combos) {
    const x = COMBO_EXTRAS[cb];
    if (x && x.activity === act && x.at === "start") pushAnim(x.anim, x.dur);
  }

  // The activity script.
  const lvl = A.skill && world.skills[A.skill] ? levelFor(world.skills[A.skill].xp) : 0;
  const steps0 = A.steps;
  for (let k = 0; k < steps0.length; k++) {
    const st = steps0[k];
    if (st.chance != null && rng() >= st.chance) continue;
    if (st.say) {
      const text = st.say === "brief" ? briefLine(world, c, rng)
        : st.say.startsWith("pool:") ? lineFrom(st.say.slice(5), rng, vars) : fillLine(st.say, vars);
      pushSay(text, st.say === "brief" || THOUGHTFUL.has(act) ? "thought" : "speech");
      continue;
    }
    if (st.fx) { steps.push({ kind: "fx", t0: t, fx: st.fx, at: st.at || "head" }); continue; }
    if (!st.anim) continue;
    if (st.walk && ZONES[st.walk]) {
      walkTo(zonePos(st.walk), "walk", Math.min(speed, WALK_SPEED));
      facing = ZONES[st.walk].facing;
    }
    let sec = range(rng, st.dur[0], st.dur[1]);
    if (act === "sleep" && isSleepHour(kstParts(t).h)) {
      // Wake on the dot at 06:00 KST.
      const wake = nextKstHour(t, CIRCADIAN.sleepEnd);
      sec = Math.max(5, Math.min(sec, (wake - t) / 1000));
    }
    if (act === "charge" && st.anim === "charging") {
      const eph = ACTIVITIES.charge.energyPerHour * (world.mods.chargeRate || 1);
      const full = ((ENERGY.max - world.energy) / eph) * 3600;
      sec = Math.max(20, Math.min(sec, full));
    }
    const noFumble = act === "teleport_practice" && world.combos.includes("clean_teleport");
    if (st.skillCheck && lvl > 0 && !noFumble && rng() < FUMBLE_CHANCE[lvl - 1]) {
      fumbles++;
      pushAnim(st.anim, sec * 0.4, st.loop ? { loop: true } : null);
      pushAnim(rng() < 0.3 ? "hurt" : "slip", 1.0, { fumble: true });
      pushAnim("recover", 1.0, { fumble: true });
      pushSay(lineFrom("fumble", rng, vars), "speech");
      pushAnim(st.anim, sec * 0.6, st.loop ? { loop: true } : null);
      continue;
    }
    pushAnim(st.anim, sec, st.loop ? { loop: true } : null);
  }

  // Combo flourishes at the end.
  for (const cb of world.combos) {
    const x = COMBO_EXTRAS[cb];
    if (x && x.activity === act && x.at === "end") pushAnim(x.anim, x.dur);
  }

  if (act === "away") {
    // Pop back in through the door at the end of the trip.
    const door = zonePos("door");
    pushWalk([[pos.i, pos.j], [door.i, door.j]], "walk", WALK_SPEED);
  }

  // Let a trailing bubble finish before the next plan starts walking.
  const last = steps[steps.length - 1];
  if (last && last.kind === "say") pushAnim("idle_" + facing, (last.ttl / 1000) * 0.8);
  if (!steps.length || t - nowMs < 3000) pushAnim("idle_" + facing, 3);

  world.pos = { i: r3(pos.i), j: r3(pos.j) };
  world.facing = facing;
  world.activity = act;
  world.recent.push(act);
  if (world.recent.length > RECENT_MAX) world.recent.splice(0, world.recent.length - RECENT_MAX);
  if (act === "write_journal") world.counters.today.journal = 1;

  const plan = {
    id, activity: act, status: A.status, started_at: nowMs, ends_at: t, steps,
    // extras (additive): where she starts, the skill + fumble count, away note
    from, skill: A.skill || null, fumbles,
  };
  if (note) plan.note = note;
  return plan;
}

// A short celebratory plan after a level-up.
export function buildVictoryPlan(world, skill, level, unlocks, ctx, rng, nowMs) {
  const id = ++world.plan_seq;
  const label = SKILLS[skill] ? SKILLS[skill].label : skill;
  let t = nowMs;
  const facing = "F";
  const steps = [];
  steps.push({ kind: "fx", t0: t, fx: "fx_burst_pink", at: "head" });
  steps.push({ kind: "anim", t0: t, t1: t + 2500, anim: "victory", facing });
  const text = lineFrom("level_up", rng, lineVars(world, ctx, { skill: label }));
  steps.push({ kind: "say", t0: t + 300, text, ttl: 3500, style: "speech" });
  t += 2500;
  steps.push({ kind: "anim", t0: t, t1: t + 1500, anim: "happy", facing });
  t += 1500;
  world.facing = facing;
  return {
    id, activity: "level_up", status: "Level up: " + label + " " + level + "!",
    started_at: nowMs, ends_at: t, steps,
    from: { i: world.pos.i, j: world.pos.j }, skill, level, unlocks: unlocks || [], fumbles: 0,
  };
}

/* ---------------------------------------------------------------- catchUp */

const MAX_CATCHUP_STEPS = 300;

// Coarse deterministic sim over an idle gap. Sleep and charging spans are
// integrated analytically; daytime runs real plans until the step budget
// gets tight, then stretches each step over a bigger chunk of the gap.
export function catchUp(world, fromMs, toMs, ctx, rngSeed) {
  if (!(toMs > fromMs)) return;
  const rng = mulberry32((rngSeed >>> 0) || 1);
  const base = ctx || {};
  let t = fromMs;
  let steps = 0;
  world.sim_at = fromMs;

  while (t < toMs && steps < MAX_CATCHUP_STEPS) {
    steps++;
    rollDay(world, t);
    const c = Object.assign({}, base, { nowMs: t, unlockedItems: world.items });
    const remaining = toMs - t;
    const a = chooseActivity(world, c, rng);
    let span;
    if (a === "sleep") {
      span = Math.min(nextKstHour(t, CIRCADIAN.sleepEnd) - t, remaining);
      if (world.activity !== "sleep") { world.recent.push("sleep"); }
      world.activity = "sleep";
      world.pos = zonePos("pod");
      world.facing = "F";
    } else if (a === "charge") {
      const eph = ACTIVITIES.charge.energyPerHour * (world.mods.chargeRate || 1);
      const full = ((ENERGY.max - world.energy) / eph) * 3600000;
      span = Math.min(Math.max(60000, full), remaining, nextKstHour(t, CIRCADIAN.sleepStart) - t);
      world.activity = "charge";
      world.pos = zonePos("pod");
      world.facing = "F";
    } else {
      const plan = buildPlan(world, a, c, rng, t);
      span = plan.ends_at - t;
      const budget = MAX_CATCHUP_STEPS - steps;
      const chunk = remaining / Math.max(1, budget);
      if (span < chunk && !isSleepHour(kstParts(t).h)) {
        span = Math.max(span, Math.min(chunk, nextKstHour(t, CIRCADIAN.sleepStart) - t));
      }
      span = Math.max(1000, Math.min(span, remaining));
      const A = ACTIVITIES[a];
      if (A.skill && A.xpPerMin > 0) {
        const mult = base.brief && base.brief.practicing_skill === A.skill ? XP_CAPS.practicingMultiplier : 1;
        addXp(world, A.skill, A.xpPerMin * (span / 60000) * mult, "self");
      }
    }
    integrate(world, span / 1000, Object.assign({}, c, { nowMs: t + span }));
    t += span;
  }
  if (t < toMs) integrate(world, (toMs - t) / 1000, Object.assign({}, base, { nowMs: toMs }));
  rollDay(world, toMs);
  world.sim_at = toMs;
}
