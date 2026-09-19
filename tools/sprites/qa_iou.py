"""Optional QA: IoU of our cleaned body masks vs rembg (u2netp) on the same
source crops. Needs `pip install rembg[cpu]` (first run downloads ~5 MB).
  python qa_iou.py [row ...]      (default: a few Trinity rows)"""
import sys, json
import numpy as np
from PIL import Image
from common import *

def main():
    try:
        from rembg import remove, new_session
    except Exception as e:
        sys.exit(f"qa_iou: rembg unavailable ({e})")
    sess = new_session("u2netp")
    man = load_manifest(); idx = json.load(open(os.path.join(OUT, "frames", "index.json")))
    rows = sys.argv[1:] or ["idle_front", "walk_right", "sit", "scan", "hurt"]
    res = {}
    for rid in rows:
        row = next(r for r in man["rows"] if r["id"] == rid)
        src = load_sheet(man, row["sheet"])
        ious = []
        for f in idx[rid]:
            ours = load_rgba(os.path.join(OUT, "frames", f["name"] + ".png"))[..., 3] > 128
            crop = src[f["sy"]:f["sy"] + f["h"], f["sx"]:f["sx"] + f["w"]]
            bg = np.full(crop.shape[:2] + (3,), 255, np.uint8)
            al = crop[..., 3:4] / 255.0
            comp = (crop[..., :3] * al + bg * (1 - al)).astype(np.uint8)
            theirs = np.array(remove(Image.fromarray(comp), session=sess))[..., 3] > 128
            ious.append(float((ours & theirs).sum()) / max(1, (ours | theirs).sum()))
        res[rid] = round(float(np.mean(ious)), 3)
        print(f"qa_iou: {rid:12s} mean IoU {res[rid]}")
    json.dump(res, open(os.path.join(OUT, "qa_iou.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
