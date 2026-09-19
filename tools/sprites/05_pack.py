"""Step 5: MaxRects-pack the normalized frames into atlas pages and write
assets/habitat/atlas/{<page>@1x.webp,@2x.webp,.png, atlas.json} per
docs/habitat/CONTRACT.md section 4.

Pages: trinity-core (CORE list + locomotion), trinity-ext (other Trinity
anims), fx (fx_*), ui (ui_*, obj_*, portrait_*). 2px padding with 1px edge
extrusion at @1x (x2 at @2x). Budgets: all WebP < 1.5 MB, trinity-core@2x
< 700 KB; WebP quality is stepped down until both hold.
"""
import argparse, base64, io, json, math
import numpy as np
from PIL import Image
from common import *

MAX = 2048
PAD = 2
BUDGET_TOTAL = 1.5 * 1024 * 1024
BUDGET_CORE2X = 700 * 1024
ALPHA_Q = 40

CORE_EXTRA = ["sit", "happy", "sleep", "wake_up", "love", "wave", "surprised", "angry", "confused", "listen",
              "land", "hurt", "knockdown", "recover", "teleport_in", "teleport_out", "shield", "ear_wiggle",
              "headphone_adjust", "hack", "scan", "charging", "low_battery"]
LOCOMOTION = ["idle_F", "idle_B", "idle_L", "idle_R", "walk_F", "walk_B", "walk_L", "walk_R",
              "run_F", "run_B", "run_L", "run_R", "jump", "fall", "land", "turn"]
PAGES = ["trinity-core", "trinity-ext", "fx", "ui"]
# AI in-betweens from 035_interpolate (lazily loaded by the client)
SMOOTH_PAGES = ["trinity-smooth-core", "trinity-smooth-ext"]
BUDGET_SMOOTH_1X = 1.6 * 1024 * 1024
BUDGET_SMOOTH_2X = 3.5 * 1024 * 1024


def page_of(anim):
    if anim.startswith("fx_"): return "fx"
    if anim.startswith(("ui_", "obj_", "portrait_")): return "ui"
    if anim in LOCOMOTION or anim in CORE_EXTRA: return "trinity-core"
    return "trinity-ext"


# ---------------------------------------------------------------- MaxRects
class MaxRects:
    """MaxRects bin packer, best-short-side-fit, no rotation."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.free = [(0, 0, w, h)]

    def insert(self, w, h):
        best = None
        for fx, fy, fw, fh in self.free:
            if w <= fw and h <= fh:
                ss, ls = min(fw - w, fh - h), max(fw - w, fh - h)
                key = (ss, ls, fy, fx)
                if best is None or key < best[0]:
                    best = (key, fx, fy)
        if best is None:
            return None
        _, x, y = best
        self._split((x, y, w, h))
        return x, y

    def _split(self, r):
        rx, ry, rw, rh = r
        out = []
        for f in self.free:
            fx, fy, fw, fh = f
            if rx >= fx + fw or rx + rw <= fx or ry >= fy + fh or ry + rh <= fy:
                out.append(f); continue
            if rx > fx: out.append((fx, fy, rx - fx, fh))
            if rx + rw < fx + fw: out.append((rx + rw, fy, fx + fw - rx - rw, fh))
            if ry > fy: out.append((fx, fy, fw, ry - fy))
            if ry + rh < fy + fh: out.append((fx, ry + rh, fw, fy + fh - ry - rh))
        # prune rects contained in others
        out = [a for i, a in enumerate(out) if a[2] > 0 and a[3] > 0 and not any(
            j != i and b[0] <= a[0] and b[1] <= a[1] and b[0] + b[2] >= a[0] + a[2] and b[1] + b[3] >= a[1] + a[3]
            and (b != a or j < i) for j, b in enumerate(out))]
        self.free = out


def pack(sizes):
    """sizes: {name: (w,h)} incl. padding. Returns (W, H, {name:(x,y)})."""
    order = sorted(sizes, key=lambda n: (-max(sizes[n]), -sizes[n][0] * sizes[n][1], n))
    area = sum(w * h for w, h in sizes.values())
    widths = [256, 512, 1024, 2048]
    for W in widths:
        if W * MAX < area: continue
        if max(w for w, h in sizes.values()) > W: continue
        mr = MaxRects(W, MAX)
        pos = {}
        ok = True
        for n in order:
            p = mr.insert(*sizes[n])
            if p is None: ok = False; break
            pos[n] = p
        if ok:
            H = max(pos[n][1] + sizes[n][1] for n in pos)
            H = int(math.ceil(H / 4.0) * 4)
            if W == 2048 or H <= W * 1.25:   # prefer squarish pages
                return W, H, pos
    raise SystemExit("pack: frames do not fit in %dx%d" % (MAX, MAX))


# ---------------------------------------------------------------- helpers
def extrude(page, x, y, w, h, e):
    """Copy the frame's edge pixels outward by e px (fights bilinear bleed)."""
    if e <= 0: return
    H, W = page.shape[:2]
    for i in range(1, e + 1):
        if y - i >= 0: page[y - i, x:x + w] = page[y, x:x + w]
        if y + h - 1 + i < H: page[y + h - 1 + i, x:x + w] = page[y + h - 1, x:x + w]
        if x - i >= 0: page[max(0, y - e):min(H, y + h + e), x - i] = page[max(0, y - e):min(H, y + h + e), x]
        if x + w - 1 + i < W: page[max(0, y - e):min(H, y + h + e), x + w - 1 + i] = page[max(0, y - e):min(H, y + h + e), x + w - 1]


