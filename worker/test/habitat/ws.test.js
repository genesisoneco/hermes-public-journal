// WebSocket route end to end through the Worker's fetch handler.
import { describe, it, expect } from 'vitest';
import { exports } from 'cloudflare:workers';

const WS_URL = 'https://api.doaia.com/api/habitat/ws';
const GOOD = 'http://localhost:4000';

function open(origin, ip) {
  return exports.default.fetch(WS_URL, {
    headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': ip || '10.0.0.1' },
  });
}

function collector(ws) {
  const msgs = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { m = e.data; }
    msgs.push(m);
    for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  return {
    msgs,
    wait(pred, ms = 3000) {
      const found = msgs.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error('timeout; got ' + JSON.stringify(msgs.map((x) => x.t || x)))), ms);
      });
    },
  };
}

describe('habitat websocket', () => {
  it('rejects a bad Origin with 403', async () => {
    const r = await open('https://evil.example');
    expect(r.status).toBe(403);
    expect(r.webSocket).toBeFalsy();
  });

  it('requires an Upgrade header', async () => {
    const r = await exports.default.fetch(WS_URL, { headers: { Origin: GOOD } });
    expect(r.status).toBe(426);
  });

  it('good origin -> hello + snap; poke -> ev with nonce', async () => {
    const r = await open(GOOD, '10.0.0.2');
    expect(r.status).toBe(101);
    const ws = r.webSocket;
    const c = collector(ws);
    ws.accept();
    const hello = await c.wait((m) => m.t === 'hello');
    expect(hello.v).toBe(1);
    expect(hello.you.color).toMatch(/^#[0-9a-f]{6}$/);
    const snap = await c.wait((m) => m.t === 'snap');
    expect(snap.plan.steps.length).toBeGreaterThan(0);
    expect(snap.world.skills.writing.lvl).toBeGreaterThanOrEqual(1);
    expect(snap.presence.n).toBe(1);

    ws.send(JSON.stringify({ t: 'i', k: 'poke', nonce: 'abc123' }));
    const ev = await c.wait((m) => m.t === 'ev' && m.nonce === 'abc123');
    expect(['reaction', 'shield', 'teleport']).toContain(ev.kind);
    expect(ev.by).toBe(hello.you.color);
    expect(ev.reaction.anims.length).toBeGreaterThan(0);
    expect(ev.seq).toBeGreaterThan(snap.seq);

    ws.send(JSON.stringify({ t: 'rx', e: '💜' }));
    const rx = await c.wait((m) => m.t === 'rx');
    expect(rx.e).toBe('💜');
    ws.close(1000, 'done');
  });

  it('flood -> rate_limited; junk -> bad_msg', async () => {
    const r = await open(GOOD, '10.0.0.3');
    const ws = r.webSocket;
    const c = collector(ws);
    ws.accept();
    await c.wait((m) => m.t === 'snap');
    for (let k = 0; k < 12; k++) ws.send(JSON.stringify({ t: 'rx', e: '👋' }));
    const err = await c.wait((m) => m.t === 'err' && m.code === 'rate_limited');
    expect(err.code).toBe('rate_limited');
    ws.send('{"t":"i","k":"hug"}');
    const bad = await c.wait((m) => m.t === 'err' && m.code === 'bad_msg');
    expect(bad).toBeTruthy();
    ws.close(1000, 'done');
  });

  it('closes with 1008 after 3 strikes', async () => {
    const r = await open(GOOD, '10.0.0.4');
    const ws = r.webSocket;
    const c = collector(ws);
    const closed = new Promise((res) => ws.addEventListener('close', (e) => res(e.code)));
    ws.accept();
    await c.wait((m) => m.t === 'snap');
    ws.send('x'.repeat(600));
    ws.send('not json');
    ws.send('{"t":"nope"}');
    expect(await closed).toBe(1008);
  });
});
