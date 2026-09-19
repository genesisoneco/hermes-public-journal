"""Shared helpers for the Trinity sprite pipeline."""
import json, os, glob
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT = os.path.join(ROOT, "out")
ATLAS_DIR = os.path.join(REPO, "assets", "habitat", "atlas")
BIN = os.path.join(ROOT, "bin")


def load_manifest(path=None):
    with open(path or os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        man = json.load(f)
    force_grid = os.environ.get("SPRITES_LAYOUT") == "grid"
    for row in man["rows"]:
        sh = man["sheets"][str(row["sheet"])]
        if force_grid or sh.get("layout") == "grid" or row.get("layout") == "grid":
            # grid sheets (see REGEN_SPEC.md): fixed cells, one anim per row
            cw, ch = sh.get("cell", [256, 256])
            row["layout"] = "grid"
            row["cell"] = [cw, ch]
            if "rect" not in row:
                r = row["row"]
                row["rect"] = [0, r * ch, row["frames"] * cw, ch]
            row.setdefault("facing", [sh.get("facing", "F")] * row["frames"])
    return man


def sheet_path(man, sheet_id):
    s = man["sheets"][str(sheet_id)]
    p = s["path"]
    if not os.path.isabs(p):
        p = os.path.normpath(os.path.join(ROOT, p))
    return p


def chroma_key_green(rgba, lo=30, hi=110):
    """Solid #00FF00 background -> alpha (REGEN_SPEC sheets). Green dominance
    d = G - max(R, B): d<=lo opaque, d>=hi transparent; green spill clamped."""
    rgb = rgba[..., :3].astype(np.int32)
    d = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    a = np.clip((hi - d) / float(hi - lo), 0, 1)
    out = rgba.copy()
    out[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2])).astype(np.uint8)
    out[..., 3] = (a * 255 + 0.5).astype(np.uint8)
    return out


def load_sheet(man, sheet_id):
    im = load_rgba(sheet_path(man, sheet_id))
    key = man["sheets"][str(sheet_id)].get("key")
    if key and key.lower() in ("#00ff00", "green"):
        im = chroma_key_green(im)
    return im


def load_rgba(path):
    return np.array(Image.open(path).convert("RGBA"))


def save_rgba(arr, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr.astype(np.uint8), "RGBA").save(path)


def magenta_mask(rgb):
    """Halo magenta: G near zero while R and B are both strong.
    Body pink keeps G >= ~64; dark pink shading (~192,32,96) has B << R."""
    r = rgb[..., 0].astype(np.int32); g = rgb[..., 1].astype(np.int32); b = rgb[..., 2].astype(np.int32)
    return (g < 40) & (r > 110) & (b > 0.55 * r) & (g < 0.25 * np.minimum(r, b) + 8)


def halo_mask(rgb):
    """Stricter test used for the QA fringe metric: bright halo magenta only
    (dark pink shading and purple glyphs are legit art)."""
    r = rgb[..., 0].astype(np.int32); g = rgb[..., 1].astype(np.int32); b = rgb[..., 2].astype(np.int32)
    return (g < 40) & (r > 185) & (b > 0.6 * r) & (b <= 1.15 * r)


def ensure(d):
    os.makedirs(d, exist_ok=True)
    return d
