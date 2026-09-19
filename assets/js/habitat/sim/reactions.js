// Visitor gesture -> Trinity's reaction. Pure: the caller (Durable Object,
// or the offline client) applies the deltas and plays the anims.
//
// ctx = { nowMs, visitors, brief, unlockedItems,
//         pos?        live position (defaults to world.pos),
//         spamCount?  accepted interactions in the last CROWD.spam.windowSec (incl. this one),
//         sleepPokes? pokes while asleep in the last CROWD.sleepWake.windowSec (incl. this one) }
import { CROWD, FUMBLE_CHANCE, ITEMS, LINES, REACTIONS, SKILLS, WORLD, ZONES } from "./rules.js";
import { pick } from "./rng.js";
import { fillLine, skillLevel } from "./brain.js";
import { buildGrid, isBlocked, nearestFree } from "./grid.js";
import { flingVelocity, simulateFling } from "./physics.js";

// Seconds each reaction anim holds before the next one.
export const REACTION_ANIM_SEC = {
  surprised: 1.2, ear_wiggle: 1.0, listen: 1.4, confused: 1.4, turn: 0.5, angry: 1.6,
  happy: 1.4, love: 2.0, spin: 1.2, slip: 1.0, wave: 1.6, pick_up: 1.0, knockdown: 1.4,
  recover: 1.2, hover: 0.8, dash: 0.8, hurt: 0.9, sleep: 1.8, wake_up: 1.4, shield: 1.5,
  teleport_out: 1.0, teleport_in: 1.0, sad: 2.0, victory: 2.5, jump: 0.9, land: 0.7,
};
const animSec = (a) => REACTION_ANIM_SEC[a] || 1.2;
const sumSec = (anims) => anims.reduce((s, a) => s + animSec(a), 0);

function sayFrom(ref, rng, vars) {
  if (!ref) return undefined;
  const pool = ref.startsWith("pool:") ? ref.slice(5) : ref;
  return fillLine(pick(rng, LINES[pool] || []), vars);
}

function base(gesture) {
  return {
    gesture, anims: [], fx: undefined, say: undefined,
    annoyDelta: 0, affectionDelta: 0, energyDelta: 0,
    moodDelta: { v: 0, a: 0 }, // extra (additive): nudge to valence/arousal
    interrupt: { kind: "reaction", untilMs: 0 },
  };
}

function finish(r, nowMs, extraSec) {
  r.interrupt.untilMs = Math.round(nowMs + (sumSec(r.anims) + (extraSec || 0)) * 1000);
  if (r.fx === undefined) delete r.fx;
  if (r.say === undefined) delete r.say;
  return r;
}

function farTile(grid, pos, rng) {
  for (let k = 0; k < 30; k++) {
    const i = Math.floor(rng() * WORLD.cols), j = Math.floor(rng() * WORLD.rows);
    if (isBlocked(grid, i, j)) continue;
    if (Math.hypot(i + 0.5 - pos.i, j + 0.5 - pos.j) < 4) continue;
    return { i: i + 0.5, j: j + 0.5 };
  }
  return nearestFree(grid, { i: ZONES.rug.i, j: ZONES.rug.j });
}

