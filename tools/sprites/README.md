# Trinity sprite pipeline

Turns the five ChatGPT sprite sheets in `../../../tmp/Trinity/` into the habitat atlas at
`assets/habitat/atlas/` (`atlas.json` plus four pages at @1x/@2x, in WebP and PNG). The atlas format is specified in
`docs/habitat/CONTRACT.md` §4. The anim keys come from `assets/js/habitat/sim/rules.js` (`ANIMS`).

## Setup (once, Windows)

```sh
cd tools/sprites
python -m venv .venv
.venv/Scripts/python -m pip install numpy opencv-python-headless pillow
.venv/Scripts/python -m pip install "rembg[cpu]"      # optional, only for qa_iou.py
# Real-ESRGAN (portable, Vulkan GPU):
curl -L -o bin/re.zip https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip
unzip bin/re.zip -d bin && rm bin/re.zip
```

`.venv/`, `bin/` and `out/` are gitignored. `_config.yml` already excludes `tools/` from Jekyll.
If there is no Real-ESRGAN binary or no GPU, step 03 falls back to Lanczos plus an unsharp mask. Pass `--lanczos` to force the fallback.

## Build

```sh
.venv/Scripts/python build.py                 # full build, about 100 s
.venv/Scripts/python build.py --only 3        # re-process sheet 3, then repack and preview
.venv/Scripts/python build.py --row walk_right
.venv/Scripts/python build.py --from 05       # repack and preview only
.venv/Scripts/python build.py --layout grid   # treat sheets as REGEN_SPEC grid sheets
```

| Step | What it does |
|---|---|
| `00_probe.py` | Overlays a grid, the component boxes and the manifest row rects on each sheet (`out/probe/`). Use it to author rects. |
| `01_clean.py` | Per row: builds a magenta-keyed solid mask, then close, fill holes and open. Interior alpha becomes 255, then 1px erode and a 0.8σ feather. Magenta spill in the edge band is replaced from the interior and inpainted. RGB is alpha-bled. In `glow` rows the soft non-magenta glow is kept. Green-keyed sheets (`"key":"#00FF00"`) are chroma-keyed first. |
| `02_slice.py` | Splits each row into exactly N frames. It uses projection gaps first. Where frames touch it cuts a DP min-cost seam, refined by a colour watershed, and trims the neighbour's headphone wedge. Glyphs (`? ! zZ ♪`) stay in their own column. Specks and label slivers are dropped. Glow rows fade to zero at a cut. `cuts:[x…]` in the manifest overrides the split. |
| `03_upscale.py` | Upscales 2x with Real-ESRGAN `realesr-animevideov3`. RGB and alpha go through separate passes. |
| `04_normalize.py` | Applies one global scale: idle_F body = `target.bodyH1x` @1x. Per-row `refH` (and `scaleRef`) keep every row at her real size. The anchor is the feet: bottom of the largest component, plus a row-median feet offset from body centre, so there is no drift. `anchorY:"row"` keeps the sheet's shared ground line (jump, hover, teleport). FX, UI and portraits are anchored at the centre. Frames are padded so @2x is exactly 2x @1x. |
| `05_pack.py` | MaxRects packing (BSSF) with 2px padding and 1px extrusion. Pages: trinity-core, trinity-ext, fx, ui. Writes the WebP pages (push-pull fill under transparency) and quantized PNG fallbacks, plus `atlas.json` with 1/4-res hit masks. WebP quality steps down until the budget holds: total under 1.5 MB, core@2x under 700 KB. |
| `06_preview.py` | Builds `out/preview.html` (player, flags, mirror test), `out/contact.png` and `out/qa.json` from the final WebP pages. Fails if any Trinity frame has more than 0.5% magenta edge px. |
| `qa_iou.py` | Optional. Cross-checks the masks against rembg (u2netp). The last run gave mean IoU 0.91–0.94. |

## Editing

`make_manifest.py` is the authoring source for `manifest.json`. It holds the row rects, `labelRect` blanking, facings, modes,
`refH`, and the animation table (`src` row, frame indices with repeats allowed, fps, loop, flip, ev, facing). Edit it, then
run `python make_manifest.py && python build.py`. You can also hand-edit `manifest.json`, but the script will overwrite it.

Hit mask format (also described in `atlas.json` → `hitMask`): the @1x frame is divided into 4x4 blocks. A block's bit is 1 when any
alpha in it is 128 or more. Bits are row-major with `w4 = ceil(w/4)`, packed MSB-first as one continuous bitstream with no per-row
padding, then base64-encoded.
