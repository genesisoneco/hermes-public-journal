// Pure sim tests: brain, XP, fumbles, physics, schedule.
import { describe, it, expect } from 'vitest';
import { ACTIVITIES, BORN, CROWD, FUMBLE_CHANCE, XP_CAPS, ZONES } from '../../../assets/js/habitat/sim/rules.js';
import { mulberry32, hashSeed } from '../../../assets/js/habitat/sim/rng.js';
import { kstMidnight, kstParts, isSleepHour, todBucket, daysAlive } from '../../../assets/js/habitat/sim/clock.js';
import { worldToScreen, screenToWorld, facingFromDelta } from '../../../assets/js/habitat/sim/iso.js';
import { buildGrid, findPath, nearestFree } from '../../../assets/js/habitat/sim/grid.js';
import {
  newWorld, integrate, chooseActivity, buildPlan, levelFor, addXp, moodLabel, catchUp, checkUnlocks, rollDay, posAt,
} from '../../../assets/js/habitat/sim/brain.js';
import { selectReaction } from '../../../assets/js/habitat/sim/reactions.js';
import { simulateFling, flingVelocity } from '../../../assets/js/habitat/sim/physics.js';
import { planAt } from '../../../assets/js/habitat/sim/schedule.js';

const DAY = '2026-09-19';
const at = (h, m = 0) => kstMidnight(DAY) + (h * 60 + m) * 60000;
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('clock + iso + grid', () => {
  it('KST parts and buckets', () => {
    const p = kstParts(at(23, 30));
    expect([p.dateStr, p.h, p.mi]).toEqual([DAY, 23, 30]);
    expect(isSleepHour(23)).toBe(true);
    expect(isSleepHour(5)).toBe(true);
    expect(isSleepHour(6)).toBe(false);
    expect(todBucket(7)).toBe('morning');
    expect(todBucket(12)).toBe('afternoon');
    expect(todBucket(18)).toBe('evening');
    expect(todBucket(21)).toBe('night');
    expect(daysAlive(kstMidnight(BORN) + 3600e3)).toBe(0);
    expect(daysAlive(at(12))).toBe(132);
  });

  it('iso round-trips and matches the contract corners', () => {
    expect(worldToScreen(0, 0)).toEqual({ x: 800, y: 260 });
    expect(worldToScreen(10, 10)).toEqual({ x: 800, y: 820 });
    const w = screenToWorld(worldToScreen(3.25, 7.5).x, worldToScreen(3.25, 7.5).y);
    expect(w.i).toBeCloseTo(3.25); expect(w.j).toBeCloseTo(7.5);
    expect(facingFromDelta(1, -1)).toBe('R');
    expect(facingFromDelta(-1, 1)).toBe('L');
    expect(facingFromDelta(1, 1)).toBe('F');
    expect(facingFromDelta(-1, -1)).toBe('B');
  });

  it('A* finds paths around furniture and none into it', () => {
    const g = buildGrid([]);
    const p = findPath(g, { i: 5.5, j: 5.5 }, { i: ZONES.pod.i, j: ZONES.pod.j });
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p[p.length - 1]).toEqual([ZONES.pod.i, ZONES.pod.j]);
    expect(findPath(g, { i: 5.5, j: 5.5 }, { i: 3.5, j: 0.5 })).toEqual([]); // desk
    expect(nearestFree(g, { i: 3.5, j: 0.5 }).j).toBeGreaterThanOrEqual(1);
  });
});

