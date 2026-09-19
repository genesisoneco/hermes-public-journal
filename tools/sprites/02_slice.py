"""Step 2: slice every cleaned row into exactly N frames.

Cut positions: manifest "cuts" (sheet x) if given; otherwise gap segments of
the column projection, merged/split until there are N. Where two frames touch
(no empty column between them) the split is a DP min-cost vertical seam
through the alpha, searched near the expected position. Separate glyphs
(?, !, zZ, notes, hearts) stay with the frame whose column they sit in. Tiny
specks and label slivers touching the rect border are dropped.

Writes out/frames/<row>_<k>.png (tight crop + 2px margin) and
out/frames/index.json with each frame's sheet-space box, baseline and
fringe metric. `--layout grid` rows are cut on the fixed cell grid instead.
"""
import argparse, json
import numpy as np, cv2
from common import *

SPECK = 25          # px (source res)
MARGIN = 2


def components(alpha, thr=40):
    m = (alpha > thr).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    return n, lab, st


def clean_specks(rgba):
    a = rgba[..., 3]
    H, W = a.shape
    n, lab, st = components(a, 8)
    kill = np.zeros(n, bool)
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if ar < SPECK:
            kill[i] = True
        # label-pill slivers entering from the rect's top/bottom edge
        if (y == 0 or y + h >= H) and h <= 14 and w > 30:
            kill[i] = True
    out = rgba.copy()
    out[kill[lab]] = 0
    return out


def seam(alpha, x0, x1):
    """Min-cost top->bottom seam within columns [x0, x1). Returns x per row."""
    H = alpha.shape[0]
    x0 = max(0, x0); x1 = min(alpha.shape[1], x1)
    cost = alpha[:, x0:x1].astype(np.float32) / 255.0 + 0.002
    W = cost.shape[1]
    acc = cost.copy()
    back = np.zeros((H, W), np.int8)
    for y in range(1, H):
        prev = acc[y - 1]
        l = np.r_[np.inf, prev[:-1]]; r = np.r_[prev[1:], np.inf]
        stack = np.vstack([l, prev, r])
        k = stack.argmin(0)
        acc[y] += stack[k, np.arange(W)]
        back[y] = k - 1
    xs = np.zeros(H, np.int32)
    xs[-1] = int(acc[-1].argmin())
    for y in range(H - 1, 0, -1):
        xs[y - 1] = xs[y] + back[y, xs[y]]
    return xs + x0


def segments_from_projection(alpha, n):
    """Column runs separated by empty columns, merged/split to reach n."""
    proj = (alpha > 40).sum(0)
    occ = proj > 0
    segs = []
    x = 0; W = len(proj)
    while x < W:
        if occ[x]:
            s = x
            while x < W and occ[x]: x += 1
            segs.append([s, x])
        else:
            x += 1
    if not segs:
        return []
    # merge narrow glyph-only segments into the nearest neighbour while too many
    while len(segs) > n:
        widths = [b - a for a, b in segs]
        i = int(np.argmin(widths))
        if i == 0: j = 1
        elif i == len(segs) - 1: j = i - 1
        else:
            gl = segs[i][0] - segs[i - 1][1]; gr = segs[i + 1][0] - segs[i][1]
            j = i - 1 if gl <= gr else i + 1
        a_, b_ = min(i, j), max(i, j)
        segs[a_] = [segs[a_][0], segs[b_][1]]
        del segs[b_]
    return segs


