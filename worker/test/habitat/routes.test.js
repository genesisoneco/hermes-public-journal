// HTTP routes for the habitat.
import { describe, it, expect } from 'vitest';
import { exports } from 'cloudflare:workers';

const BASE = 'https://api.doaia.com';
const call = (path, init) => exports.default.fetch(BASE + path, init);

describe('habitat routes', () => {
  it('GET /api/habitat/state returns a cacheable snap with CORS', async () => {
    const r = await call('/api/habitat/state', { headers: { Origin: 'https://www.doaia.com' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('max-age=3');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://www.doaia.com');
    const j = await r.json();
    expect(j.t).toBe('snap');
    expect(j.presence).toEqual({ n: expect.any(Number) });
    expect(j.world.pos).toBeTruthy();
  });

  it('POST /api/habitat/interact validates and answers', async () => {
    const ok = await call('/api/habitat/interact', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.1.0.1' },
      body: JSON.stringify({ k: 'wave', nonce: 'w1' }),
    });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.ok).toBe(true);
    expect(j.ev.nonce).toBe('w1');
    const bad = await call('/api/habitat/interact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 'feed', item: 'cake' }),
    });
    expect(bad.status).toBe(400);
  });

  it('admin brief needs the bearer token', async () => {
    const body = JSON.stringify({ mood: 'hopeful', thoughts: ['a small green thing'] });
    const no = await call('/api/admin/habitat/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(no.status).toBe(401);
    const yes = await call('/api/admin/habitat/brief', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body,
    });
    expect(yes.status).toBe(200);
    expect((await yes.json()).ok).toBe(true);
  });

  it('admin debug needs the bearer token', async () => {
    expect((await call('/api/admin/habitat/debug')).status).toBe(401);
    const r = await call('/api/admin/habitat/debug', { headers: { Authorization: 'Bearer test-token' } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.world.v).toBe(1);
    expect(j.alarm).toBeNull();
  });
});
