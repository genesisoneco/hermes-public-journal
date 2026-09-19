"""Step 1: clean each manifest row crop.

 - solid mode: body mask = alpha >= SOLID_A and not halo-magenta, closed,
   hole-filled and opened; interior alpha forced to 255, 1px erode + 0.8 sigma
   feather; edge-band magenta spill replaced from the interior (nearest good
   pixel + cv2.inpaint); RGB alpha-bled into every transparent pixel.
 - glow mode: same body treatment, plus the original soft alpha kept for the
   non-magenta glow (beams, rings, jets). Halo magenta only lives at alpha<30.
 - skip mode: row ignored.

Writes out/clean/<row id>.png and out/clean/report.json (edge fringe %).
"""
import argparse, json
import numpy as np, cv2
from common import *

SOLID_A = 150
FRINGE_FAIL = 0.005


def loose_magenta(rgb):
    r = rgb[..., 0].astype(np.int32); g = rgb[..., 1].astype(np.int32); b = rgb[..., 2].astype(np.int32)
    return (r > 100) & (b > 0.5 * r) & (g < 0.3 * np.minimum(r, b))


def fill_holes(m):
    m8 = m.astype(np.uint8) * 255
    h, w = m8.shape
    pad = cv2.copyMakeBorder(m8, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = pad.copy()
    mask = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 255)
    holes = cv2.bitwise_not(ff)[1:-1, 1:-1]
    return (m8 | holes) > 0


def drop_small(m, min_area):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros(n, bool)
    keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[lab]


def nearest_fill(rgb, good):
    """Every pixel takes the colour of the nearest `good` pixel (alpha bleed)."""
    if good.all() or not good.any():
        return rgb.copy()
    src = np.where(good, 0, 255).astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(good)  # row-major order == label order
    lut = rgb[ys, xs]
    out = lut[np.clip(labels - 1, 0, len(lut) - 1)]
    out[good] = rgb[good]
    return out


def clean(rgba, mode, min_area=20):
    rgb = rgba[..., :3].copy()
    a = rgba[..., 3]
    mag = magenta_mask(rgb)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    core = ((a >= SOLID_A) & ~mag).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, k3, iterations=2)
    core = fill_holes(core > 0).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_OPEN, k3)
    core = drop_small(core > 0, min_area)

    er = cv2.erode(core.astype(np.uint8), k3) > 0
    alpha = cv2.GaussianBlur(er.astype(np.float32), (0, 0), 0.8)
    inner = cv2.erode(core.astype(np.uint8), k5) > 0
    alpha[inner] = 1.0

    if mode == "glow":
        g = a.astype(np.float32) / 255.0
        # soft knee instead of a hard cut: the halo lives at alpha < 30, a
        # hard threshold draws a visible contour around the glow
        g *= np.clip((a.astype(np.float32) - 8) / 40.0, 0, 1)
        g[(a < 30) & magenta_mask(rgb)] *= 0.35
        # glow must not resurrect the magenta halo hugging the body
        near = cv2.dilate(core.astype(np.uint8), k5, iterations=2) > 0
        g[near & ~core & loose_magenta(rgb)] = 0
        alpha = np.maximum(alpha, g)

    # colour: edge band spill -> nearest interior, then inpaint smoothing
    band = core & ~inner
    bad = band & loose_magenta(rgb)
    good = (core & ~bad) if mode != "glow" else ((alpha > 0.1) & ~loose_magenta(rgb)) | (core & ~bad)
    if mode == "glow":
        good &= ~(a < 30)
        good |= core & ~bad
    filled = nearest_fill(rgb, good)
    if bad.any():
        filled = cv2.inpaint(np.ascontiguousarray(filled), bad.astype(np.uint8), 2, cv2.INPAINT_TELEA)
    a8 = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    out = np.dstack([filled, a8])
    return out, core


def fringe_fraction(rgba):
    a = rgba[..., 3]
    vis = a > 8
    edge = vis & ~(cv2.erode(vis.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
    edge |= (a > 8) & (a < 250)
    n = int(edge.sum())
    if n == 0:
        return 0.0
    return float((halo_mask(rgba[..., :3]) & edge).sum()) / n


def row_crop(src, row):
    x, y, w, h = row["rect"]
    crop = src[y:y + h, x:x + w].copy()
    for lr in row.get("labelRect", []) or []:
        lx, ly, lw, lh = lr
        crop[max(0, ly - y):max(0, ly - y + lh), max(0, lx - x):max(0, lx - x + lw)] = 0
    return crop


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); ap.add_argument("--row"); a = ap.parse_args()
    man = load_manifest()
    outd = ensure(os.path.join(OUT, "clean"))
    rep_path = os.path.join(outd, "report.json")
    report = json.load(open(rep_path)) if os.path.exists(rep_path) else {}
    cache = {}
    for row in man["rows"]:
        if row.get("mode") == "skip": continue
        if a.only and str(row["sheet"]) != a.only: continue
        if a.row and row["id"] != a.row: continue
        sid = str(row["sheet"])
        if sid not in cache: cache[sid] = load_sheet(man, sid)
        crop = row_crop(cache[sid], row)
        out, _ = clean(crop, row.get("mode", "solid"))
        save_rgba(out, os.path.join(outd, row["id"] + ".png"))
        report[row["id"]] = round(fringe_fraction(out), 5)
    json.dump(report, open(rep_path, "w"), indent=1)
    worst = sorted(report.items(), key=lambda kv: -kv[1])[:5]
    print("clean: rows", len(report), "worst fringe", worst)


if __name__ == "__main__":
    main()
