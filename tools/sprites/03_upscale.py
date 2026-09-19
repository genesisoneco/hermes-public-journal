"""Step 3: 2x upscale of every sliced frame.

Real-ESRGAN (ncnn-vulkan, model realesr-animevideov3) runs twice: once on the
alpha-bled RGB, once on the alpha channel rendered as greyscale. If the
binary or the GPU is unavailable we fall back to Lanczos + light unsharp mask
(pass --lanczos to force it). Output: out/up/<frame>.png (RGBA, exactly 2x).
"""
import argparse, glob, shutil, subprocess, json
import numpy as np, cv2
from PIL import Image
from common import *

PAD = 8
EXE = os.path.join(BIN, "realesrgan-ncnn-vulkan.exe" if os.name == "nt" else "realesrgan-ncnn-vulkan")


def lanczos2x(img):
    up = cv2.resize(img, (img.shape[1] * 2, img.shape[0] * 2), interpolation=cv2.INTER_LANCZOS4)
    blur = cv2.GaussianBlur(up, (0, 0), 1.0)
    return cv2.addWeighted(up, 1.35, blur, -0.35, 0)


def run_esrgan(src_dir, dst_dir):
    ensure(dst_dir)
    cmd = [EXE, "-i", src_dir, "-o", dst_dir, "-n", "realesr-animevideov3", "-s", "2", "-f", "png"]
    r = subprocess.run(cmd, cwd=BIN, capture_output=True, text=True)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only"); ap.add_argument("--row"); ap.add_argument("--lanczos", action="store_true")
    a = ap.parse_args()
    man = load_manifest()
    rows = [r for r in man["rows"] if r.get("mode") != "skip"
            and (not a.only or str(r["sheet"]) == a.only) and (not a.row or r["id"] == a.row)]
    index = json.load(open(os.path.join(OUT, "frames", "index.json")))
    names = [f["name"] for r in rows for f in index.get(r["id"], [])]
    tmp = os.path.join(OUT, "_up_tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    for d in ("rgb", "a", "rgb2", "a2"): ensure(os.path.join(tmp, d))
    shapes = {}
    for n in names:
        im = load_rgba(os.path.join(OUT, "frames", n + ".png"))
        rgb = cv2.copyMakeBorder(im[..., :3], PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE)
        al = cv2.copyMakeBorder(im[..., 3], PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=0)
        shapes[n] = im.shape[:2]
        Image.fromarray(rgb).save(os.path.join(tmp, "rgb", n + ".png"))
        Image.fromarray(np.dstack([al] * 3)).save(os.path.join(tmp, "a", n + ".png"))
    use_esr = not a.lanczos and os.path.exists(EXE)
    if use_esr:
        ok = run_esrgan(os.path.join(tmp, "rgb"), os.path.join(tmp, "rgb2")) and \
             run_esrgan(os.path.join(tmp, "a"), os.path.join(tmp, "a2"))
        if not ok:
            print("upscale: Real-ESRGAN failed, falling back to Lanczos")
            use_esr = False
    outd = ensure(os.path.join(OUT, "up"))
    for n in names:
        h, w = shapes[n]
        if use_esr and os.path.exists(os.path.join(tmp, "rgb2", n + ".png")):
            rgb = np.array(Image.open(os.path.join(tmp, "rgb2", n + ".png")).convert("RGB"))
            al = np.array(Image.open(os.path.join(tmp, "a2", n + ".png")).convert("L"))
        else:
            src = load_rgba(os.path.join(OUT, "frames", n + ".png"))
            rgb = lanczos2x(cv2.copyMakeBorder(src[..., :3], PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE))
            al = lanczos2x(cv2.copyMakeBorder(src[..., 3], PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=0))
        rgb = rgb[2 * PAD:2 * PAD + 2 * h, 2 * PAD:2 * PAD + 2 * w]
        al = al[2 * PAD:2 * PAD + 2 * h, 2 * PAD:2 * PAD + 2 * w].astype(np.int32)
        # tidy the upscaled alpha: kill haze, snap near-opaque to opaque
        al = np.where(al < 10, 0, np.where(al > 244, 255, al)).astype(np.uint8)
        save_rgba(np.dstack([rgb, al]), os.path.join(outd, n + ".png"))
    shutil.rmtree(tmp, ignore_errors=True)
    print("upscale:", len(names), "frames via", "Real-ESRGAN" if use_esr else "Lanczos")


if __name__ == "__main__":
    main()
