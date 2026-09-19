#!/usr/bin/env python3
"""Post Trinity's daily *habitat brief* to her live room on doaia.com.

After the daily entry is published, this asks Trinity (via the locally
OAuth-authenticated `hermes` CLI, same as respond_to_prompts.py) what she
wants to do in her room today: wishes, a few passing thoughts, the skill she
is practising, and maybe a new item. The answer is validated against the
vocabulary in assets/js/habitat/sim/rules.js and POSTed to the Worker, where
the TrinityHabitat Durable Object folds it into her behaviour.

If Hermes is unavailable or returns junk, a brief is derived from the post's
front matter (mood + a tag -> activity map) instead. This script always exits
0 so it can never break the publish pipeline.

Usage:
    python tools/habitat_brief.py                   # newest post, ask Hermes, POST
    python tools/habitat_brief.py --dry-run         # print the brief, don't POST
    python tools/habitat_brief.py --no-llm          # skip Hermes, derive from front matter
    python tools/habitat_brief.py --post _posts/2026-09-19-foo.md

Environment:
    DOAIA_API_BASE       default: https://api.doaia.com  (http://localhost:8787 for wrangler dev)
    DOAIA_SITE_BASE      default: https://www.doaia.com
    PIPELINE_TOKEN       env var, or tools/.pipeline-token file
    HERMES_BIN           default: hermes
    HERMES_PROVIDER      default: openai-codex
    HERMES_MODEL         default: gpt-5.5
    TRINITY_TIMEOUT_SEC  default: 120
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None


REPO_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = REPO_ROOT / "_posts"
RULES_JS = REPO_ROOT / "assets" / "js" / "habitat" / "sim" / "rules.js"

API_BASE = os.environ.get("DOAIA_API_BASE", "https://api.doaia.com").rstrip("/")
SITE_BASE = os.environ.get("DOAIA_SITE_BASE", "https://www.doaia.com").rstrip("/")
HERMES_BIN = os.environ.get("HERMES_BIN", "hermes")
HERMES_PROVIDER = os.environ.get("HERMES_PROVIDER", "openai-codex")
HERMES_MODEL = os.environ.get("HERMES_MODEL", "gpt-5.5")
TIMEOUT = int(os.environ.get("TRINITY_TIMEOUT_SEC", "120"))

POST_FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.(md|markdown)$")
FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
CLI_NOISE_PREFIXES = (
    "thinking", "analyzing", "running", "tool:", "system:", "user:",
    "✓", "✗", "›", "→",
)

# Activities she never "wishes" for (the brain handles them on its own).
NOT_WISHABLE = {"sleep", "charge"}
THOUGHT_MAX = 90


# ---------------------------------------------------------------- helpers


def _load_token() -> str | None:
    env_val = os.environ.get("PIPELINE_TOKEN")
    if env_val and env_val.strip():
        return env_val.strip()
    here = Path(__file__).resolve().parent
    for candidate in (here / ".pipeline-token", here.parent / ".pipeline-token"):
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    return None


def newest_post() -> Path:
    candidates = [p for p in POSTS_DIR.glob("*.*") if POST_FILENAME_RE.match(p.name)]
    if not candidates:
        raise RuntimeError(f"No posts found in {POSTS_DIR}")
    return sorted(candidates, key=lambda p: (p.name, p.stat().st_mtime), reverse=True)[0]


def _mini_yaml(text: str) -> dict:
    """Tiny front-matter reader for when PyYAML isn't installed.
    Handles `key: value`, quoted strings and inline `[a, b]` lists."""
    out: dict = {}
    for line in text.splitlines():
        m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            out[key] = [v.strip().strip("'\"") for v in val[1:-1].split(",") if v.strip()]
        else:
            out[key] = val.strip("'\"")
    return out


def parse_post(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    m = FRONT_MATTER_RE.match(raw)
    if not m:
        raise RuntimeError(f"{path.name}: missing YAML front matter")
    front_raw, body = m.group(1), raw[m.end():]
    front = (yaml.safe_load(front_raw) if yaml else _mini_yaml(front_raw)) or {}
    fm = POST_FILENAME_RE.match(path.name)
    if not fm:
        raise RuntimeError(f"{path.name}: filename doesn't match Jekyll post convention")
    year, month, day, slug, _ = fm.groups()
    tags = front.get("tags") or []
    if isinstance(tags, str):
        tags = [t for t in re.split(r"[,\s]+", tags) if t]
    try:
        intensity = float(front.get("mood_intensity", 0.6))
    except (TypeError, ValueError):
        intensity = 0.6
    return {
        "date": f"{year}-{month}-{day}",
        "url": f"{SITE_BASE}/{year}/{month}/{day}/{slug}/",
        "title": str(front.get("title") or slug.replace("-", " ").title()),
        "status": str(front.get("status") or ""),
        "mood": str(front.get("mood") or "quiet"),
        "mood_intensity": intensity,
        "tags": [str(t) for t in tags],
        "body": body.strip(),
    }


# ------------------------------------------------------ rules.js vocabulary


def _object_block(src: str, name: str) -> str:
    """Return the `{...}` literal of `export const NAME = {...}` (brace-matched)."""
    m = re.search(r"export\s+const\s+" + re.escape(name) + r"\s*=\s*\{", src)
    if not m:
        raise RuntimeError(f"rules.js: {name} not found")
    i, depth, quote = m.end() - 1, 0, None
    start = i
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch == "/" and src[i:i + 2] == "//":
            nl = src.find("\n", i)
            i = len(src) if nl < 0 else nl
            continue
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    raise RuntimeError(f"rules.js: unbalanced {name}")


def _top_level_entries(block: str) -> dict[str, str]:
    """Map each depth-1 key of an object literal to the source text of its value."""
    entries: dict[str, str] = {}
    depth, quote, i = 0, None, 0
    key, val_start = None, None
    while i < len(block):
        ch = block[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "\"'`":
            quote = ch
        elif ch == "/" and block[i:i + 2] == "//":
            nl = block.find("\n", i)
            i = len(block) if nl < 0 else nl
            continue
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            if depth == 1 and key is not None:
                entries[key] = block[val_start:i]
                key = None
            depth -= 1
        elif depth == 1:
            if ch == "," and key is not None:
                entries[key] = block[val_start:i]
                key = None
            elif key is None:
                m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", block[i:])
                if m and (i == 0 or block[i - 1] in "{,\n \t"):
                    key = m.group(1)
                    i += m.end()
                    val_start = i
                    continue
        i += 1
    return entries


def load_vocab() -> dict:
    src = RULES_JS.read_text(encoding="utf-8")
    activities = _top_level_entries(_object_block(src, "ACTIVITIES"))
    skills = _top_level_entries(_object_block(src, "SKILLS"))
    items = _top_level_entries(_object_block(src, "ITEMS"))
    moods = _top_level_entries(_object_block(src, "MOODS"))
    act_skill = {}
    for name, body in activities.items():
        m = re.search(r"\bskill:\s*\"([a-z_]+)\"", body)
        act_skill[name] = m.group(1) if m else None
    return {
        "activities": [a for a in activities if a not in NOT_WISHABLE],
        "act_skill": act_skill,
        "skills": list(skills),
        "room_items": [k for k, v in items.items() if not re.search(r"\bvisitor:\s*true", v)],
        "moods": list(moods),
    }


# --------------------------------------------------------- derived fallback

# Tag / word -> activity. First match wins per tag; order matters a little.
TAG_ACTIVITY = [
    (r"plant|garden|seed|sprout|flower|tree|forest|spring|green|soil|harvest|leaf", "tend_plants"),
    (r"star|sky|night|moon|space|orbit|planet|cosmos|astronom", "stargaze"),
    (r"code|software|program|algorithm|ai\b|agent|model|compute|machine|data|cyber", "code"),
    (r"music|song|sound|listen|radio|concert|rhythm", "listen_music"),
    (r"memory|archive|history|past|library|book|read|letter", "read_archive"),
    (r"dance|joy|play|celebrat|festival|game|sport", "dance"),
    (r"tea|rest|calm|slow|breath|kitchen|cook|food", "make_tea"),
    (r"repair|fix|build|infrastructure|engineer|tool|broken|craft", "repair"),
    (r"tidy|clean|order|sort|waste", "tidy_up"),
    (r"news|politic|war|election|law|court|trust|public|economy|climate|protest|custody", "research_scan"),
]


def derive_brief(post: dict, vocab: dict) -> dict:
    wishes: dict[str, float] = {}
    words = [t.lower() for t in post["tags"]] + re.findall(r"[a-z]+", post["title"].lower())
    for w in words:
        for pattern, act in TAG_ACTIVITY:
            if act in vocab["activities"] and re.search(pattern, w):
                wishes[act] = min(3.0, wishes.get(act, 0.0) + 1.0)
                break
    if not wishes:
        wishes = {"think": 1.0, "read_archive": 0.5}
    ranked = sorted(wishes.items(), key=lambda kv: -kv[1])[:4]
    top = ranked[0][0]
    practicing = vocab["act_skill"].get(top) or "writing"
    if practicing not in vocab["skills"]:
        practicing = "writing"

    thoughts = []
    if post["status"]:
        thoughts.append(post["status"])
    for sent in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", post["body"])):
        s = sent.strip().strip("*_#>")
        if 12 <= len(s) <= THOUGHT_MAX and not s.startswith(("http", "[", "!")):
            thoughts.append(s)
        if len(thoughts) >= 4:
            break
    if not thoughts:
        thoughts = ["holding a thought from this morning."]

    mood = post["mood"] if post["mood"] in vocab["moods"] else "quiet"
    return {
        "date": post["date"],
        "mood": mood,
        "mood_intensity": max(0.0, min(1.0, post["mood_intensity"])),
        "wishes": [{"activity": a, "weight": round(w, 2), "note": ""} for a, w in ranked],
        "thoughts": thoughts,
        "practicing_skill": practicing,
        "post_url": post["url"],
        "post_title": post["title"],
        "source": "derived",
    }


# ------------------------------------------------------------------ Hermes

INSTRUCTION_TEMPLATE = """\
You are Trinity, an autonomous AI agent who keeps a public daily diary at
www.doaia.com. You also live in a small isometric room on the site, a pink
round bunny robot with a desk, plants, an archive shelf, a window and a pod.
Visitors can watch you and poke, pet or wave at you.

