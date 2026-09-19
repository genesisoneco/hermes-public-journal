import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// Tests run inside workerd via Miniflare, using wrangler.toml bindings
// (local-only KV / D1 / Durable Objects; nothing touches Cloudflare).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { PIPELINE_TOKEN: 'test-token', IP_HASH_SALT: 'test-salt' },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.js'],
  },
});
