// KST clock helpers (ported from the old /live/ FSM in assets/js/live.js).
// Korea has no DST, so KST is a fixed UTC+9 offset: plain arithmetic,
// no Intl, identical in browsers and in workerd.
import { BORN, CIRCADIAN } from "./rules.js";

export const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

export function kstParts(ms) {
  const d = new Date(ms + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    y, mo, d: day,
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    dateStr: y + "-" + pad2(mo) + "-" + pad2(day),
  };
}

export function isSleepHour(h) {
  return h >= CIRCADIAN.sleepStart || h < CIRCADIAN.sleepEnd;
}

export function todBucket(h) {
  if (isSleepHour(h)) return "sleep";
  if (h >= 6 && h < 9) return "morning";
  if (h >= 9 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

// Epoch ms of 00:00 KST on the given "YYYY-MM-DD".
export function kstMidnight(dateStr) {
  const [y, mo, d] = String(dateStr).split("-").map(Number);
  return Date.UTC(y, mo - 1, d) - KST_OFFSET_MS;
}

// Epoch ms of the next KST wall-clock hour `h` strictly after `ms`.
export function nextKstHour(ms, h) {
  const p = kstParts(ms);
  let t = kstMidnight(p.dateStr) + h * 3600000;
  if (t <= ms) t += DAY_MS;
  return t;
}

// Whole KST calendar days since BORN. Born day = 0.
export function daysAlive(ms) {
  const today = kstMidnight(kstParts(ms).dateStr);
  const born = kstMidnight(BORN);
  return Math.max(0, Math.round((today - born) / DAY_MS));
}
