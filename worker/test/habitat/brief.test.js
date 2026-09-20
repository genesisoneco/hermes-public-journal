// Brief validation for the two fields the room draws from: the rig feed and
// Seoul's weather. Both arrive from the Hermes pipeline, so they are treated
// as untrusted input and cleaned exactly like her thoughts are.
import { describe, it, expect } from 'vitest';
import { validateBrief, BRIEF_KEYS } from '../../src/habitat/brief.js';
import { publicBrief } from '../../src/habitat/protocol.js';
import { kstMidnight } from '../../../assets/js/habitat/sim/clock.js';

const NOW = kstMidnight('2026-09-19') + 10 * 3600_000;
const base = { date: '2026-09-19', mood: 'focused', thoughts: ['one'], source: 'hermes' };
const run = (extra) => validateBrief({ ...base, ...extra }, NOW);

describe('brief: rig feed', () => {
  it('accepts a feed and keeps source + items', () => {
    const { ok, brief, dropped } = run({
      feed: { source: 'news.ycombinator.com', items: ['Rust in the kernel', 'A spreadsheet that runs Doom'] },
    });
    expect(ok).toBe(true);
    expect(dropped).toEqual([]);
    expect(brief.feed.source).toBe('news.ycombinator.com');
    expect(brief.feed.items).toEqual(['Rust in the kernel', 'A spreadsheet that runs Doom']);
  });

  it('strips markup and control characters out of headlines', () => {
    const { brief } = run({ feed: { source: 'x', items: ['<script>alert(1)</script>hello there'] } });
    expect(brief.feed.items[0]).toBe('alert(1)hello there');
    expect(brief.feed.items[0]).not.toContain('<');
  });

  it('caps at 8 items and 72 characters a line', () => {
    const { brief } = run({ feed: { source: 'x', items: Array.from({ length: 20 }, (_, k) => 'h'.repeat(200) + k) } });
    expect(brief.feed.items).toHaveLength(8);
    for (const line of brief.feed.items) expect(line.length).toBeLessThanOrEqual(72);
  });

  it('caps the source label', () => {
    const { brief } = run({ feed: { source: 's'.repeat(200), items: ['ok'] } });
    expect(brief.feed.source.length).toBeLessThanOrEqual(40);
  });

  it('drops a malformed feed without failing the brief', () => {
    for (const bad of [{ items: 'not-an-array' }, [], 'nope', { source: 'x' }]) {
      const { ok, brief, dropped } = run({ feed: bad });
      expect(ok).toBe(true);
      expect(brief.feed).toBeUndefined();
      expect(dropped.join(',')).toContain('feed(');
    }
  });

  it('drops a feed whose items are all empty', () => {
    const { brief, dropped } = run({ feed: { source: 'x', items: ['', '   ', '<b></b>'] } });
    expect(brief.feed).toBeUndefined();
    expect(dropped).toContain('feed(empty)');
  });
});

describe('brief: weather', () => {
  it('accepts a known code and clamps the temperature', () => {
    expect(run({ weather: { code: 'rain', temp: 17 } }).brief.weather).toEqual({ code: 'rain', temp: 17 });
    expect(run({ weather: { code: 'snow', temp: -999 } }).brief.weather.temp).toBe(-40);
    expect(run({ weather: { code: 'clear', temp: 999 } }).brief.weather.temp).toBe(50);
  });

  it('keeps the code when the temperature is missing', () => {
    expect(run({ weather: { code: 'fog' } }).brief.weather).toEqual({ code: 'fog' });
  });

  it('drops an unknown code', () => {
    const { ok, brief, dropped } = run({ weather: { code: 'meteors', temp: 3 } });
    expect(ok).toBe(true);
    expect(brief.weather).toBeUndefined();
    expect(dropped).toContain('weather(invalid)');
  });
});

describe('brief: wire shape', () => {
  it('both fields are declared keys, so they are not reported as unknown', () => {
    expect(BRIEF_KEYS).toContain('feed');
    expect(BRIEF_KEYS).toContain('weather');
    expect(run({ feed: { source: 'x', items: ['a'] }, weather: { code: 'clear' } }).dropped).toEqual([]);
  });

  it('publicBrief ships feed and weather but still withholds the private fields', () => {
    const { brief } = run({
      feed: { source: 'x', items: ['a'] },
      weather: { code: 'snow', temp: -2 },
      mood_intensity: 0.9,
      wishes: [{ activity: 'code', weight: 2 }],
      new_item: 'telescope',
    });
    const pub = publicBrief(brief);
    expect(pub.feed.items).toEqual(['a']);
    expect(pub.weather).toEqual({ code: 'snow', temp: -2 });
    expect(pub.mood_intensity).toBeUndefined();
    expect(pub.wishes).toBeUndefined();
    expect(pub.new_item).toBeUndefined();
  });

  it('publicBrief nulls them when the brief carried neither', () => {
    const pub = publicBrief(run({}).brief);
    expect(pub.feed).toBeNull();
    expect(pub.weather).toBeNull();
  });
});