def hit_mask(alpha):
    h, w = alpha.shape
    w4, h4 = (w + 3) // 4, (h + 3) // 4
    pad = np.zeros((h4 * 4, w4 * 4), np.uint8)
    pad[:h, :w] = alpha
    blk = pad.reshape(h4, 4, w4, 4).max(axis=(1, 3)) >= 128
    bits = np.packbits(blk.reshape(-1).astype(np.uint8))       # row-major, MSB first
    return base64.b64encode(bits.tobytes()).decode("ascii")


def smooth_fill(arr):
    """Replace RGB under alpha==0 with a smooth push-pull extension of the
    visible colours: cheap for the encoder and no dark/black bleed into
    soft edges through chroma subsampling."""
    import cv2
    a = arr[..., 3].astype(np.float32) / 255.0
    c = arr[..., :3].astype(np.float32) * a[..., None]
    w = a.copy()
    levels = []
    while min(w.shape) > 4:
        levels.append((c, w))
        size = (max(1, w.shape[1] // 2), max(1, w.shape[0] // 2))
        c = cv2.resize(c, size, interpolation=cv2.INTER_AREA)
        w = cv2.resize(w, size, interpolation=cv2.INTER_AREA)
    col = c / np.maximum(w[..., None], 1e-6)
    for c0, w0 in reversed(levels):
        up = cv2.resize(col, (c0.shape[1], c0.shape[0]), interpolation=cv2.INTER_LINEAR)
        cur = c0 / np.maximum(w0[..., None], 1e-6)
        k = np.clip(w0 * 4, 0, 1)[..., None]
        col = cur * k + up * (1 - k)
    out = arr.copy()
    hole = arr[..., 3] == 0
    out[hole, :3] = np.clip(col[hole], 0, 255).astype(np.uint8)
    return out


def webp_bytes(img, q, aq):
    buf = io.BytesIO()
    arr = smooth_fill(np.array(img))
    Image.fromarray(arr, "RGBA").save(buf, "WEBP", quality=q, alpha_quality=aq, method=6, exact=True)
    return buf.getvalue()


def place_page(names, load, meta, p, frames_json):
    """Pack `names` into one page; returns (img@1x, img@2x, W, H)."""
    sizes = {n: (meta[n]["w"] + 2 * PAD, meta[n]["h"] + 2 * PAD) for n in names}
    W, H, pos = pack(sizes)
    img1 = np.zeros((H, W, 4), np.uint8)
    img2 = np.zeros((H * 2, W * 2, 4), np.uint8)
    for n in names:
        x, y = pos[n][0] + PAD, pos[n][1] + PAD
        f1, f2 = load(n)
        h, w = f1.shape[:2]
        img1[y:y + h, x:x + w] = f1
        img2[2 * y:2 * y + 2 * h, 2 * x:2 * x + 2 * w] = f2
        extrude(img1, x, y, w, h, 1)
        extrude(img2, 2 * x, 2 * y, 2 * w, 2 * h, 2)
        frames_json[n] = {"p": p, "x": x, "y": y, "w": w, "h": h, "ax": meta[n]["ax"], "ay": meta[n]["ay"],
                          "hit": hit_mask(f1[..., 3])}
    return img1, img2, W, H


def pack_smooth(anims, frames_json, pages_json, anims_json, q0):
    """Smooth pages: frames from out/smooth, one page per source page family.
    Adds "s": {f, fps, p} to each smoothed anim. Existing pages untouched."""
    ipath = os.path.join(OUT, "smooth", "index.json")
    if not os.path.exists(ipath):
        print("pack: no out/smooth/index.json (run 035_interpolate) -> no smooth pages")
        return {}
    sm = json.load(open(ipath))
    sf, plan = sm["frames"], sm["plan"]
    for key, pl in plan.items():
        for n in pl["f"]:
            if n not in sf and n not in frames_json:
                raise SystemExit(f"pack: smooth {key} references unknown frame {n}")
    spage = lambda k: "trinity-smooth-core" if page_of(k) == "trinity-core" else "trinity-smooth-ext"
    need = {p: [] for p in SMOOTH_PAGES}
    owner = {}
    for key in sorted(plan, key=lambda k: SMOOTH_PAGES.index(spage(k))):
        for n in plan[key]["f"]:
            if n in sf and n not in owner:
                owner[n] = spage(key); need[spage(key)].append(n)
    load = lambda n: tuple(np.array(Image.open(os.path.join(OUT, "smooth", f"{n}@{r}.png")).convert("RGBA"))
                           for r in ("1x", "2x"))
    imgs = {}
    for p in SMOOTH_PAGES:
        if not need[p]: continue
        i1, i2, W, H = place_page(need[p], load, sf, p, frames_json)
        imgs[p] = (Image.fromarray(i1, "RGBA"), Image.fromarray(i2, "RGBA"))
        rawd = ensure(os.path.join(OUT, "pages"))
        imgs[p][0].save(os.path.join(rawd, f"{p}@1x.png")); imgs[p][1].save(os.path.join(rawd, f"{p}@2x.png"))
        pages_json[p] = {"@1x": f"{p}@1x.webp", "@2x": f"{p}@2x.webp",
                         "png": {"@1x": f"{p}@1x.png", "@2x": f"{p}@2x.png"}, "w": W, "h": H}
        print(f"pack: {p:20s} {len(need[p]):3d} frames  {W}x{H} @1x")
    # same quality as the source pages (no sharpness flicker between source and
    # in-between); each in-between is on screen ~40 ms, so it may step lower for budget
    q = q0
    while True:
        blobs = {}
        for p, (i1, i2) in imgs.items():
            blobs[(p, "@1x")] = webp_bytes(i1, max(30, q - 14), ALPHA_Q)
            blobs[(p, "@2x")] = webp_bytes(i2, q, ALPHA_Q)
        t1 = sum(len(b) for (p, r), b in blobs.items() if r == "@1x")
        t2 = sum(len(b) for (p, r), b in blobs.items() if r == "@2x")
        if (t1 <= BUDGET_SMOOTH_1X and t2 <= BUDGET_SMOOTH_2X) or q <= 36:
            break
        q -= 3
        print(f"pack: smooth over budget (@1x {t1/1024:.0f} KB, @2x {t2/1024:.0f} KB) -> quality {q}")
    for (p, r), b in blobs.items():
        open(os.path.join(ATLAS_DIR, f"{p}{r}.webp"), "wb").write(b)
    for p, pair in imgs.items():
        for r, im in zip(("@1x", "@2x"), pair):
            qim = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            qim.save(os.path.join(ATLAS_DIR, f"{p}{r}.png"), optimize=True)
    for key, pl in plan.items():
        if key in anims_json:
            anims_json[key]["s"] = {"f": pl["f"], "fps": pl["fps"], "p": spage(key)}
    print(f"pack: smooth webp @1x {t1/1024:.0f} KB (budget {BUDGET_SMOOTH_1X/1024:.0f}), "
          f"@2x {t2/1024:.0f} KB (budget {BUDGET_SMOOTH_2X/1024:.0f}), quality {q}; {len(plan)} anims")
    if t1 > BUDGET_SMOOTH_1X or t2 > BUDGET_SMOOTH_2X:
        raise SystemExit("pack: SMOOTH BUDGET EXCEEDED")
    return {"q": q, "@1x": t1, "@2x": t2}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--quality", type=int, default=64); ap.add_argument("--raw-only", action="store_true")
    ap.add_argument("--no-smooth", action="store_true", help="skip the trinity-smooth-* pages and the anims' \"s\" keys")
    ap.add_argument("--smooth-quality", type=int, help="default: the final quality of the source pages")
    a = ap.parse_args()
    man = load_manifest()
    nidx = json.load(open(os.path.join(OUT, "norm", "index.json")))
    anims = man["anims"]
    # frames needed per page (a frame shared by pages is stored once, on the first page that needs it)
    need = {p: [] for p in PAGES}
    owner = {}
    for key in sorted(anims, key=lambda k: PAGES.index(page_of(k))):
        spec = anims[key]
        for i in spec["f"]:
            fname = f'{spec["src"]}_{i}'
            if fname not in nidx:
                raise SystemExit(f"pack: anim {key} needs missing frame {fname}")
            if fname not in owner:
                owner[fname] = page_of(key)
                need[page_of(key)].append(fname)

    ensure(ATLAS_DIR)
    frames_json, pages_json = {}, {}
    page_imgs = {}
    for p in PAGES:
        names = need[p]
        sizes = {n: (nidx[n]["w"] + 2 * PAD, nidx[n]["h"] + 2 * PAD) for n in names}
        W, H, pos = pack(sizes)
        img1 = np.zeros((H, W, 4), np.uint8)
        img2 = np.zeros((H * 2, W * 2, 4), np.uint8)
        for n in names:
            x, y = pos[n][0] + PAD, pos[n][1] + PAD
            f1 = np.array(Image.open(os.path.join(OUT, "norm", n + "@1x.png")).convert("RGBA"))
            f2 = np.array(Image.open(os.path.join(OUT, "norm", n + "@2x.png")).convert("RGBA"))
            h, w = f1.shape[:2]
            img1[y:y + h, x:x + w] = f1
            img2[2 * y:2 * y + 2 * h, 2 * x:2 * x + 2 * w] = f2
            extrude(img1, x, y, w, h, 1)
            extrude(img2, 2 * x, 2 * y, 2 * w, 2 * h, 2)
            frames_json[n] = {"p": p, "x": x, "y": y, "w": w, "h": h, "ax": nidx[n]["ax"], "ay": nidx[n]["ay"],
                              "hit": hit_mask(f1[..., 3])}
        page_imgs[p] = (Image.fromarray(img1, "RGBA"), Image.fromarray(img2, "RGBA"))
        rawd = ensure(os.path.join(OUT, "pages"))
        page_imgs[p][0].save(os.path.join(rawd, f"{p}@1x.png")); page_imgs[p][1].save(os.path.join(rawd, f"{p}@2x.png"))
        pages_json[p] = {"@1x": f"{p}@1x.webp", "@2x": f"{p}@2x.webp",
                         "png": {"@1x": f"{p}@1x.png", "@2x": f"{p}@2x.png"}, "w": W, "h": H}
        print(f"pack: {p:12s} {len(names):3d} frames  {W}x{H} @1x")

    if a.raw_only: return
    # WebP with budget tuning: Trinity pages step down together; fx/ui stay crisp
    q = a.quality
    while True:
        blobs = {}
        for p in PAGES:
            i1, i2 = page_imgs[p]
            q2 = q if p.startswith("trinity") else max(q, 70)
            q1 = max(30, q2 - 14) if p.startswith("trinity") else q2
            blobs[(p, "@1x")] = webp_bytes(i1, q1, ALPHA_Q)
            blobs[(p, "@2x")] = webp_bytes(i2, q2, ALPHA_Q)
        total = sum(len(b) for b in blobs.values())
        core2 = len(blobs[("trinity-core", "@2x")])
        if (total < BUDGET_TOTAL and core2 < BUDGET_CORE2X) or q <= 36:
            break
        q -= 3
        print(f"pack: over budget (total {total/1024:.0f} KB, core@2x {core2/1024:.0f} KB) -> quality {q}")
    for (p, s), b in blobs.items():
        open(os.path.join(ATLAS_DIR, f"{p}{s}.webp"), "wb").write(b)
    for p in PAGES:
        for s, im in zip(("@1x", "@2x"), page_imgs[p]):
            qim = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            qim.save(os.path.join(ATLAS_DIR, f"{p}{s}.png"), optimize=True)

    anims_json = {}
    for key, spec in anims.items():
        d = {"f": [f'{spec["src"]}_{i}' for i in spec["f"]], "fps": spec["fps"], "loop": spec["loop"],
             "flip": spec["flip"], "blend": spec.get("blend", "normal")}
        if spec.get("ev"): d["ev"] = spec["ev"]
        if spec.get("facing"): d["facing"] = spec["facing"]
        anims_json[key] = d
    # stale smooth pages from an earlier build go away with --no-smooth
    for p in SMOOTH_PAGES:
        for r in ("@1x.webp", "@2x.webp", "@1x.png", "@2x.png"):
            fp = os.path.join(ATLAS_DIR, p + r)
            if os.path.exists(fp): os.remove(fp)
    if not a.no_smooth:
        pack_smooth(anims, frames_json, pages_json, anims_json, a.smooth_quality or q)
    atlas = {"v": 1, "scale": {"@1x": 1, "@2x": 2},
             "hitMask": {"res": 0.25, "order": "row-major", "bits": "MSB-first, continuous (no per-row byte padding)",
                         "w4": "ceil(w/4)", "h4": "ceil(h/4)", "set": "any @1x alpha >= 128 in the 4x4 block"},
             "pages": pages_json, "frames": frames_json, "anims": anims_json}
    with open(os.path.join(ATLAS_DIR, "atlas.json"), "w", encoding="utf-8") as f:
        json.dump(atlas, f, separators=(",", ":"))
    sizes = {fn: os.path.getsize(os.path.join(ATLAS_DIR, fn)) for fn in sorted(os.listdir(ATLAS_DIR))}
    total = sum(v for k, v in sizes.items() if k.endswith(".webp") and not k.startswith("trinity-smooth"))
    for k, v in sizes.items(): print(f"  {k:28s} {v/1024:8.1f} KB")
    print(f"pack: webp total (existing pages) {total/1024:.0f} KB (budget {BUDGET_TOTAL/1024:.0f}), quality {q}")
    ok = total < BUDGET_TOTAL and sizes["trinity-core@2x.webp"] < BUDGET_CORE2X
    if not ok:
        raise SystemExit("pack: BUDGET EXCEEDED")


if __name__ == "__main__":
    main()
