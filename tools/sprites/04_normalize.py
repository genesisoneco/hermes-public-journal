"""Step 4: scale + anchor every upscaled frame.

 - ONE global scale: idle_front body height -> target.bodyH1x px @1x (x2 @2x).
   Each Trinity row carries `refH` (source px that should read as idle
   height) so rows drawn smaller on the sheet match her real size; `scaleRef`
   is an extra multiplier (FX / UI / props / portraits).
 - Anchor ("feet", default): ay = bottom of the largest opaque component;
   ax = body centre + one row-wide median (feet - centre) offset, so frames
   don't drift. anchorY:"row" keeps the sheet's shared ground line (jumps,
   hovers, teleports keep their vertical offsets). anchor:"center" for FX/UI.
 - Output: out/norm/<frame>@2x.png and @1x.png, even-sized so @2x is exactly
   2x @1x, plus out/norm/index.json with @1x w,h,ax,ay.
"""
import argparse, json
import numpy as np, cv2
from common import *
from importlib import import_module

nearest_fill = import_module("01_clean").nearest_fill


def largest(alpha, thr=128):
    n, lab, st, _ = cv2.connectedComponentsWithStats((alpha > thr).astype(np.uint8), 8)
    if n <= 1:
        return None, None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return lab == i, st[i]


def feet_and_centre(alpha):
    m, st = largest(alpha)
    if m is None:
        h, w = alpha.shape
        return w / 2, h - 1, w / 2
    x, y, w, h, _ = st
    bottom = y + h - 1
    lo = max(y, bottom - max(2, int(0.10 * h)))
    ys, xs = np.nonzero(m[lo:bottom + 1])
    feet_x = float(np.median(xs)) if len(xs) else x + w / 2
    # body centre from the lower half rows (ears / glyphs / beams excluded)
    ys2, xs2 = np.nonzero(m[y + h // 2:bottom + 1])
    cx = (xs2.min() + xs2.max()) / 2.0 if len(xs2) else x + w / 2
    return feet_x, float(bottom), float(cx)


def resize(img, s):
    h, w = img.shape[:2]
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    return cv2.resize(img, (nw, nh), interpolation=interp)


def scale_rgba(im, s):
    a = im[..., 3].astype(np.float32) / 255.0
    pm = im[..., :3].astype(np.float32) * a[..., None]          # premultiply
    pm = resize(pm, s); a2 = resize(a, s)
    a2 = np.clip(a2, 0, 1)
    rgb = np.where(a2[..., None] > 1e-3, pm / np.maximum(a2[..., None], 1e-3), 0)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    al = np.clip(a2 * 255 + 0.5, 0, 255).astype(np.uint8)
    al[al < 6] = 0
    good = al > 0
    if good.any():
        rgb = nearest_fill(rgb, good)
    return np.dstack([rgb, al])


def row_scale(man, row):
    t = man["target"]
    s2 = 2 * t["bodyH1x"] / t["idleRefH"]                 # source px -> @2x px
    if row.get("refH"):
        s2 *= t["idleRefH"] / row["refH"]
    s2 *= row.get("scaleRef", 1.0)
    return s2 / 2.0                                         # up/ images are already 2x source


def place(im, ax, ay, pad=2):
    """Pad so the frame is even-sized and the anchor lands on even coords."""
    h, w = im.shape[:2]
    axi, ayi = int(round(ax)), int(round(ay))
    l = pad + (axi + pad) % 2
    t = pad + (ayi + pad) % 2
    W = w + l + pad; H = h + t + pad
    W += W % 2; H += H % 2
    out = np.zeros((H, W, 4), np.uint8)
    out[t:t + h, l:l + w] = im
    good = out[..., 3] > 0
    if good.any():
        out[..., :3] = nearest_fill(out[..., :3], good)
    return out, axi + l, ayi + t


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); ap.add_argument("--row"); a = ap.parse_args()
    man = load_manifest()
    index = json.load(open(os.path.join(OUT, "frames", "index.json")))
    outd = ensure(os.path.join(OUT, "norm"))
    npath = os.path.join(outd, "index.json")
    nidx = json.load(open(npath)) if os.path.exists(npath) else {}
    for row in man["rows"]:
        if row.get("mode") == "skip": continue
        if a.only and str(row["sheet"]) != a.only: continue
        if a.row and row["id"] != a.row: continue
        s = row_scale(man, row)
        frames = index[row["id"]]
        ims, info = [], []
        for f in frames:
            im = scale_rgba(load_rgba(os.path.join(OUT, "up", f["name"] + ".png")), s)
            ims.append(im)
            fx, fy, cx = feet_and_centre(im[..., 3])
            # sheet-space top of this frame in @2x-scaled units (for "row" baselines)
            info.append({"feet_x": fx, "bottom": fy, "cx": cx, "top_sheet": f["sy"] * 2 * s})
        mode = row.get("anchor", "feet")
        off = float(np.median([i["feet_x"] - i["cx"] for i in info]))
        if row.get("anchorY") == "row":
            base = max(i["top_sheet"] + i["bottom"] for i in info)
        for f, im, i in zip(frames, ims, info):
            h, w = im.shape[:2]
            if mode == "center":
                ax, ay = w / 2, h / 2
            elif mode == "feet" and row["sheet"] == 5:     # props: bottom centre of the bbox
                ys, xs = np.nonzero(im[..., 3] > 40)
                ax, ay = (xs.min() + xs.max()) / 2, ys.max()
            else:
                ax = i["cx"] + off
                ay = (base - i["top_sheet"]) if row.get("anchorY") == "row" else i["bottom"]
            # the anchor may sit below the pixels (airborne): grow the canvas
            if ay > h - 1:
                im = np.vstack([im, np.zeros((int(np.ceil(ay - h + 2)), w, 4), np.uint8)])
            out, ax2, ay2 = place(im, ax, ay)
            one = scale_rgba(out, 0.5)
            assert one.shape[0] * 2 == out.shape[0] and one.shape[1] * 2 == out.shape[1], f["name"]
            save_rgba(out, os.path.join(outd, f["name"] + "@2x.png"))
            save_rgba(one, os.path.join(outd, f["name"] + "@1x.png"))
            nidx[f["name"]] = {"w": one.shape[1], "h": one.shape[0], "ax": ax2 // 2, "ay": ay2 // 2,
                               "row": row["id"], "fringe": f["fringe"]}
    json.dump(nidx, open(npath, "w"), indent=1)
    print("normalize:", len(nidx), "frames")


if __name__ == "__main__":
    main()
