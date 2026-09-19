"""Trinity sprite pipeline driver: 01_clean -> 02_slice -> 03_upscale ->
04_normalize -> 05_pack -> 06_preview.

  python build.py                    # everything
  python build.py --only 3           # re-process sheet 3 only, then repack + preview
  python build.py --row walk_right   # one manifest row, then repack + preview
  python build.py --layout grid      # treat sheets as REGEN_SPEC grid sheets
  python build.py --lanczos          # skip Real-ESRGAN (CPU fallback)
  python build.py --from 05          # start at a step (reuse earlier outputs)
"""
import argparse, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = ["01_clean", "02_slice", "03_upscale", "04_normalize", "05_pack", "06_preview"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="sheet id")
    ap.add_argument("--row", help="manifest row id")
    ap.add_argument("--layout", choices=["freeform", "grid"])
    ap.add_argument("--lanczos", action="store_true")
    ap.add_argument("--from", dest="start", default="01")
    ap.add_argument("--quality", type=int)
    a = ap.parse_args()
    env = dict(os.environ)
    if a.layout == "grid":
        env["SPRITES_LAYOUT"] = "grid"
    t0 = time.time()
    for step in STEPS:
        if step[:2] < a.start[:2]:
            continue
        args = [sys.executable, os.path.join(HERE, step + ".py")]
        if step in STEPS[:4]:
            if a.only: args += ["--only", a.only]
            if a.row: args += ["--row", a.row]
        if step == "03_upscale" and a.lanczos: args.append("--lanczos")
        if step == "05_pack" and a.quality: args += ["--quality", str(a.quality)]
        print(f"== {step}", flush=True)
        r = subprocess.run(args, cwd=HERE, env=env)
        if r.returncode:
            sys.exit(f"build: {step} failed ({r.returncode})")
    print(f"build: done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
