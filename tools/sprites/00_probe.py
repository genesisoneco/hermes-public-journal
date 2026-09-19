"""Probe overlay: draws a coordinate grid, connected-component boxes of the
solid body mask and (if present) the manifest row rects on each sheet, so
row rects can be hand-authored. Output: out/probe/sheet<N>.png"""
import sys, argparse
import numpy as np, cv2
from common import *

def probe(man, sid):
    rgba = load_sheet(man, sid)
    a = rgba[..., 3]
    solid = (a >= 150) & ~magenta_mask(rgba[..., :3])
    vis = np.full(rgba.shape[:2] + (3,), 30, np.uint8)
    al = a[..., None].astype(np.float32) / 255
    vis = (rgba[..., :3] * al + vis * (1 - al)).astype(np.uint8)
    vis = cv2.cvtColor(vis, cv2.COLOR_RGB2BGR)
    H, W = a.shape
    for x in range(0, W, 50):
        cv2.line(vis, (x, 0), (x, H), (80, 80, 80) if x % 100 else (140, 140, 140), 1)
        if x % 100 == 0: cv2.putText(vis, str(x), (x + 2, 10), cv2.FONT_HERSHEY_PLAIN, 0.8, (0, 255, 255), 1)
    for y in range(0, H, 50):
        cv2.line(vis, (0, y), (W, y), (80, 80, 80) if y % 100 else (140, 140, 140), 1)
        if y % 100 == 0: cv2.putText(vis, str(y), (2, y - 2), cv2.FONT_HERSHEY_PLAIN, 0.8, (0, 255, 255), 1)
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid.astype(np.uint8), 8)
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if ar < 150: continue
        cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 200, 0), 1)
    for row in man["rows"]:
        if str(row["sheet"]) != str(sid): continue
        x, y, w, h = row["rect"]
        cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 0, 255), 2)
        cv2.putText(vis, f'{row["id"]}/{row["frames"]}', (x + 3, y + 14), cv2.FONT_HERSHEY_PLAIN, 1.0, (0, 255, 255), 1)
    out = ensure(os.path.join(OUT, "probe"))
    cv2.imwrite(os.path.join(out, f"sheet{sid}.png"), vis)
    # column/row projections of the solid mask (as text-free strip plots)
    return os.path.join(out, f"sheet{sid}.png")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); a = ap.parse_args()
    man = load_manifest()
    for sid in man["sheets"]:
        if a.only and a.only != sid: continue
        print(probe(man, sid))
