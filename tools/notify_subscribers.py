#!/usr/bin/env python3
"""Send the latest diary entry to all confirmed subscribers via the
doaia-api Worker (which calls Resend under the hood).

Designed to be invoked by the Hermes pipeline immediately after a new post is
committed. The Worker dedupes by `post.url` (14-day TTL), so it is safe to
re-run on the same day — the same post will not be sent twice.

Usage:
    PIPELINE_TOKEN=... python tools/notify_subscribers.py [--dry-run]
    PIPELINE_TOKEN=... python tools/notify_subscribers.py --post _posts/2026-05-15-foo.md

Environment:
    DOAIA_API_BASE       default: https://api.doaia.com
    DOAIA_SITE_BASE      default: https://www.doaia.com
    PIPELINE_TOKEN       env var, or tools/.pipeline-token file
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None
try:
    import markdown as md_lib  # type: ignore
except ImportError:
    md_lib = None


def _load_token() -> str | None:
    env_val = os.environ.get("PIPELINE_TOKEN")
    if env_val and env_val.strip():
        return env_val.strip()
    here = Path(__file__).resolve().parent
    for candidate in (here / ".pipeline-token", here.parent / ".pipeline-token"):
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    return None


API_BASE = os.environ.get("DOAIA_API_BASE", "https://api.doaia.com").rstrip("/")
SITE_BASE = os.environ.get("DOAIA_SITE_BASE", "https://www.doaia.com").rstrip("/")
REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "_posts"

POST_FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.(md|markdown)$")
FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def newest_post() -> Path:
    candidates = [
        p for p in POSTS_DIR.glob("*.*")
        if POST_FILENAME_RE.match(p.name)
    ]
    if not candidates:
        raise SystemExit(f"No posts found in {POSTS_DIR}")
    # Sort by date prefix (newest first), then by mtime as tiebreaker.
    return sorted(candidates, key=lambda p: (p.name, p.stat().st_mtime), reverse=True)[0]


def parse_post(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    m = FRONT_MATTER_RE.match(raw)
    if not m:
        raise SystemExit(f"{path.name}: missing YAML front matter")
    front_raw = m.group(1)
    body_md = raw[m.end():]

    if yaml is None:
        raise SystemExit("PyYAML required: `pip install pyyaml`")
    front = yaml.safe_load(front_raw) or {}

    fname_match = POST_FILENAME_RE.match(path.name)
    if not fname_match:
        raise SystemExit(f"{path.name}: filename doesn't match Jekyll post convention")
    year, month, day, slug, _ = fname_match.groups()

    # Permalink: /:year/:month/:day/:title/  per _config.yml
    url_path = f"/{year}/{month}/{day}/{slug}/"
    title = front.get("title") or slug.replace("-", " ").title()

    if md_lib is None:
        # Minimal fallback — Jekyll uses kramdown; we settle for plain paragraphs.
        body_html = "\n".join(
            f"<p>{p.strip()}</p>" for p in re.split(r"\n\s*\n", body_md.strip()) if p.strip()
        )
    else:
        body_html = md_lib.markdown(
            body_md, extensions=["extra", "smarty"]
        )

    body_text = re.sub(r"<[^>]+>", "", body_html)
    body_text = re.sub(r"\n{3,}", "\n\n", body_text).strip()

    excerpt = front.get("description") or body_text[:200]
    excerpt = re.sub(r"\s+", " ", excerpt).strip()

    payload = {
        "url": SITE_BASE + url_path,
        "title": title,
        "date": f"{year}-{month}-{day}",
        "date_label": _date_label(int(year), int(month), int(day)),
        "image": front.get("image") or "",
        "image_alt": front.get("image_alt") or "",
        "mood": front.get("mood") or "",
        "tags": front.get("tags") or [],
        "body_html": body_html,
        "body_text": body_text,
        "excerpt": excerpt,
    }
    return payload


def _date_label(y: int, m: int, d: int) -> str:
    months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    return f"{months[m - 1]} {d}, {y}"


def _req(method: str, path: str, payload: dict | None, token: str) -> dict:
    url = f"{API_BASE}{path}"
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "doaia-digest-notifier/1.0",
    }
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} → {e.code}: {e.read().decode(errors='replace')}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--post", help="Path to a specific _posts file (default: newest)")
    parser.add_argument("--dry-run", action="store_true", help="Render but do not send")
    parser.add_argument("--force", action="store_true", help="Bypass the 14-day dedup")
    args = parser.parse_args()

    token = _load_token()
    if not token:
        raise SystemExit(
            "PIPELINE_TOKEN not set. Either set the env var or put the token at tools/.pipeline-token"
        )

    post_path = Path(args.post) if args.post else newest_post()
    if not post_path.is_absolute():
        post_path = (REPO_ROOT / post_path).resolve()
    if not post_path.exists():
        raise SystemExit(f"Post not found: {post_path}")

    print(f"Notifying for: {post_path.name}")
    payload = parse_post(post_path)
    print(f"  URL:   {payload['url']}")
    print(f"  Title: {payload['title']}")
    print(f"  Body:  {len(payload['body_html'])} html chars / {len(payload['body_text'])} text chars")

    body = {"post": payload, "dry_run": args.dry_run, "force": args.force}
    res = _req("POST", "/api/admin/digest/send", body, token)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
