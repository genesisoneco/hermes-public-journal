// Durable Object behaviour: catch-up, alarms, briefs, spam, persistence.
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { CROWD } from '../../../assets/js/habitat/sim/rules.js';

const stubFor = (name) => env.HABITAT.get(env.HABITAT.idFromName(name));
const who = (n) => ({ id: 't' + n, color: '#7ee0a8' });

describe('TrinityHabitat', () => {
  it('catches up after 8h idle', async () => {
    const stub = stubFor('catchup');
    await stub.getSnapshot();
    const eightH = 8 * 3600e3;
    await runInDurableObject(stub, (inst) => {
      const past = Date.now() - eightH;
      inst.world.sim_at = past;
      inst.plan.started_at = past - 60000;
      inst.plan.ends_at = past;
      inst.world.energy = 40;
    });
    const snap = await stub.getSnapshot();
    expect(snap.t).toBe('snap');
    await runInDurableObject(stub, (inst) => {
      expect(Date.now() - inst.world.sim_at).toBeLessThan(5000);
      expect(inst.plan.started_at).toBeGreaterThan(Date.now() - 5000);
      // 8 hours changed her energy one way or another (drain, sleep or charge).
      expect(inst.world.energy).not.toBe(40);
    });
  });

  it('sets no alarm when nobody is connected', async () => {
    const stub = stubFor('noalarm');
    const r = await stub.interact({ k: 'poke', ipTag: 'aaaa', nonce: 'n1' });
    expect(r.ok).toBe(true);
    await stub.getSnapshot();
    await runInDurableObject(stub, async (inst, state) => {
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });

  it('validates briefs and drops unknown keys', async () => {
    const stub = stubFor('brief');
    const res = await stub.ingestBrief({
      date: '2026-09-19', mood: 'curious', mood_intensity: 4, evil: '<script>', thoughts: ['one <b>bold</b> thought', 42],
      wishes: [{ activity: 'dance', weight: 2 }, { activity: 'launch_missiles', weight: 3 }],
      practicing_skill: 'hacking', new_item: 'trophy_shelf', post_url: 'https://evil.example/x', source: 'hermes',
    });
    expect(res.ok).toBe(true);
    expect(res.dropped).toContain('evil');
    expect(res.dropped).toContain('wish(invalid)');
    expect(res.brief.evil).toBeUndefined();
    expect(res.brief.mood_intensity).toBe(1);
    expect(res.brief.thoughts).toEqual(['one bold thought']);
    expect(res.brief.wishes).toEqual([{ activity: 'dance', weight: 2, note: '' }]);
    expect(res.brief.post_url).toBe('');
    expect(res.item).toEqual({ item: 'trophy_shelf', status: 'arrive' });
    const snap = await stub.getSnapshot();
    expect(snap.brief.mood).toBe('curious');
    expect(snap.world.items).toContain('trophy_shelf');
    const bad = await stub.ingestBrief([1, 2]);
    expect(bad.ok).toBe(false);
  });

  it('spam raises a shield, then teleports', async () => {
    const stub = stubFor('spam');
    await stub.getSnapshot();
    await runInDurableObject(stub, (inst) => {
      const now = Date.now();
      const kinds = [];
      const { shieldAt, teleportAt } = CROWD.spam;
      for (let n = 1; n <= teleportAt; n++) {
        const r = inst.interactCore({ k: 'pet' }, who(n), now);
        kinds.push(r.ok ? r.ev.kind : 'err:' + r.code);
      }
      expect(kinds[shieldAt - 2]).not.toBe('shield');
      expect(kinds[shieldAt - 1]).toBe('shield');
      expect(kinds[shieldAt + 5]).toBe('err:shielded');
      expect(kinds[teleportAt - 1]).toBe('teleport');
    });
  });

  it('persists level-ups immediately', async () => {
    const stub = stubFor('levelup');
    await stub.getSnapshot();
    await runInDurableObject(stub, (inst, state) => {
      const now = Date.now();
      inst.plan.ends_at = now + 600000;
      inst.world.activity = 'think';
      inst.world.skills.dancing.xp = 99.5;
      inst.world.xpToday = {};
      inst.lastPersist = now; // make sure only the level-up forces a write
      const r = inst.interactCore({ k: 'tickle' }, who(1), now);
      expect(r.ok).toBe(true);
      const row = state.storage.sql.exec("SELECT v FROM world WHERE k = 'state'").one();
      const saved = JSON.parse(row.v);
      expect(saved.world.skills.dancing.xp).toBeGreaterThanOrEqual(100);
      const ev = state.storage.sql.exec("SELECT kind, data FROM events WHERE kind = 'level_up'").toArray();
      expect(ev.length).toBe(1);
      expect(JSON.parse(ev[0].data).skill).toBe('dancing');
      expect(inst.plan.activity).toBe('level_up');
    });
  });

  it('survives a reload from SQLite', async () => {
    const stub = stubFor('reload');
    await stub.ingestBrief({ mood: 'playful', thoughts: ['hello from storage'] });
    await runInDurableObject(stub, (inst) => {
      const seq = inst.seq;
      inst.load(Date.now());
      expect(inst.brief.thoughts).toEqual(['hello from storage']);
      expect(inst.seq).toBeGreaterThanOrEqual(seq);
    });
  });
});
