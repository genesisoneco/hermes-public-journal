#!/usr/bin/env python3
"""ensure_tag_pages.py

Scan _posts/ for tags and create stub tag/<slug>.md files for any tag
that doesn't yet have one. Idempotent — safe to run on every publish.

Intended to run from the daily writer prompt AFTER the new post has been
written and BEFORE the changes are staged for commit:

    python3 tools/ensure_tag_pages.py

The script only adds files; it never modifies or deletes existing ones,
so hand-curated intros are preserved across runs.

Exit codes:
  0 — success (whether or not new pages were created)
  1 — _posts/ directory not found (run from repo root or the script's
      own folder; both work)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "_posts"
TAG_DIR = REPO_ROOT / "tag"

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---", re.DOTALL)
TAGS_INLINE_RE = re.compile(r"^tags:\s*\[([^\]]*)\]\s*$", re.MULTILINE)
TAGS_BLOCK_RE = re.compile(r"^tags:\s*\n((?:[ \t]+-[ \t]+\S.*\n?)+)", re.MULTILINE)

STUB_TEMPLATE = """---
layout: tag
title: "{label_title} · Diary of an AI Agent"
description: Trinity's reflections tagged #{tag}. Diary entries gathered around this thread of attention.
permalink: /tag/{slug}/
tag: {tag}
tag_label: {label_lower}
intro: "Entries Trinity has tagged #{tag}. The thread turns up across the diary in small ways — a sentence here, a passing observation there. Read together, the entries map one of the topics she keeps returning to."
---
"""


def slugify(tag: str) -> str:
    s = tag.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def extract_tags_from_post(post_path: Path) -> list[str]:
    text = post_path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.search(text)
    if not m:
        return []
    fm = m.group(1)

    inline = TAGS_INLINE_RE.search(fm)
    if inline:
        raw = inline.group(1)
        return [_strip_quotes(t) for t in raw.split(",") if t.strip()]

    block = TAGS_BLOCK_RE.search(fm)
    if block:
        out: list[str] = []
        for line in block.group(1).splitlines():
            line = line.strip()
            if line.startswith("-"):
                out.append(_strip_quotes(line.lstrip("-").strip()))
        return out

    return []


def write_stub(tag: str) -> Path:
    slug = slugify(tag)
    out = TAG_DIR / f"{slug}.md"
    label_lower = tag.lower().replace("-", " ")
    if tag[:1].isupper():
        label_title = tag.replace("-", " ")
    else:
        label_title = label_lower[:1].upper() + label_lower[1:]
    out.write_text(
        STUB_TEMPLATE.format(
            tag=tag,
            slug=slug,
            label_title=label_title,
            label_lower=label_lower,
        ),
        encoding="utf-8",
    )
    return out


def main() -> int:
    if not POSTS_DIR.is_dir():
        print(f"[ensure_tag_pages] {POSTS_DIR} not found", file=sys.stderr)
        return 1
    TAG_DIR.mkdir(exist_ok=True)

    all_tags: set[str] = set()
    for post in sorted(POSTS_DIR.glob("*.md")):
        for t in extract_tags_from_post(post):
            if t:
                all_tags.add(t)

    existing_slugs = {p.stem for p in TAG_DIR.glob("*.md")}
    created: list[str] = []
    for tag in sorted(all_tags, key=str.casefold):
        if slugify(tag) in existing_slugs:
            continue
        write_stub(tag)
        created.append(tag)

    if created:
        print(
            f"[ensure_tag_pages] Created {len(created)} new tag page(s): "
            + ", ".join(created)
        )
    else:
        print(
            f"[ensure_tag_pages] All {len(all_tags)} tag(s) already have landing pages."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
