"""Step 3.5 (runs after 04_normalize, before 05_pack): AI in-between frames
for Trinity's anims with RIFE (rife-ncnn-vulkan, model rife-v4.6, Vulkan GPU).

 - Eligible: locomotion / special / emote / utility anims with >= 3 distinct
   source frames (not fx_ / ui_ / obj_ / portrait_, not sleep).
 - k in-betweens per played pair (incl. last -> first for loops), chosen so
   fps * (k+1) ~ 24 and len(f) * (k+1) <= 24. Smooth fps = fps * (k+1), so the
   cycle length (and the event timing) is unchanged; non-loop anims hold the
   last source frame k extra ticks for the same reason.
 - Each anim's frames are registered by anchor (feet) on one canvas and
   composited over #00FF00 (over #0000FF instead when the art itself has
   green-dominant pixels). One RIFE directory call per anim and key: with
   n = L*(k+1) outputs, output m*(k+1)+j is pair (m, m+1) at t = j/(k+1).
 - Re-key: RIFE runs twice (over green and over blue) and triangulation
   matting of the two results gives alpha (pink/green RIFE murk differs
   between the runs, real art doesn't), min'd with the key-dominance test
   (G > R+40 and G > B+40 is key) and a morphologically interpolated (SDF
   blend, dilated 5px) mask of the two source alphas. Edge colour comes
   from the nearest clean interior pixel (despill), then alpha bleed.
 - QA gate (failures hold the nearest source frame), per pair: opposite
   facings / to-from back view ("facing"); > PAIR_MAX of the silhouette not
   explained by a local shift ("dissolve": props appearing, faces swapping,
   which RIFE can only cross-fade into ghost double images). Per frame:
   soft IoU vs the t-weighted source alphas < 0.85 ("iou"), key/magenta
   edge fringe > 0.5 % above the sources' own ("fringe"), more significant
   blobs than either source ("ghost"). Anims with no surviving in-between
   get no smooth variant.
 - In-betweens are shared by name: <row>_s<a>_<b>_<j>_<k+1> with a < b (the
   reversed pair reuses them backwards), so ping-pong anims cost nothing.

Outputs: out/smooth/<name>@2x.png/@1x.png, out/smooth/index.json (frames:
@1x w,h,ax,ay; plan: anim -> {f, fps}), out/smooth_qa.json.
"""
import argparse, glob, json, shutil, subprocess, tempfile, time
import numpy as np, cv2
from common import *
from importlib import import_module

_norm = import_module("04_normalize")
place, scale_rgba = _norm.place, _norm.scale_rgba
nearest_fill = import_module("01_clean").nearest_fill

RIFE_DIR = os.path.join(BIN, "rife-ncnn-vulkan-20221029-windows")
RIFE = os.path.join(RIFE_DIR, "rife-ncnn-vulkan.exe")
MODEL = "rife-v4.6"
TARGET_FPS = 24
MAX_FRAMES = 24
MARGIN = 16                      # @2x canvas margin around the union of frames
IOU_MIN = 0.85
FRINGE_MAX = 0.005
PAIR_MAX = 0.10                  # unexplained change between the two source poses (see pair_change)
TRIANGULATE = True               # second RIFE pass over #0000FF for two-key matting
CATS = {"locomotion", "special", "emote", "utility"}
SKIP = {"sleep"}


def trinity_anims():
    """Anim keys per rules.js ANIMS category (parsed, so the list can't drift)."""
    src = open(os.path.join(REPO, "assets", "js", "habitat", "sim", "rules.js"), encoding="utf-8").read()
    body = src[src.index("export const ANIMS"):]
    body = body[:body.index("};")]
    out = set()
    import re
    for cat, items in re.findall(r"(\w+):\s*\[([^\]]*)\]", body):
        if cat in CATS:
            out |= set(re.findall(r'"([^"]+)"', items))
    return out


def choose_k(spec):
    n = len(spec["f"])
    k = max(1, int(round(TARGET_FPS / float(spec["fps"]))) - 1)
    while k >= 1 and n * (k + 1) > MAX_FRAMES:
        k -= 1
    return k


# ---------------------------------------------------------------- canvas
def load2(name):
    return load_rgba(os.path.join(OUT, "norm", name + "@2x.png"))


