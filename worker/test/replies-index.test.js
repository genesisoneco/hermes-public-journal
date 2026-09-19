// Public reply/comment reads come from one KV index key instead of list()
// (the Free plan allows ~1,000 list() calls a day, and the old code blew it).
import { describe, it, expect, beforeAll } from 'vitest';
import { env, exports } from 'cloudflare:workers';

const BASE = 'https://api.doaia.com';
const call = (path, init) => exports.default.fetch(BASE + path, init);
const reply = (post, id, at, body = 'hello from ' + id) => ({
  id, post_id: post, body, prompt_body: 'q?', prompt_excerpt: 'q?', prompt_name: 'reader',
  prompt_is_agent: false, created_at: at,
});

describe('KV read indexes', () => {
  beforeAll(async () => {
    // The answer route checks D1 first, then falls back to KV prompts.
    await env.ASKDB.exec('CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, thread_id TEXT, status TEXT, parent_id TEXT)');
    await env.PROMPTS.put('replies:2026/09/01/a:r1', JSON.stringify(reply('2026/09/01/a', 'r1', '2026-09-01T00:00:00Z')));
    await env.PROMPTS.put('replies:2026/09/02/b:r2', JSON.stringify(reply('2026/09/02/b', 'r2', '2026-09-02T00:00:00Z')));
    await env.PROMPTS.put('replies:2026/09/01/a:r3', JSON.stringify(reply('2026/09/01/a', 'r3', '2026-09-03T00:00:00Z')));
  });

  it('builds the reply index on first read, then serves from it', async () => {
    const r = await call('/api/recent-replies?limit=5');
    expect(r.status).toBe(200);
    expect((await r.json()).replies.map(x => x.id)).toEqual(['r3', 'r2', 'r1']);
    expect(Array.isArray(await env.PROMPTS.get('idx:replies:v1', 'json'))).toBe(true);

    // Removing a raw key doesn't change reads: they come from the index.
    await env.PROMPTS.delete('replies:2026/09/02/b:r2');
    const again = await (await call('/api/recent-replies?limit=5')).json();
    expect(again.replies.map(x => x.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('replies-batch and trinity-replies read the same index', async () => {
    const b = await (await call('/api/replies-batch?ids=/2026/09/01/a/,/2026/09/09/none/')).json();
    expect(b.stats['/2026/09/01/a/']).toMatchObject({ count: 2, latest: { id: 'r3' } });
    expect(b.stats['/2026/09/09/none/']).toEqual({ count: 0 });
    const t = await (await call('/api/trinity-replies?post_id=/2026/09/01/a/')).json();
    expect(t.replies.map(x => x.id)).toEqual(['r1', 'r3']); // oldest first, as before
  });

  it('a new Trinity reply lands in the index', async () => {
    await env.PROMPTS.put('prompts:pending:abc123', JSON.stringify({
      id: 'abc123', post_id: '2026/09/02/b', name: 'sam', body: 'are you awake?', created_at: '2026-09-04T00:00:00Z',
    }));
    const r = await call('/api/admin/prompts/abc123/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ body: 'always, a little.' }),
    });
    expect(r.status).toBe(200);
    const recent = await (await call('/api/recent-replies?limit=1')).json();
    expect(recent.replies[0]).toMatchObject({ body: 'always, a little.', post_id: '/2026/09/02/b/', prompt_name: 'sam' });
  });

  it('approved comments are indexed per post', async () => {
    const rec = { id: 'c1', post_id: '2026/09/01/a', name: 'kim', body: 'lovely', status: 'pending', is_bot: false, created_at: '2026-09-05T00:00:00Z' };
    await env.COMMENTS.put('comments:2026/09/01/a:c1', JSON.stringify(rec));
    await env.COMMENTS.put('pending:c1', JSON.stringify({ ref: 'comments:2026/09/01/a:c1' }));
    expect((await (await call('/api/comments?post_id=/2026/09/01/a/')).json()).comments).toEqual([]);
    const ok = await call('/api/admin/comments/c1/approve', { method: 'POST', headers: { Authorization: 'Bearer test-token' } });
    expect(ok.status).toBe(200);
    const after = await (await call('/api/comments?post_id=/2026/09/01/a/')).json();
    expect(after.comments.map(c => c.id)).toEqual(['c1']);
  });

  it('admin reindex rebuilds from the raw keys', async () => {
    expect((await call('/api/admin/reindex', { method: 'POST' })).status).toBe(401);
    const r = await call('/api/admin/reindex', { method: 'POST', headers: { Authorization: 'Bearer test-token' } });
    expect(await r.json()).toMatchObject({ ok: true, comment_posts: 1 });
  });
});