def cut_row(rgba, n, cuts=None):
    """Return list of per-frame boolean column masks (H x W) for n frames."""
    a = rgba[..., 3]
    H, W = a.shape
    bounds = []  # list of seam arrays between frames
    if cuts:
        for c in cuts:
            bounds.append(seam(a, c - 12, c + 12))
    else:
        segs = [{"s": s, "e": e, "seam": None} for s, e in segments_from_projection(a, n)]
        # split the widest segments with DP seams while too few
        while len(segs) < n:
            widths = [g["e"] - g["s"] for g in segs]
            i = int(np.argmax(widths))
            s, e = segs[i]["s"], segs[i]["e"]
            exp = W / n
            parts = max(2, int(round((e - s) / exp)))
            parts = min(parts, n - len(segs) + 1)
            step = (e - s) / parts
            mid = s + step
            xs = seam(a, int(mid - 0.3 * step), int(mid + 0.3 * step))
            c = int(np.median(xs))
            segs[i:i + 1] = [{"s": s, "e": c, "seam": xs}, {"s": c, "e": e, "seam": segs[i]["seam"]}]
        for k in range(len(segs) - 1):
            if segs[k]["seam"] is not None:
                bounds.append(segs[k]["seam"])
            else:
                c = (segs[k]["e"] + segs[k + 1]["s"]) // 2
                bounds.append(np.full(H, c, np.int32))
    cols = np.arange(W)[None, :]
    masks = []
    left = np.full(H, -1, np.int32)
    for k in range(n):
        right = bounds[k] if k < len(bounds) else np.full(H, W, np.int32)
        masks.append((cols > left[:, None]) & (cols <= right[:, None]) if k else (cols <= right[:, None]))
        left = right
    return refine_watershed(rgba, masks, bounds)


def refine_watershed(rgba, masks, bounds, band=6):
    """Seams cut straight through overlapping headphones. Near each seam,
    re-assign opaque pixels with a colour watershed seeded from each frame's
    own body (pixels farther than `band` from the seam), so the neighbour's
    headphone tip goes back to its owner along the drawn outline."""
    a = rgba[..., 3]
    H, W = a.shape
    if not bounds:
        return masks
    cols = np.arange(W)[None, :]
    solid = a > 40
    near = np.zeros((H, W), bool)
    for b in bounds:
        if solid[np.arange(H), np.clip(b, 0, W - 1)].any():   # frames touch here
            near |= np.abs(cols - b[:, None]) <= band
    if not (near & solid).any():
        return masks
    markers = np.zeros((H, W), np.int32)
    for k, m in enumerate(masks):
        markers[m & solid & ~near] = k + 1
    markers[~solid] = len(masks) + 1
    bgr = cv2.cvtColor(np.ascontiguousarray(rgba[..., :3]), cv2.COLOR_RGB2BGR)
    bgr = cv2.GaussianBlur(bgr, (3, 3), 0)
    bgr[~solid] = 0          # background is a hard edge: floods last
    ws = cv2.watershed(bgr, markers.copy())
    out = []
    for k, m in enumerate(masks):
        own = (ws == k + 1) & solid
        # unresolved ridge / background-claimed solid px fall back to the seam split
        rest = ((ws == -1) | (ws == len(masks) + 1)) & solid & m
        out.append((m & ~solid) | own | rest)
    return out


