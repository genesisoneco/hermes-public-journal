// Daily habitat brief: validation of what the Hermes pipeline posts, plus a
// fallback derived from yesterday's brief when nothing arrives.
import { ACTIVITIES, ITEMS, LINES, MOODS, SKILLS, UNLOCKS } from '../../../assets/js/habitat/sim/rules.js';
import { kstParts } from '../../../assets/js/habitat/sim/clock.js';
import { skillLevel } from '../../../assets/js/habitat/sim/brain.js';

export const BRIEF_KEYS = [
  'date', 'mood', 'mood_intensity', 'wishes', 'thoughts', 'practicing_skill',
  'new_item', 'post_url', 'post_title', 'source',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_THOUGHTS = 8;
const MAX_WISHES = 8;
const THOUGHT_MAX = 90;

function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  let out = s.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + '…';
  return out;
}

function cleanPostUrl(u) {
  if (typeof u !== 'string' || !u) return '';
  if (u.startsWith('/') && !u.startsWith('//')) return u.slice(0, 200);
  try {
    const url = new URL(u);
    if (url.protocol === 'https:' && /(^|\.)doaia\.com$/.test(url.hostname)) return url.toString().slice(0, 200);
  } catch {}
  return '';
}

// Returns { ok, brief, dropped:[unknown keys / invalid fields], error? }.
export function validateBrief(input, nowMs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'brief_must_be_object', dropped: [] };
  const dropped = [];
  for (const k of Object.keys(input)) if (!BRIEF_KEYS.includes(k)) dropped.push(k);

  const today = kstParts(nowMs).dateStr;
  const b = {};
  b.date = typeof input.date === 'string' && DATE_RE.test(input.date) ? input.date : today;
  if (input.date !== undefined && b.date !== input.date) dropped.push('date(invalid)');

  b.mood = MOODS[input.mood] ? input.mood : 'quiet';
  if (input.mood !== undefined && b.mood !== input.mood) dropped.push('mood(invalid)');

  const mi = Number(input.mood_intensity);
  b.mood_intensity = Number.isFinite(mi) ? Math.min(1, Math.max(0, Math.round(mi * 100) / 100)) : 0.6;

  b.wishes = [];
  if (Array.isArray(input.wishes)) {
    for (const w of input.wishes) {
      if (b.wishes.length >= MAX_WISHES) break;
      if (!w || typeof w !== 'object' || !ACTIVITIES[w.activity] || w.activity === 'sleep') { dropped.push('wish(invalid)'); continue; }
      if (b.wishes.some((x) => x.activity === w.activity)) continue;
      const wt = Number(w.weight);
      b.wishes.push({
        activity: w.activity,
        weight: Number.isFinite(wt) ? Math.min(3, Math.max(0, Math.round(wt * 100) / 100)) : 1,
        note: cleanText(w.note, THOUGHT_MAX),
      });
    }
  }

  b.thoughts = [];
  if (Array.isArray(input.thoughts)) {
    for (const t of input.thoughts) {
      if (b.thoughts.length >= MAX_THOUGHTS) break;
      const s = cleanText(t, THOUGHT_MAX);
      if (s) b.thoughts.push(s);
    }
  }

  b.practicing_skill = SKILLS[input.practicing_skill] ? input.practicing_skill : null;
  if (input.practicing_skill && !b.practicing_skill) dropped.push('practicing_skill(invalid)');

  if (input.new_item !== undefined && input.new_item !== null && input.new_item !== '') {
    const it = ITEMS[input.new_item];
    if (it && !it.visitor) b.new_item = input.new_item;
    else dropped.push('new_item(invalid)');
  }

  b.post_url = cleanPostUrl(input.post_url);
  b.post_title = cleanText(input.post_title, 120);
  b.source = input.source === 'hermes' ? 'hermes' : 'derived';
  return { ok: true, brief: b, dropped };
}

// An item from the brief arrives only if its unlock condition is met.
// Items with no UNLOCKS row (e.g. trophy_shelf) are gifts she can just have.
export function newItemStatus(world, item) {
  if (!item || !ITEMS[item] || ITEMS[item].visitor) return 'invalid';
  if (world.items.includes(item)) return 'already';
  const rows = UNLOCKS.filter((u) => (u.items || []).includes(item));
  if (!rows.length) return 'arrive';
  return rows.some((u) => skillLevel(world, u.skill) >= u.level) ? 'arrive' : 'wishlist';
}

// Yesterday's brief, faded: same mood a little softer, wishes at half weight,
// a couple of carried-over thoughts plus fallback lines.
export function deriveBrief(prev, dateStr, world) {
  let practicing = prev && prev.practicing_skill;
  if (!practicing) {
    // Practise whatever she's worst at (ties -> rules order).
    let best = null, bestXp = Infinity;
    for (const s of Object.keys(world.skills)) {
      if (world.skills[s].xp < bestXp) { bestXp = world.skills[s].xp; best = s; }
    }
    practicing = best;
  }
  const thoughts = [];
  for (const t of (prev && prev.thoughts) || []) { if (thoughts.length < 2) thoughts.push(t); }
  for (const t of LINES.brief_fallback) thoughts.push(t);
  return {
    date: dateStr,
    mood: prev && MOODS[prev.mood] ? prev.mood : world.mood.label || 'quiet',
    mood_intensity: prev && Number.isFinite(prev.mood_intensity) ? Math.round(prev.mood_intensity * 0.8 * 100) / 100 : 0.5,
    wishes: ((prev && prev.wishes) || []).map((w) => ({ activity: w.activity, weight: Math.round(w.weight * 50) / 100, note: w.note || '' })),
    thoughts,
    practicing_skill: practicing,
    post_url: (prev && prev.post_url) || '',
    post_title: (prev && prev.post_title) || '',
    source: 'derived',
  };
}
