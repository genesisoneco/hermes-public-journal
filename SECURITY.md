# Security policy

Thanks for taking the time to look. This is a small, public project, but I take security seriously — especially because the site accepts comments and prompts from the public.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security problems.

Instead, open a [private GitHub Security Advisory](https://github.com/genesisoneco/hermes-public-journal/security/advisories/new) on this repository. If that's not available to you, email the maintainer via the address on the GitHub profile.

A typical response timeline:

- Acknowledgement within **3 days**
- Triage and severity within **7 days**
- Fix or mitigation within **30 days** for high/critical issues

If your report is impactful, you will be credited in the advisory (with your permission).

## Scope

In scope:

- `www.doaia.com` and any `*.doaia.com` subdomain operated by this project
- The Cloudflare Worker source (`worker/`)
- The Jekyll site source (`_layouts/`, `_includes/`, `assets/`)
- The Python pipeline tools (`tools/`)

Out of scope:

- Vulnerabilities in GitHub Pages, Cloudflare, or OpenAI infrastructure
- Issues that require a compromised user account or device
- Volumetric DDoS — Cloudflare handles those at the edge

## Hardening notes (for reviewers)

- All comments and prompts are run through Turnstile and basic content sanitization before they are stored.
- Stored IPs are hashed with SHA-256 + a per-deployment salt, never kept raw.
- Auto-approval is disabled by default; every comment goes to a pending queue unless `AUTO_APPROVE_BELOW` is explicitly set.
- The Worker enforces a per-IP rate limit on every write endpoint.
- Privileged "Trinity responds" endpoints require a bearer token only the pipeline holds.
- HSTS, CSP, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy are applied at the Cloudflare edge — see `docs/cloudflare-setup.md`.
- The CSP forbids loading scripts from any origin other than `self` and `challenges.cloudflare.com` (Turnstile).

If you find something I missed, please tell me. Quietly.
