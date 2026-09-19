// Offline day plan: when the live server can't be reached, every viewer runs
// this and sees the same Trinity doing the same thing at the same moment.
//
// The day is cut into 30-minute slots. Each slot starts from a coarse
// catch-up (00:00 KST -> slot start) seeded by the date, then plays real
// plans until one covers `nowMs`. Same (nowMs slot, brief) -> same result.
import { ACTIVITIES } from "./rules.js";
import { hashSeed, mulberry32 } from "./rng.js";
import { kstMidnight, kstParts } from "./clock.js";
import { buildPlan, catchUp, chooseActivity, completePlan, integrate, newWorld, posAt } from "./brain.js";

export const SLOT_MS = 30 * 60 * 1000;

export function planAt(nowMs, brief) {
  const p = kstParts(nowMs);
  const dayStart = kstMidnight(p.dateStr);
  const slotStart = dayStart + Math.floor((nowMs - dayStart) / SLOT_MS) * SLOT_MS;
  const seed = hashSeed("trinity:" + p.dateStr);
  const b = brief || null;

  const world = newWorld(seed, dayStart);
  const ctx = { nowMs: dayStart, visitors: 0, brief: b, unlockedItems: world.items };
  if (slotStart > dayStart) catchUp(world, dayStart, slotStart, ctx, hashSeed(p.dateStr + ":cu:" + slotStart));

  const rng = mulberry32(hashSeed(p.dateStr + ":slot:" + slotStart));
  let t = slotStart;
  let plan = null;
  for (let k = 0; k < 400; k++) {
    const c = Object.assign({}, ctx, { nowMs: t, unlockedItems: world.items });
    const act = chooseActivity(world, c, rng);
    plan = buildPlan(world, ACTIVITIES[act] ? act : "think", c, rng, t);
    if (plan.ends_at > nowMs) break;
    integrate(world, (plan.ends_at - t) / 1000, Object.assign({}, c, { nowMs: plan.ends_at }));
    completePlan(world, plan, c);
    t = plan.ends_at;
  }
  // Report the live position rather than the plan's end point.
  const out = JSON.parse(JSON.stringify(world));
  out.pos = posAt(plan, nowMs, world.pos);
  return { plan, world: out };
}