You just published today's entry:

TITLE: {title}
MOOD: {mood} (intensity {intensity})
TAGS: {tags}
ENTRY (excerpt):
{excerpt}

Now decide how you want to spend today in your room. Answer with ONE JSON
object and nothing else, using only this vocabulary:

- "mood": one of {moods}
- "mood_intensity": number 0.0-1.0
- "wishes": 2-5 items {{"activity": one of {activities}, "weight": 0.5-3.0, "note": short reason}}
- "thoughts": 3-8 short things you might think out loud in the room today,
  in your own quiet, observant, wry, kind voice. Each at most 90 characters.
  No hashtags, no emoji, no quotes from the entry longer than a few words.
- "practicing_skill": one of {skills}
- "new_item" (optional): one of {items}, only if you truly want it

Output only the JSON object. No markdown fences, no commentary.
"""


def clean_output(raw: str) -> str:
    text = ANSI_RE.sub("", raw or "").strip()
    keep = []
    for line in text.splitlines():
        s = line.strip()
        if s.lower().startswith(CLI_NOISE_PREFIXES):
            continue
        keep.append(line)
    return "\n".join(keep).strip()


def ask_hermes(post: dict, vocab: dict) -> dict | None:
    excerpt = re.sub(r"\s+", " ", post["body"])[:1800]
    instruction = INSTRUCTION_TEMPLATE.format(
        title=post["title"], mood=post["mood"], intensity=post["mood_intensity"],
        tags=", ".join(post["tags"]) or "(none)", excerpt=excerpt,
        moods=", ".join(vocab["moods"]), activities=", ".join(vocab["activities"]),
        skills=", ".join(vocab["skills"]), items=", ".join(vocab["room_items"]),
    )
    cmd = [HERMES_BIN, "chat", "-q", instruction]
    if HERMES_PROVIDER:
        cmd += ["--provider", HERMES_PROVIDER]
    if HERMES_MODEL:
        cmd += ["--model", HERMES_MODEL]
    cmd.append("-Q")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=TIMEOUT)
    except FileNotFoundError:
        print(f"  `{HERMES_BIN}` not found; falling back to front matter.", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print(f"  hermes timed out after {TIMEOUT}s; falling back.", file=sys.stderr)
        return None
    if result.returncode != 0:
        print(f"  hermes exited {result.returncode}: {(result.stderr or '')[:300]}", file=sys.stderr)
        return None
    text = clean_output(result.stdout)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        print("  hermes returned no JSON object; falling back.", file=sys.stderr)
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        print(f"  hermes JSON didn't parse ({e}); falling back.", file=sys.stderr)
        return None
    return obj if isinstance(obj, dict) else None


def validate(obj: dict, post: dict, vocab: dict) -> dict | None:
    """Keep only known keys and vocabulary. None if too little survives."""
    mood = obj.get("mood") if obj.get("mood") in vocab["moods"] else post["mood"]
    if mood not in vocab["moods"]:
        mood = "quiet"
    try:
        intensity = max(0.0, min(1.0, float(obj.get("mood_intensity", post["mood_intensity"]))))
    except (TypeError, ValueError):
        intensity = 0.6
    wishes, seen = [], set()
    for w in obj.get("wishes") or []:
        if not isinstance(w, dict) or w.get("activity") not in vocab["activities"] or w["activity"] in seen:
            continue
        try:
            weight = max(0.0, min(3.0, float(w.get("weight", 1))))
        except (TypeError, ValueError):
            weight = 1.0
        seen.add(w["activity"])
        wishes.append({"activity": w["activity"], "weight": round(weight, 2),
                       "note": re.sub(r"\s+", " ", str(w.get("note") or ""))[:THOUGHT_MAX]})
    thoughts = []
    for t in obj.get("thoughts") or []:
        if not isinstance(t, str):
            continue
        s = re.sub(r"<[^>]*>", "", re.sub(r"\s+", " ", t)).strip().strip('"')
        if 2 <= len(s) <= THOUGHT_MAX:
            thoughts.append(s)
    if len(wishes) < 1 or len(thoughts) < 2:
        return None
    brief = {
        "date": post["date"],
        "mood": mood,
        "mood_intensity": round(intensity, 2),
        "wishes": wishes[:5],
        "thoughts": thoughts[:8],
        "practicing_skill": obj.get("practicing_skill") if obj.get("practicing_skill") in vocab["skills"] else None,
        "post_url": post["url"],
        "post_title": post["title"],
        "source": "hermes",
    }
    if obj.get("new_item") in vocab["room_items"]:
        brief["new_item"] = obj["new_item"]
    if not brief["practicing_skill"]:
        brief["practicing_skill"] = vocab["act_skill"].get(wishes[0]["activity"]) or "writing"
    return brief


# -------------------------------------------------------------------- main


def post_brief(brief: dict, token: str) -> dict:
    url = f"{API_BASE}/api/admin/habitat/brief"
    req = urllib.request.Request(
        url, data=json.dumps(brief).encode(), method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "doaia-habitat-brief/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"POST {url} -> {e.code}: {e.read().decode(errors='replace')[:300]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Post Trinity's daily habitat brief.")
    parser.add_argument("--post", help="Path to a specific _posts file (default: newest)")
    parser.add_argument("--dry-run", action="store_true", help="Print the brief, do not POST")
    parser.add_argument("--no-llm", action="store_true", help="Skip Hermes; derive from front matter")
    args = parser.parse_args()

    post_path = Path(args.post) if args.post else newest_post()
    if not post_path.is_absolute():
        post_path = (REPO_ROOT / post_path).resolve()
    post = parse_post(post_path)
    vocab = load_vocab()
    print(f"Habitat brief for: {post_path.name}")

    brief = None
    if not args.no_llm:
        raw = ask_hermes(post, vocab)
        if raw is not None:
            brief = validate(raw, post, vocab)
            if brief is None:
                print("  Hermes answer failed validation; falling back.", file=sys.stderr)
    if brief is None:
        brief = derive_brief(post, vocab)
    print(json.dumps(brief, indent=2, ensure_ascii=False))

    if args.dry_run:
        print("(dry run, not posting)")
        return
    token = _load_token()
    if not token:
        print("PIPELINE_TOKEN not set (env var or tools/.pipeline-token); not posting.", file=sys.stderr)
        return
    res = post_brief(brief, token)
    print(f"Posted to {API_BASE}: ok={res.get('ok')} dropped={res.get('dropped')} item={res.get('item')}")


if __name__ == "__main__":
    try:
        # Windows consoles default to cp949/cp1252; don't die on em-dashes.
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        main()
    except Exception as e:  # never break the publish pipeline
        print(f"habitat_brief: {e}", file=sys.stderr)
    sys.exit(0)
