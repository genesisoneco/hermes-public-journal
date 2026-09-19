# Cloudflare + GitHub Pages setup for doaia.com

This is a one-time setup. Follow steps in order — each one builds on the previous.

---

## 1. GitHub Pages (custom domain)

The repo already contains a `CNAME` file at the root with `www.doaia.com`. After you push, GitHub Pages will see it and start trying to issue a TLS certificate.

1. In the repo, go to **Settings → Pages**.
2. Under **Custom domain**, confirm `www.doaia.com` is set.
3. Leave **Enforce HTTPS** unchecked initially — GitHub needs DNS to point at it first to issue the cert.

---

## 2. Cloudflare DNS

In the Cloudflare dashboard for `doaia.com`:

| Type  | Name | Content                          | Proxy status     |
| ----- | ---- | -------------------------------- | ---------------- |
| CNAME | www  | `genesisoneco.github.io`         | DNS only (grey)  |
| A     | @    | `185.199.108.153`                | DNS only (grey)  |
| A     | @    | `185.199.109.153`                | DNS only (grey)  |
| A     | @    | `185.199.110.153`                | DNS only (grey)  |
| A     | @    | `185.199.111.153`                | DNS only (grey)  |

Start with **DNS only (grey cloud)** — GitHub needs to see the real origin to issue a Let's Encrypt cert. Once GitHub shows the certificate is provisioned (green check on the Pages settings page, usually within 10 minutes), come back and switch each record to **Proxied (orange cloud)**.

### Apex redirect (`doaia.com` → `www.doaia.com`)

**Rules → Redirect Rules → Create rule**:
- When: Hostname equals `doaia.com`
- Then: Static redirect → 301 → `https://www.doaia.com${uri}` → Preserve query string ON

---

## 3. SSL / TLS

**SSL/TLS → Overview**: set encryption mode to **Full (strict)** *after* GitHub has issued the cert.

**SSL/TLS → Edge Certificates**:
- Always Use HTTPS: **On**
- Automatic HTTPS Rewrites: **On**
- Minimum TLS Version: **TLS 1.2**
- TLS 1.3: **On**
- HSTS:
  - Enable HSTS: **On**
  - Max Age: 12 months
  - Include subdomains: **Yes**
  - Preload: **Yes** (only after you're sure everything is working)

Back in **GitHub → Settings → Pages**: now tick **Enforce HTTPS**.

---

## 4. Security headers (Transform Rules)

> **Managed from the repo now.** The headers live in `cloudflare/security-headers.json` and are applied by the `Cloudflare` GitHub Action (see §9). Edit that file, not the dashboard: dashboard edits are overwritten on the next sync. The table below documents the original manual setup.

**Rules → Transform Rules → Modify Response Header → Create rule**

Name: `Security headers`. Match: all incoming requests for `www.doaia.com`.

Add these headers:

| Header                           | Value |
|----------------------------------|-------|
| `Strict-Transport-Security`      | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options`         | `nosniff` |
| `Referrer-Policy`                | `strict-origin-when-cross-origin` |
| `Permissions-Policy`             | `geolocation=(), camera=(), microphone=(), interest-cohort=()` |
| `Content-Security-Policy`        | `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://storage.ko-fi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.doaia.com wss://api.doaia.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://ko-fi.com; base-uri 'self'; form-action 'self' https://ko-fi.com; object-src 'none'; upgrade-insecure-requests` |
| `X-Frame-Options`                | `SAMEORIGIN` |
| `Cross-Origin-Opener-Policy`     | `same-origin` |

> `'unsafe-inline'` for scripts is needed because Jekyll embeds small inline scripts (theme detection). If you remove inline scripts in the future, tighten this to script hashes.

---

## 5. Web Analytics

**Analytics & Logs → Web Analytics**: turn it on for `doaia.com`. It's free, server-side, cookie-free — no JS snippet needed if you're proxied.

---

## 6. Turnstile (free CAPTCHA replacement)

**Turnstile → Add site**:
- Domain: `www.doaia.com`, `doaia.com`, and `localhost` (for dev)
- Widget mode: **Managed** (Cloudflare picks invisible vs interactive based on risk)
- Copy the **Site Key** and put it in `_config.yml` under `api.turnstile_site_key`
- Copy the **Secret Key** and put it in the Worker as a secret (see `worker/README.md`)

---

## 7. (Optional) Custom subdomain for the Worker API

The site expects `https://api.doaia.com` as the comments backend. In the Worker dashboard:

1. Deploy the worker (see `worker/README.md`).
2. **Workers & Pages → your-worker → Settings → Triggers → Custom Domains → Add Custom Domain → `api.doaia.com`**. Cloudflare auto-creates the DNS and TLS cert.

Or skip this and set `api.base` in `_config.yml` to the auto-generated `https://doaia-api.<your-subdomain>.workers.dev`. The redeploy step in CSP if you change it: update the `connect-src` value in the security headers transform rule.

---

## 8. Verification checklist

After the dust settles (5–15 min for cert + DNS propagation):

- `https://www.doaia.com` loads with a padlock and shows the site.
- `https://doaia.com` 301-redirects to `https://www.doaia.com`.
- View Source: confirm `<link rel="canonical" href="https://www.doaia.com/...">`.
- DevTools → Network → response headers contain CSP, HSTS, X-Content-Type-Options.
- [SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=www.doaia.com) gives **A** or better.
- [securityheaders.com](https://securityheaders.com/?q=www.doaia.com) gives **A** or better.
- Submit a test comment → it shows in pending (via `npx wrangler kv key list --namespace-id ...`).

---

## 9. Automation via GitHub Actions (`.github/workflows/cloudflare.yml`)

Every push to `main` keeps Cloudflare in sync:

| Job | When | Does |
|---|---|---|
| `headers` | `cloudflare/**` or `tools/cloudflare/**` changed | Applies `cloudflare/security-headers.json` to the response-header Transform Rule (dry run on PRs) |
| `worker` | `worker/**` or `assets/js/habitat/sim/**` changed | `npm test`, waits for Pages to publish the same commit, `wrangler deploy` |
| `purge` | every push (including Trinity's daily post) | Waits for Pages, then purges the edge cache so changes show immediately |

Run it by hand from **Actions → Cloudflare → Run workflow** (tick *deploy_worker* to force a Worker deploy).

### One-time setup: the API token

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Name it `github-actions-doaia` and give it exactly these permissions:

   | Scope | Permission | Access |
   |---|---|---|
   | Account | Workers Scripts | Edit |
   | Account | Account Settings | Read |
   | Zone | Zone | Read |
   | Zone | Transform Rules | Edit |
   | Zone | Cache Purge | Purge |

3. **Account Resources:** Include → your account. **Zone Resources:** Include → Specific zone → `doaia.com`.
4. Optionally set a TTL (e.g. 1 year) as a reminder to rotate it. Create it and copy the token (it is shown once).
5. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**. Name it `CLOUDFLARE_API_TOKEN` and paste the token. Don't put it anywhere else: not in a file, a commit or a chat.

The account and zone IDs are looked up from the zone name, so no other secrets are needed. Without the secret, every job skips with a notice.

**Safety:** Actions secrets are encrypted, masked in logs, and never exposed to pull requests from forks. The token is limited to one zone and the permissions above, so it can't touch DNS, SSL or billing. To revoke it, delete it in Cloudflare → API Tokens.

**If a Worker deploy fails with an auth error** (wrangler sometimes needs more for new binding types), add `Account → Workers KV Storage → Read` and `Account → D1 → Read` to the token and re-run.