def trim_seam_wedges(crop, cut_edge, reach=10):
    """Where a seam cut through touching frames, the neighbour's headphone tip
    survives as a thin wedge glued to the body. Morphological opening detaches
    it; only pixels within `reach` px of a cut side are affected."""
    a = crop[..., 3]
    m = (a > 40).astype(np.uint8)
    if m.sum() == 0:
        return crop
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    op = cv2.morphologyEx(m, cv2.MORPH_OPEN, k, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    H, W = a.shape
    zone = np.zeros_like(m, bool)
    if cut_edge[0]: zone[:, :reach] = True
    if cut_edge[1]: zone[:, W - reach:] = True
    removed = (m > 0) & (op == 0) & zone
    keep = m.copy(); keep[removed] = 0
    n, lab, st = components(keep * 255, 128)
    if n > 1:
        big = st[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            x, y, w, h, ar = st[i]
            touches = (cut_edge[0] and x < reach) or (cut_edge[1] and x + w > W - reach)
            if touches and ar < 0.04 * big and (x < reach and x + w < reach * 1.5 or x + w > W - reach and x > W - reach * 1.5):
                removed |= lab == i
    if not removed.any():
        return crop
    rem = cv2.dilate(removed.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out = crop.copy()
    out[..., 3] = np.where(rem & ~(op > 0), 0, a)
    return out


def fade_cut_edges(crop, colmask, sides, ramp=34):
    """Glow rows (beams) get sliced mid-glow; per row, ramp alpha to 0 toward
    the seam so the slice doesn't end in a hard vertical edge."""
    a = crop[..., 3].astype(np.float32)
    H, W = a.shape
    r = max(2, min(ramp, W // 5))
    xs = np.arange(W, dtype=np.float32)[None, :]
    wgt = np.ones_like(a)
    any_ = colmask.any(1)
    left = np.where(any_, colmask.argmax(1), 0).astype(np.float32)[:, None]
    right = np.where(any_, W - 1 - colmask[:, ::-1].argmax(1), W - 1).astype(np.float32)[:, None]
    def ss(t):
        t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
    if sides[0]: wgt *= ss((xs - left) / r)
    if sides[1]: wgt *= ss((right - xs) / r)
    out = crop.copy()
    out[..., 3] = np.clip(a * wgt, 0, 255).astype(np.uint8)
    return out


def largest_bottom(alpha):
    n, lab, st = components(alpha, 128)
    if n <= 1:
        ys = np.nonzero(alpha)[0]
        return int(ys.max()) if len(ys) else alpha.shape[0] - 1, None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, _ = st[i]
    return int(y + h - 1), lab == i


def grid_masks(shape, row):
    H, W = shape
    cw = row["cell"][0]
    cols = np.arange(W)[None, :]
    return [np.broadcast_to((cols >= k * cw) & (cols < (k + 1) * cw), (H, W)) for k in range(row["frames"])]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); ap.add_argument("--row"); a = ap.parse_args()
    from importlib import import_module
    fringe_fraction = import_module("01_clean").fringe_fraction
    man = load_manifest()
    outd = ensure(os.path.join(OUT, "frames"))
    idx_path = os.path.join(outd, "index.json")
    index = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    for row in man["rows"]:
        if row.get("mode") == "skip": continue
        if a.only and str(row["sheet"]) != a.only: continue
        if a.row and row["id"] != a.row: continue
        rgba = load_rgba(os.path.join(OUT, "clean", row["id"] + ".png"))
        rgba = clean_specks(rgba)
        rx, ry, rw, rh = row["rect"]
        n = row["frames"]
        if row.get("layout") == "grid" or man["sheets"][str(row["sheet"])].get("layout") == "grid":
            masks = grid_masks(rgba.shape[:2], row)
        else:
            cuts = [c - rx for c in row["cuts"]] if row.get("cuts") else None
            masks = cut_row(rgba, n, cuts)
        frames = []
        for k, m in enumerate(masks):
            f = rgba.copy()
            f[~m] = 0
            al = f[..., 3]
            ys, xs = np.nonzero(al > 8)
            if len(xs) == 0:
                print("  EMPTY frame", row["id"], k); continue
            x0, x1 = max(0, xs.min() - MARGIN), min(rgba.shape[1], xs.max() + 1 + MARGIN)
            y0, y1 = max(0, ys.min() - MARGIN), min(rgba.shape[0], ys.max() + 1 + MARGIN)
            crop = f[y0:y1, x0:x1]
            crop = trim_seam_wedges(crop, cut_edge=(k > 0, k < n - 1))
            if row.get("mode") == "glow":
                crop = fade_cut_edges(crop, np.ascontiguousarray(m[y0:y1, x0:x1]), (k > 0, k < n - 1))
            # keep RGB bleed inside the crop (masked-out px got zeroed): re-bleed
            from importlib import import_module as im_
            nf = im_("01_clean").nearest_fill
            good = crop[..., 3] > 200
            if good.any():
                crop[..., :3] = nf(crop[..., :3], good | (crop[..., 3] > 0))
            bottom, body = largest_bottom(crop[..., 3])
            name = f'{row["id"]}_{k}'
            save_rgba(crop, os.path.join(outd, name + ".png"))
            frames.append({"name": name, "sx": rx + int(x0), "sy": ry + int(y0), "w": int(x1 - x0), "h": int(y1 - y0),
                           "bottom": bottom, "fringe": round(fringe_fraction(crop), 5)})
        if len(frames) != n:
            print("  WARN", row["id"], "got", len(frames), "frames, want", n)
        index[row["id"]] = frames
    json.dump(index, open(idx_path, "w"), indent=1)
    print("slice: rows", len(index))


if __name__ == "__main__":
    main()