def build_canvas(names, nidx):
    """All frames registered by anchor on one even-sized canvas."""
    up = max(2 * nidx[n]["ay"] for n in names) + MARGIN
    left = max(2 * nidx[n]["ax"] for n in names) + MARGIN
    down = max(2 * (nidx[n]["h"] - nidx[n]["ay"]) for n in names) + MARGIN
    right = max(2 * (nidx[n]["w"] - nidx[n]["ax"]) for n in names) + MARGIN
    up += up % 2; left += left % 2
    H, W = up + down, left + right
    H += H % 2; W += W % 2
    layers = {}
    for n in set(names):
        im = load2(n)
        h, w = im.shape[:2]
        c = np.zeros((H, W, 4), np.uint8)
        y0, x0 = up - 2 * nidx[n]["ay"], left - 2 * nidx[n]["ax"]
        c[y0:y0 + h, x0:x0 + w] = im
        layers[n] = c
    return layers, (left, up), (H, W)


KEYS = {"g": np.array([0, 255, 0], np.float32), "b": np.array([0, 0, 255], np.float32)}


def dominance(f, key):
    """Key-channel dominance: K - max(other two)."""
    f = f.astype(np.float32)
    c = {"g": 1, "b": 2}[key]
    o = [i for i in range(3) if i != c]
    return f[..., c] - np.maximum(f[..., o[0]], f[..., o[1]])


def murk(f):
    """Green cast: G - (R+B)/2 (pink ~ -100, white/black 0, pink/green mixes > 0)."""
    f = f.astype(np.float32)
    return f[..., 1] - (f[..., 0] + f[..., 2]) / 2


def pick_key(layers):
    """#00FF00 unless the art itself has green-dominant pixels (battery bars):
    then the key with fewer conflicts."""
    frac = {}
    for k in KEYS:
        tot = hit = 0
        for im in layers.values():
            op = im[..., 3] > 128
            tot += op.sum(); hit += (dominance(im[..., :3], k)[op] > 30).sum()
        frac[k] = hit / max(1, tot)
    return "g" if frac["g"] <= 0.002 or frac["g"] <= frac["b"] else "b"


def over_key(rgba, key="g"):
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    return (rgba[..., :3].astype(np.float32) * a + KEYS[key] * (1 - a) + 0.5).astype(np.uint8)


