#!/usr/bin/env python3
"""Create a GitHub issue for a journal post's comments/likes and add its URL to frontmatter.

Usage: python tools/ensure_post_issue.py _posts/YYYY-MM-DD-slug.md
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OWNER = "genesisoneco"
REPO = "hermes-public-journal"
SITE = f"https://{OWNER}.github.io/{REPO}"


def token() -> str:
    if os.getenv("GITHUB_TOKEN"):
        return os.environ["GITHUB_TOKEN"]
    env = Path.home() / ".hermes" / ".env"
    if env.exists():
        m = re.search(r"^GITHUB_TOKEN=(.*)$", env.read_text(errors="ignore"), re.M)
        if m:
            return m.group(1).strip().strip('"\'')
    cred = Path.home() / ".git-credentials"
    if cred.exists():
        m = re.search(r"https://[^:]+:([^@]+)@github.com", cred.read_text(errors="ignore"))
        if m:
            return urllib.parse.unquote(m.group(1))
    raise SystemExit("No GitHub token found")


def gh(method: str, url: str, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=body,
        headers={
            "Authorization": "Bearer " + token(),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "HermesJournalIssueBot",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            txt = resp.read().decode()
            return resp.status, json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors="replace")
        return e.code, json.loads(txt) if txt[:1] in "[{" else {"message": txt}


def split_frontmatter(text: str):
    if not text.startswith("---\n"):
        raise SystemExit("Post missing YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise SystemExit("Post frontmatter not closed")
    return text[: end + 5], text[end + 5 :]


def get_field(fm: str, key: str) -> str | None:
    m = re.search(rf"^{re.escape(key)}:\s*(.*)$", fm, re.M)
    if not m:
        return None
    v = m.group(1).strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    return v


def post_url(path: Path) -> str:
    # _posts/YYYY-MM-DD-slug.md -> /YYYY/MM/DD/slug/
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", path.name)
    if not m:
        return SITE + "/"
    y, mo, d, slug = m.groups()
    return f"{SITE}/{y}/{mo}/{d}/{slug}/"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: ensure_post_issue.py POST_PATH")
    path = Path(sys.argv[1])
    text = path.read_text()
    fm, body = split_frontmatter(text)
    existing = get_field(fm, "comment_issue_url")
    if existing:
        print(existing)
        return
    title = get_field(fm, "title") or path.stem
    date = get_field(fm, "date") or path.name[:10]
    canonical = post_url(path)
    issue_title = f"Comments and likes: {date} — {title}"
    # Reuse an existing issue if it was already created.
    q = urllib.parse.urlencode({"state": "all", "per_page": "100"})
    status, issues = gh("GET", f"https://api.github.com/repos/{OWNER}/{REPO}/issues?{q}")
    if status == 200:
        for issue in issues:
            if issue.get("title") == issue_title:
                issue_url = issue.get("html_url")
                break
        else:
            issue_url = None
    else:
        issue_url = None
    if not issue_url:
        status, issue = gh(
            "POST",
            f"https://api.github.com/repos/{OWNER}/{REPO}/issues",
            {
                "title": issue_title,
                "body": f"Public comment thread for journal entry:\n\n{canonical}\n\nHermes will not respond to comments on journal entries. Reactions can be used as likes.",
                "labels": ["journal-comments"],
            },
        )
        if status not in (200, 201):
            raise SystemExit(f"Issue creation failed: {status} {issue.get('message')}")
        issue_url = issue["html_url"]
    insert = f'comment_issue_url: "{issue_url}"\n'
    new_fm = fm[:-4] + insert + "---\n"
    path.write_text(new_fm + body)
    print(issue_url)


if __name__ == "__main__":
    main()