describe('brain', () => {
  it('is deterministic for the same seed + rng', () => {
    const run = () => {
      const w = newWorld(123, at(14));
      const rng = mulberry32(99);
      const plans = [];
      let t = at(14);
      for (let k = 0; k < 25; k++) {
        const ctx = { nowMs: t, visitors: 1, brief: null, unlockedItems: w.items };
        const p = buildPlan(w, chooseActivity(w, ctx, rng), ctx, rng, t);
        integrate(w, (p.ends_at - t) / 1000, { ...ctx, nowMs: p.ends_at });
        plans.push(p);
        t = p.ends_at;
      }
      return { plans, w };
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    expect(JSON.stringify(planAt(at(15, 12), null))).toBe(JSON.stringify(planAt(at(15, 12), null)));
  });

  it('always sleeps at 23:30 KST (and at 03:00)', () => {
    for (let s = 0; s < 200; s++) {
      const w = newWorld(s, at(12));
      const rng = mulberry32(s);
      w.energy = 20 + (s % 80);
      w.needs.curiosity = (s % 10) / 10;
      w.activity = s % 2 ? 'think' : 'stargaze';
      expect(chooseActivity(w, { nowMs: at(23, 30), visitors: s % 5, brief: null }, rng)).toBe('sleep');
      expect(chooseActivity(w, { nowMs: at(3, 0), visitors: 0, brief: null }, rng)).toBe('sleep');
    }
  });

  it('low battery preempts everything while awake', () => {
    for (let s = 0; s < 100; s++) {
      const w = newWorld(s, at(12));
      w.energy = 10;
      const brief = { mood: 'playful', wishes: [{ activity: 'dance', weight: 3 }] };
      expect(chooseActivity(w, { nowMs: at(8 + (s % 12)), visitors: 3, brief }, mulberry32(s))).toBe('charge');
    }
  });

  it('writes the journal first thing after waking at 06:00', () => {
    const w = newWorld(5, at(3));
    expect(w.activity).toBe('sleep');
    expect(chooseActivity(w, { nowMs: at(6, 5), visitors: 0, brief: null }, mulberry32(1))).toBe('write_journal');
    const plan = buildPlan(w, 'write_journal', { nowMs: at(6, 5) }, mulberry32(1), at(6, 5));
    expect(plan.steps[0].anim).toBe('wake_up');
  });

  it('brief wishes shift the distribution', () => {
    const base = newWorld(7, at(14));
    const count = (brief) => {
      let n = 0;
      for (let k = 0; k < 600; k++) {
        const w = clone(base);
        if (chooseActivity(w, { nowMs: at(14), visitors: 0, brief, unlockedItems: w.items }, mulberry32(k)) === 'tend_plants') n++;
      }
      return n;
    };
    const plain = count(null);
    const wished = count({ mood: 'quiet', wishes: [{ activity: 'tend_plants', weight: 3 }] });
    expect(wished).toBeGreaterThan(plain * 2);
    expect(wished).toBeGreaterThan(300);
  });

  it('mood decays to the brief baseline and labels by nearest key', () => {
    const w = newWorld(1, at(10));
    w.mood.valence = -0.9; w.mood.arousal = 1;
    integrate(w, 20 * 60, { nowMs: at(10, 20), brief: { mood: 'playful', mood_intensity: 1 } });
    expect(w.mood.valence).toBeCloseTo((-0.9 + w.mood.base_v) / 2, 2);
    integrate(w, 6 * 3600, { nowMs: at(16, 20), brief: { mood: 'playful', mood_intensity: 1 } });
    expect(moodLabel(w)).toBe('playful');
  });
});

describe('XP, levels, unlocks', () => {
  it('level math', () => {
    expect([0, 99, 100, 349, 350, 899, 900, 1999, 2000, 99999].map(levelFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('respects daily caps per source', () => {
    const w = newWorld(1, kstMidnight(BORN) + 12 * 3600e3); // day 0: no backfill
    expect(w.skills.writing.xp).toBe(0);
    addXp(w, 'writing', 100, 'self');
    expect(w.skills.writing.xp).toBe(XP_CAPS.selfPerDay);
    addXp(w, 'writing', 5, 'self');
    expect(w.skills.writing.xp).toBe(XP_CAPS.selfPerDay);
    addXp(w, 'writing', 50, 'visitor');
    expect(w.skills.writing.xp).toBe(XP_CAPS.selfPerDay + XP_CAPS.visitorsPerDay);
    // New day resets the caps and adds the alive bonus.
    rollDay(w, kstMidnight(BORN) + 36 * 3600e3);
    expect(w.skills.writing.xp).toBe(92);
    expect(w.xpToday).toEqual({});
  });

  it('level-ups unlock items, combos and skills', () => {
    const w = newWorld(1, kstMidnight(BORN) + 12 * 3600e3);
    w.skills.writing.xp = 340;
    const r = addXp(w, 'writing', 20, 'self');
    expect(r.leveledUp).toBe(true);
    expect(r.level).toBe(3);
    expect(r.unlocks).toContain('item:desk_lamp');
    expect(w.items).toContain('desk_lamp');

    w.skills.dancing.xp = 95;
    const d = addXp(w, 'dancing', 10, 'self');
    expect(d.unlocks).toEqual(expect.arrayContaining(['combo:spin', 'skill:juggling']));
    expect(w.skills.juggling).toEqual({ xp: 0 });

    expect(w.skills.flying).toBeUndefined();
    w.counters.lifetime.pushes = 200;
    expect(checkUnlocks(w, w.sim_at)).toContain('skill:flying');
  });

  it('backfills the daily alive bonus for an old Trinity', () => {
    const w = newWorld(1, at(12));
    expect(w.skills.writing.xp).toBe(132 * XP_CAPS.dailyAliveBonus);
    expect(w.items).toEqual(expect.arrayContaining(['kettle', 'toolbox', 'telescope']));
    expect(w.skills.flying).toBeDefined(); // 21+ days alive
  });

  it('fumble rate tracks FUMBLE_CHANCE by level', () => {
    const rate = (xp) => {
      let f = 0;
      const N = 1500;
      for (let k = 0; k < N; k++) {
        const w = newWorld(1, kstMidnight(BORN) + 12 * 3600e3);
        w.skills.research.xp = xp;
        const p = buildPlan(w, 'research_scan', { nowMs: at(12) }, mulberry32(k + 1), at(12));
        if (p.fumbles > 0) f++;
      }
      return f / N;
    };
    expect(Math.abs(rate(0) - FUMBLE_CHANCE[0])).toBeLessThan(0.05);
    expect(Math.abs(rate(900) - FUMBLE_CHANCE[3])).toBeLessThan(0.03);
    expect(rate(2000)).toBeLessThan(0.03);
  });
});

describe('plans', () => {
  it('builds walk + activity steps with monotonic times', () => {
    const w = newWorld(3, at(14));
    const p = buildPlan(w, 'tend_plants', { nowMs: at(14) }, mulberry32(3), at(14));
    expect(p.steps[0].kind).toBe('walk');
    let t = p.started_at;
    for (const s of p.steps) { expect(s.t0).toBeGreaterThanOrEqual(t); if (s.t1) { expect(s.t1).toBeGreaterThan(s.t0); t = s.t1; } }
    expect(p.ends_at).toBe(t);
    expect(w.pos).toEqual({ i: ZONES.plants.i, j: ZONES.plants.j });
    const mid = posAt(p, p.steps[0].t0 + (p.steps[0].t1 - p.steps[0].t0) / 2);
    expect(mid.i).toBeGreaterThan(5.5);
  });

  it('away walks out the door and back', () => {
    const w = newWorld(3, at(14));
    const p = buildPlan(w, 'away', { nowMs: at(14) }, mulberry32(4), at(14));
    const walks = p.steps.filter((s) => s.kind === 'walk');
    expect(walks.some((s) => s.path.some(([i]) => i > 10))).toBe(true);
    expect(p.note).toBeTruthy();
    expect(w.pos).toEqual({ i: ZONES.door.i, j: ZONES.door.j });
  });

  it('catchUp over 8h idle is deterministic, bounded and ends asleep at night', () => {
    const run = () => {
      const w = newWorld(9, at(16));
      catchUp(w, at(16), at(16) + 8 * 3600e3, { visitors: 0, brief: null }, 77);
      return w;
    };
    const a = run(), b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.activity).toBe('sleep');
    expect(a.pos).toEqual({ i: ZONES.pod.i, j: ZONES.pod.j });
    expect(a.sim_at).toBe(at(16) + 8 * 3600e3);
  });

  it('catchUp across days rolls the date and restores energy by morning', () => {
    const w = newWorld(9, at(20));
    w.energy = 30;
    catchUp(w, at(20), at(20) + 12 * 3600e3, {}, 5);
    expect(w.kst_date).toBe('2026-09-20');
    expect(w.energy).toBeGreaterThan(80);
  });
});

describe('reactions + physics', () => {
  it('poke escalates with annoyance', () => {
    const w = newWorld(1, at(14));
    const r1 = selectReaction(w, 'poke', {}, { nowMs: at(14) }, mulberry32(1));
    w.crowd.annoyance = 0.9;
    const r2 = selectReaction(w, 'poke', {}, { nowMs: at(14) }, mulberry32(1));
    expect(r1.anims[0]).toBe('surprised');
    expect(r2.anims).toEqual(['angry']);
    expect(r2.interrupt.untilMs).toBeGreaterThan(at(14));
  });

  it('asleep: sleepy bubble, then grumpy after 5 pokes', () => {
    const w = newWorld(1, at(2));
    expect(selectReaction(w, 'poke', {}, { nowMs: at(2), sleepPokes: 1 }, mulberry32(1)).interrupt.kind).toBe('asleep');
    expect(selectReaction(w, 'poke', {}, { nowMs: at(2), sleepPokes: 5 }, mulberry32(1)).anims).toEqual(['wake_up', 'angry', 'sleep']);
  });

  it('spam -> shield -> teleport', () => {
    const w = newWorld(1, at(14));
    expect(selectReaction(w, 'pet', {}, { nowMs: at(14), spamCount: CROWD.spam.shieldAt }, mulberry32(1)).interrupt.kind).toBe('shield');
    const tp = selectReaction(w, 'pet', {}, { nowMs: at(14), spamCount: CROWD.spam.teleportAt }, mulberry32(1));
    expect(tp.interrupt.kind).toBe('teleport');
    expect(tp.interrupt.pos).toBeTruthy();
  });

  it('pet turns to love when affection is high', () => {
    const w = newWorld(1, at(14));
    w.crowd.affection = 0.8;
    expect(selectReaction(w, 'pet', {}, { nowMs: at(14) }, mulberry32(1)).anims).toEqual(['love']);
  });

  it('toss: hit at low juggling, catch at level 2+', () => {
    const w = newWorld(1, at(14));
    const hit = selectReaction(w, 'toss', { item: 'ball', i: w.pos.i, j: w.pos.j }, { nowMs: at(14) }, mulberry32(1));
    expect(hit.toss).toBe('hit');
    w.skills.juggling.xp = 2000;
    const c = selectReaction(w, 'toss', { item: 'ball', i: w.pos.i, j: w.pos.j }, { nowMs: at(14) }, mulberry32(1));
    expect(c.toss).toBe('catch');
  });

  it('physics is deterministic and classifies landings', () => {
    const g = buildGrid([]);
    const v = flingVelocity({ vi: 0.8, vj: -0.4, vz: 1 });
    const a = simulateFling({ i: 5, j: 5, z: 0 }, v, g);
    const b = simulateFling({ i: 5, j: 5, z: 0 }, v, g);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.outcome).toBe('knockdown');
    for (const f of a.frames) { expect(f.i).toBeGreaterThanOrEqual(0); expect(f.i).toBeLessThanOrEqual(10); expect(f.z).toBeGreaterThanOrEqual(0); }
    const soft = simulateFling({ i: 5, j: 5, z: 0 }, flingVelocity({ vi: 0.2, vj: 0, vz: 0.2 }), g);
    expect(soft.outcome).toBe('land');
    expect(soft.landing.i).toBeGreaterThan(5);
  });

  it('push reaction carries the fling for clients', () => {
    const w = newWorld(1, at(14));
    delete w.skills.flying;
    const r = selectReaction(w, 'push', { vi: 1, vj: 0, vz: 0.2 }, { nowMs: at(14), pos: { i: 5, j: 5 } }, mulberry32(1));
    expect(r.interrupt.kind).toBe('pushed');
    expect(r.fling.v.vi).toBe(7);
    expect(r.interrupt.pos.i).toBeGreaterThan(5);
  });
});

describe('schedule', () => {
  it('planAt returns the plan covering now for everyone', () => {
    const now = at(15, 42);
    const { plan, world } = planAt(now, null);
    expect(plan.started_at).toBeLessThanOrEqual(now);
    expect(plan.ends_at).toBeGreaterThan(now);
    expect(ACTIVITIES[plan.activity]).toBeTruthy();
    expect(world.kst_date).toBe(DAY);
    const night = planAt(at(1, 10), null);
    expect(night.plan.activity).toBe('sleep');
    expect(hashSeed('x')).toBe(hashSeed('x'));
  });
});