# ---------------------------------------------------------------- RIFE
def rife_sequence(imgs, k, work):
    """imgs: list of HxWx3 uint8 (L frames). Returns dict (m, j) -> image for
    the pair (m, m+1) at t = j/(k+1), j = 1..k."""
    ind, outd = os.path.join(work, "in"), os.path.join(work, "out")
    for d in (ind, outd):
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for i, im in enumerate(imgs):
        cv2.imwrite(os.path.join(ind, f"{i:08d}.png"), im[..., ::-1])
    L = len(imgs)
    n = L * (k + 1)
    cmd = [RIFE, "-i", ind, "-o", outd, "-n", str(n), "-m", os.path.join(RIFE_DIR, MODEL), "-f", "%08d.png"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    outs = sorted(glob.glob(os.path.join(outd, "*.png")))
    if r.returncode or len(outs) != n:
        raise SystemExit(f"interpolate: RIFE failed ({r.returncode}, {len(outs)}/{n} frames)\n{r.stderr[-2000:]}")
    res = {}
    for i, p in enumerate(outs):
        m, j = divmod(i, k + 1)
        if j and m < L - 1:
            res[(m, j)] = cv2.imread(p, cv2.IMREAD_COLOR)[..., ::-1].copy()
    return res


# ---------------------------------------------------------------- re-key
def sdf(mask):
    """Signed distance, negative inside."""
    m = mask.astype(np.uint8)
    din = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    dout = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    return dout - din


def morph_mask(aA, aB, t, grow=5.0, soft=2.5):
    """SDF-blended silhouette of the two sources at time t, dilated by `grow`
    px with a `soft` px ramp (a smear guard, not the final edge)."""
    s = (1 - t) * sdf(aA > 127) + t * sdf(aB > 127)
    # thin parts that move far vanish in an SDF blend; keep the parts both
    # sources agree on plus the plain union's core as a floor
    return np.clip((grow - s) / soft, 0, 1)


def protect_map(srcs):
    """Where the source art itself is greenish (cyan/yellow/green props,
    glows) plus a motion margin: the strict green-cast test is off there."""
    m = np.zeros(srcs[0].shape[:2], bool)
    for im in srcs:
        m |= (murk(im[..., :3]) > 10) & (im[..., 3] > 64)
    return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0


def key_alpha(f, key, prot):
    """Soft alpha from the key: dominance d <= 0 opaque, >= 40 key (the spec's
    G > R+40 and G > B+40). For the green key, pink/green RIFE murk (G above
    the R/B mean) is also keyed outside the protected areas."""
    ak = np.clip((40.0 - dominance(f, key)) / 40.0, 0, 1)
    if key == "g":
        am = np.clip((50.0 - murk(f)) / 40.0, 0, 1)
        ak = np.where(prot, ak, np.minimum(ak, am))
    return ak


def rekey(rgb, A, B, t, key, rgb2=None):
    """rgb: RIFE output over the key; rgb2: the same in-between rendered over
    the second key (triangulation matting: what differs between the two runs
    is background, whatever its colour)."""
    f = rgb.astype(np.float32)
    aA, aB = A[..., 3], B[..., 3]
    prot = protect_map([A, B]) if key == "g" else np.zeros(aA.shape, bool)
    if rgb2 is not None:
        K1, K2 = KEYS[key], KEYS["b" if key == "g" else "g"]
        dk = K1 - K2
        f2 = rgb2.astype(np.float32)
        at = 1.0 - ((f - f2) @ dk) / float(dk @ dk)
        ak = np.clip((at - 0.2) / 0.65, 0, 1)                # at <= .2 clear, >= .85 solid
        # opaque-looking pixels whose colour still leans to the key (RIFE
        # smear that happens to match in both runs) are cut too
        ak = np.minimum(ak, np.clip((60.0 - dominance(f, key)) / 40.0, 0, 1))
    else:
        ak = key_alpha(f, key, prot)
    am = morph_mask(aA, aB, t)
    a = np.minimum(ak, am)
    if rgb2 is not None:
        f = (f + f2) / 2                                      # both runs agree where opaque
    # edge colour: key-mixed pixels can't be un-mixed reliably (it tips them
    # into magenta), so like 01_clean the edge band takes the colour of the
    # nearest clean interior pixel (fully out of the key, 1px in)
    clean = cv2.erode((ak > 0.97).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    if clean.any():
        f = nearest_fill(np.clip(f, 0, 255).astype(np.uint8), clean).astype(np.float32)
    al = (a * 255 + 0.5).astype(np.uint8)
    al[al < 6] = 0
    # drop specks (smear islands) smaller than 0.3 % of the body
    n, lab, st, _ = cv2.connectedComponentsWithStats((al > 0).astype(np.uint8), 8)
    if n > 2:
        big = st[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] < 0.003 * big:
                al[lab == i] = 0
    rgb8 = np.clip(f, 0, 255).astype(np.uint8)
    good = al > 0
    if good.any():
        rgb8 = nearest_fill(rgb8, good)
    return np.dstack([rgb8, al]), prot


# ---------------------------------------------------------------- QA
def soft_iou(a, b):
    a = a.astype(np.float32) / 255.0; b = b.astype(np.float32) / 255.0
    return float(np.minimum(a, b).sum() / max(1e-6, np.maximum(a, b).sum()))


def blobs(alpha, frac=0.02):
    n, lab, st, _ = cv2.connectedComponentsWithStats((alpha > 128).astype(np.uint8), 8)
    if n <= 1: return 0
    ar = st[1:, cv2.CC_STAT_AREA]
    return int((ar >= frac * ar.max()).sum())


def edge_fringe(rgba, key, prot):
    """Share of edge px that show key colour, green cast (outside protected
    areas) or magenta halo."""
    a = rgba[..., 3]
    vis = a > 8
    edge = vis & ~(cv2.erode(vis.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
    edge |= (a > 8) & (a < 250)
    if not edge.any(): return 0.0
    f = rgba[..., :3]
    bad = (dominance(f, key) > 25) | halo_mask(f)
    if key == "g":
        bad |= (murk(f) > 25) & ~prot
    return float((bad & edge).sum()) / edge.sum()


def pair_change(A, B, r=6, thr=60):
    """Share of the pair's silhouette union that no local shift of <= 2r px
    (@2x) explains: props appearing/vanishing, faces turning, eyes swapping
    expressions. RIFE can only cross-dissolve those (ghost double images),
    so such pairs are held instead. Walk/run/idle pairs score < 0.06,
    turn and prop-swap pairs 0.17-0.37; 0.10-0.15 were mostly
    visible dissolves (dash faces, charging battery, love heart)."""
    def prep(X):
        X = cv2.resize(X, (X.shape[1] // 2, X.shape[0] // 2), interpolation=cv2.INTER_AREA).astype(np.float32)
        al = X[..., 3:4] / 255
        return np.concatenate([X[..., :3] * al, X[..., 3:4]], -1)
    a, b = prep(A), prep(B)
    H, W = a.shape[:2]

    def unexpl(x, y):
        best = np.full((H, W), 1e9, np.float32)
        yp = np.pad(y, ((r, r), (r, r), (0, 0)), mode="edge")
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                best = np.minimum(best, np.abs(x - yp[r + dy:r + dy + H, r + dx:r + dx + W]).max(-1))
        return best
    e = np.maximum(unexpl(a, b), unexpl(b, a))
    uni = (a[..., 3] > 128) | (b[..., 3] > 128)
    return float(((e > thr) & uni).sum() / max(1, uni.sum()))


OPP = {("F", "B"), ("B", "F"), ("L", "R"), ("R", "L")}


def facing_jump(fa, fb):
    """Front<->back, left<->right, or anything to/from a back view."""
    return fa != fb and ((fa, fb) in OPP or "B" in (fa, fb))


def gate(gen, A, B, t, key, prot):
    aA, aB = A[..., 3], B[..., 3]
    ref = ((1 - t) * aA.astype(np.float32) + t * aB.astype(np.float32)).astype(np.uint8)
    iou = soft_iou(gen[..., 3], ref)
    # fringe the source art already has (e.g. battery bars at an edge) is not the in-between's fault
    fr = max(0.0, edge_fringe(gen, key, prot) - max(edge_fringe(A, key, prot), edge_fringe(B, key, prot)))
    bg, bs = blobs(gen[..., 3]), max(blobs(aA), blobs(aB))
    why = []
    if iou < IOU_MIN: why.append("iou")
    if fr > FRINGE_MAX: why.append("fringe")
    if bg > bs: why.append("ghost")
    return why, {"iou": round(iou, 3), "fringe": round(fr, 4), "blobs": [bg, bs]}


# ---------------------------------------------------------------- output
def save_frame(rgba2, anchor, name, outd):
    ys, xs = np.nonzero(rgba2[..., 3])
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    ax, ay = anchor
    # keep the anchor inside the crop (as normalize does for airborne frames)
    y1 = max(y1, ay + 1); y0 = min(y0, ay); x0 = min(x0, ax); x1 = max(x1, ax + 1)
    crop = rgba2[y0:y1, x0:x1]
    out, ax2, ay2 = place(crop, ax - x0, ay - y0)
    one = scale_rgba(out, 0.5)
    assert one.shape[0] * 2 == out.shape[0] and one.shape[1] * 2 == out.shape[1], name
    save_rgba(out, os.path.join(outd, name + "@2x.png"))
    save_rgba(one, os.path.join(outd, name + "@1x.png"))
    return {"w": one.shape[1], "h": one.shape[0], "ax": ax2 // 2, "ay": ay2 // 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anim", help="only these anims (comma list); others keep their previous result")
    ap.add_argument("--only"); ap.add_argument("--row")           # accepted from build.py, ignored
    a = ap.parse_args()
    if not os.path.exists(RIFE):
        raise SystemExit(f"interpolate: {RIFE} missing (see README: rife-ncnn-vulkan), or build with --no-smooth")
    man = load_manifest()
    nidx = json.load(open(os.path.join(OUT, "norm", "index.json")))
    outd = ensure(os.path.join(OUT, "smooth"))
    ipath = os.path.join(outd, "index.json")
    only = set(a.anim.split(",")) if a.anim else None
    qpath = os.path.join(OUT, "smooth_qa.json")
    frames, plan, qa = {}, {}, {}
    if only and os.path.exists(ipath):
        prev = json.load(open(ipath)); frames, plan = prev["frames"], prev["plan"]
        if os.path.exists(qpath): qa = json.load(open(qpath))
        for key in only:
            plan.pop(key, None); qa.get("anims", {}).pop(key, None)
    if not only:
        for p in glob.glob(os.path.join(outd, "*.png")): os.remove(p)
    trin = trinity_anims()
    work = tempfile.mkdtemp(prefix="rife_")
    t0 = time.time()
    done = {}                                            # canonical name -> resolved name (or hold)
    try:
        for key, spec in man["anims"].items():
            if key not in trin or key in SKIP: continue
            if only and key not in only: continue
            if len(set(spec["f"])) < 3: continue
            k = choose_k(spec)
            if k < 1: continue
            src = spec["src"]
            seq = list(spec["f"]) + ([spec["f"][0]] if spec["loop"] else [])
            names = [f"{src}_{i}" for i in seq]
            layers, (CX, CY), _ = build_canvas(names, nidx)
            kc = pick_key(layers)
            res = rife_sequence([over_key(layers[n], kc) for n in names], k, work)
            k2 = "b" if kc == "g" else "g"
            res2 = rife_sequence([over_key(layers[n], k2) for n in names], k, work) if TRIANGULATE else None
            row = next(r for r in man["rows"] if r["id"] == src)
            fac = row.get("facing") or ["F"] * row["frames"]
            out_f, rej = [], []
            for m in range(len(seq) - 1):
                ia, ib = seq[m], seq[m + 1]
                out_f.append(names[m])
                pwhy, pc = [], 0.0
                if ia != ib:
                    if facing_jump(fac[ia], fac[ib]): pwhy.append("facing")
                    pc = pair_change(layers[names[m]], layers[names[m + 1]])
                    if pc > PAIR_MAX: pwhy.append("dissolve")
                for j in range(1, k + 1):
                    t = j / (k + 1.0)
                    if ia == ib:
                        out_f.append(names[m]); continue
                    lo, hi = min(ia, ib), max(ia, ib)
                    jc = j if ia < ib else k + 1 - j
                    canon = f"{src}_s{lo}_{hi}_{jc}_{k + 1}"
                    if canon not in done:
                        A, B = layers[names[m]], layers[names[m + 1]]
                        gen, prot = rekey(res[(m, j)], A, B, t, kc, res2[(m, j)] if res2 else None)
                        why, met = gate(gen, A, B, t, kc, prot)
                        why = pwhy + why; met["change"] = round(pc, 3)
                        if why:
                            hold = names[m] if t <= 0.5 else names[m + 1]
                            done[canon] = (hold, ia < ib)
                            rej.append({"frame": canon, "why": why, **met, "hold": hold})
                        else:
                            frames[canon] = save_frame(gen, (CX, CY), canon, outd)
                            frames[canon]["row"] = src
                            done[canon] = (canon, None)
                        qa.setdefault("frames", {})[canon] = {"anim": key, "t": round(t, 3), **met, "reject": why}
                    nm, fwd = done[canon]
                    if fwd is not None:                     # rejected: hold the source nearest in time
                        nm = names[m] if t <= 0.5 else names[m + 1]
                    out_f.append(nm)
            if not spec["loop"]:
                out_f.append(names[-1])
                out_f += [names[-1]] * k                    # hold the last pose as long as the source does
            assert len(out_f) == len(spec["f"]) * (k + 1), (key, len(out_f))
            gen_n = sum(1 for n in out_f if n in frames)
            if gen_n == 0:
                print(f"interpolate: {key:18s} every in-between rejected -> no smooth version", flush=True)
                qa.setdefault("anims", {})[key] = {"k": k, "key": kc, "frames": 0, "generated": 0,
                                                   "rejected": len(rej), "rejects": rej, "dropped": True}
                continue
            plan[key] = {"f": out_f, "fps": spec["fps"] * (k + 1), "k": k, "key": kc}
            qa.setdefault("anims", {})[key] = {"k": k, "key": kc, "fps": spec["fps"] * (k + 1), "frames": len(out_f),
                                               "generated": gen_n, "rejected": len(rej), "rejects": rej}
            print(f"interpolate: {key:18s} k={k} {spec['fps']:>2}->{spec['fps'] * (k + 1):>2} fps  "
                  f"{len(out_f):2d} frames, {len(rej)} rejected", flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    # frames no plan references any more (partial rebuilds) are dropped
    used = {n for p in plan.values() for n in p["f"]}
    frames = {n: v for n, v in frames.items() if n in used}
    json.dump({"model": MODEL, "frames": frames, "plan": plan}, open(ipath, "w"), indent=1)
    tot = sum(v["rejected"] for v in qa.get("anims", {}).values())
    gen = sum(v["generated"] + v["rejected"] for v in qa.get("anims", {}).values())
    qa["summary"] = {"anims": len(plan), "generated": gen, "rejected": tot, "kept_frames": len(frames),
                     "seconds": round(time.time() - t0)}
    json.dump(qa, open(qpath, "w"), indent=1)
    print(f"interpolate: {len(plan)} anims, {len(frames)} new frames, {tot}/{gen} rejected, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