export function selectReaction(world, gesture, payload, ctx, rng) {
  const c = ctx || {};
  const now = c.nowMs != null ? c.nowMs : world.sim_at;
  const pos = c.pos || world.pos;
  const vars = { n: c.visitors != null ? c.visitors : 0 };
  const annoy = world.crowd.annoyance;
  const r = base(gesture);
  const grid = () => buildGrid(c.unlockedItems || world.items);
  const spam = c.spamCount || 0;

  // Global anti-spam: too many hands at once.
  if (spam >= CROWD.spam.teleportAt) {
    const row = REACTIONS.teleport[0];
    r.interrupt.kind = "teleport";
    r.annoyDelta = 0.1;
    r.moodDelta = { v: -0.1, a: 0.15 };
    if (world.skills.teleport) {
      r.anims = row.anims.slice();
      r.fx = row.fx;
      r.interrupt.pos = farTile(grid(), pos, rng);
    } else {
      // Can't teleport yet: dash to the pod and sulk.
      r.anims = row.fallbackAnims.slice();
      r.fx = "fx_dust";
      r.interrupt.pos = { i: ZONES.pod.i, j: ZONES.pod.j };
    }
    r.say = sayFrom(row.say, rng, vars);
    return finish(r, now, 1.0);
  }
  if (spam >= CROWD.spam.shieldAt) {
    const row = REACTIONS.shield[0];
    r.interrupt.kind = "shield";
    r.anims = row.anims.slice();
    r.fx = row.fx;
    r.say = sayFrom(row.say, rng, vars);
    r.annoyDelta = 0.02;
    r.interrupt.untilMs = Math.round(now + CROWD.spam.shieldSec * 1000);
    if (r.fx === undefined) delete r.fx;
    return r;
  }

  // Asleep: mostly a sleepy bubble; enough pokes wake her up grumpy.
  if (world.activity === "sleep" && gesture !== "push") {
    const row = REACTIONS.asleep[0];
    if (gesture === "poke" && (c.sleepPokes || 0) >= CROWD.sleepWake.pokes) {
      r.anims = row.grumpyAnims.slice();
      r.fx = "fx_smoke_small";
      r.say = sayFrom("pool:poke_angry", rng, vars);
      r.annoyDelta = CROWD.annoy.poke * 2;
      r.moodDelta = { v: -0.2, a: 0.2 };
      return finish(r, now);
    }
    r.interrupt.kind = "asleep";
    r.anims = row.anims.slice();
    r.fx = row.fx;
    r.say = sayFrom(row.say, rng, vars);
    return finish(r, now);
  }

  switch (gesture) {
    case "poke": {
      const rows = REACTIONS.poke;
      const row = rows.find((x) => annoy < x.maxAnnoy) || rows[rows.length - 1];
      r.anims = row.anims.slice();
      r.fx = row.fx;
      r.say = sayFrom(row.say, rng, vars);
      r.annoyDelta = CROWD.annoy.poke;
      r.moodDelta = row === rows[0] ? { v: 0.02, a: 0.08 } : { v: -0.05, a: 0.08 };
      return finish(r, now);
    }
    case "pet": {
      const row = REACTIONS.pet[0];
      const love = world.crowd.affection > row.loveAbove;
      r.anims = love ? [row.loveAnim] : row.anims.slice();
      r.fx = love ? row.loveFx : row.fx;
      r.say = sayFrom(row.say, rng, vars);
      r.affectionDelta = CROWD.affection.pet;
      r.annoyDelta = -0.02;
      r.moodDelta = { v: 0.08, a: -0.02 };
      return finish(r, now);
    }
    case "tickle": {
      const row = REACTIONS.tickle[0];
      const lvl = Math.max(1, skillLevel(world, row.fumbleSkill));
      if (rng() < FUMBLE_CHANCE[lvl - 1]) {
        r.anims = [row.fumbleAnim, "recover"];
        r.fx = "fx_dust";
      } else {
        r.anims = row.anims.slice();
        r.fx = row.fx;
      }
      r.say = sayFrom(row.say, rng, vars);
      r.annoyDelta = CROWD.annoy.tickle;
      r.moodDelta = { v: 0.06, a: 0.15 };
      return finish(r, now);
    }
    case "wave": {
      const row = REACTIONS.wave[0];
      r.anims = row.anims.slice();
      r.fx = row.fx;
      r.say = sayFrom(row.say, rng, vars);
      r.affectionDelta = CROWD.affection.wave;
      r.moodDelta = { v: 0.05, a: 0.03 };
      return finish(r, now);
    }
    case "feed": {
      const row = REACTIONS.feed[0];
      const item = payload && ITEMS[payload.item] && ITEMS[payload.item].feed ? payload.item : "carrot";
      r.anims = row.anims.slice();
      r.fx = row.fx;
      r.say = sayFrom(row.say, rng, Object.assign({ item }, vars));
      r.affectionDelta = CROWD.affection.feed;
      r.energyDelta = ITEMS[item].energy || 0;
      r.moodDelta = { v: 0.1, a: 0.05 };
      r.item = item; // extra
      return finish(r, now);
    }
    case "push": {
      const row = REACTIONS.push[0];
      const g = grid();
      const v = flingVelocity(payload || {});
      const start = { i: pos.i, j: pos.j, z: 0 };
      const fl = simulateFling(start, v, g);
      const flight = fl.frames[fl.frames.length - 1].t;
      const dash = row.dashBackAbove && skillLevel(world, row.dashBackAbove.skill) >= row.dashBackAbove.level;
      r.interrupt.kind = "pushed";
      if (dash) {
        r.anims = ["hover", "dash"];
        r.interrupt.pos = { i: pos.i, j: pos.j };
        r.moodDelta = { v: 0.05, a: 0.2 };
      } else {
        r.anims = fl.outcome === "knockdown" ? ["knockdown", row.recover] : [row.anims[0], row.recover];
        r.interrupt.pos = nearestFree(g, fl.landing);
        r.moodDelta = { v: -0.05, a: 0.2 };
        if (fl.outcome === "knockdown") r.energyDelta = -2;
      }
      r.fx = row.fx;
      r.say = sayFrom(row.say, rng, vars);
      r.annoyDelta = CROWD.annoy.push;
      // extra (additive): everything a client needs to replay the fling
      r.fling = { start, v, landing: fl.landing, outcome: fl.outcome, impact: fl.impact, sec: flight, dashBack: !!dash };
      return finish(r, now, flight);
    }
    case "toss": {
      const row = REACTIONS.toss[0];
      const ti = Number(payload && payload.i), tj = Number(payload && payload.j);
      const dist = Number.isFinite(ti) && Number.isFinite(tj) ? Math.hypot(ti - pos.i, tj - pos.j) : 99;
      if (dist > 2.5) {
        r.anims = ["surprised"];
        r.fx = "fx_question";
        r.toss = "miss"; // extra
        return finish(r, now, 0.6);
      }
      const lvl = skillLevel(world, row.catchAt.skill); // 0 while juggling is locked
      const caught = lvl >= row.catchAt.level && rng() >= FUMBLE_CHANCE[lvl - 1];
      if (caught) {
        r.anims = row.catchAnims.slice();
        r.fx = row.fx;
        r.say = fillLine(LINES.toss[0], vars);
        r.moodDelta = { v: 0.08, a: 0.1 };
        r.toss = "catch";
      } else {
        r.anims = row.hitAnims.slice();
        r.fx = "fx_star";
        r.say = fillLine(LINES.toss[rng() < 0.5 ? 1 : 2], vars);
        r.annoyDelta = CROWD.annoy.toss_hit;
        r.moodDelta = { v: -0.04, a: 0.12 };
        r.toss = "hit";
      }
      return finish(r, now, 0.6);
    }
    default: {
      r.anims = ["confused"];
      r.fx = "fx_question";
      return finish(r, now);
    }
  }
}

// Exposed so callers don't need to re-derive labels for UI.
export function skillLabel(skill) {
  return SKILLS[skill] ? SKILLS[skill].label : skill;
}
