"""Step 6: QA outputs built from the FINAL atlas (decoded WebP pages).

 - out/preview.html: self-contained player (atlas.json embedded, page images
   loaded by relative path) with checker/dark/light backgrounds, anchor
   crosshair + baseline, onion skin, frame step, fps slider, per-anim flags
   (fringe %, anchor jitter, scale outliers) and a mirror test for flipped
   anims.
 - out/contact.png: static contact sheet, every anim's frames on alternating
   dark/light tiles with the anchor crosshair.
 - out/qa.json: the metrics.
"""
import json
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from common import *

FLIP_SAFE_FACINGS = {"B", "R", "L"}   # rows whose chosen frames show no badge must be verified by eye


def load_pages(atlas):
    pages = {}
    for p, d in atlas["pages"].items():
        pages[p] = np.array(Image.open(os.path.join(ATLAS_DIR, d["@1x"])).convert("RGBA"))
    return pages


def frame_img(pages, fr):
    return pages[fr["p"]][fr["y"]:fr["y"] + fr["h"], fr["x"]:fr["x"] + fr["w"]]


def metrics(atlas, pages):
    frames = atlas["frames"]
    out = {}
    def body(im):
        n, lab, st, _ = cv2.connectedComponentsWithStats((im[..., 3] > 128).astype(np.uint8), 8)
        if n <= 1: return None
        i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        x, y, w, h, _ = st[i]
        return x, y, w, h
    idle = [body(frame_img(pages, frames[f]))[3] for f in atlas["anims"]["idle_F"]["f"]]
    idle_h = float(np.median(idle))
    for key, an0 in atlas["anims"].items():
      for variant in ("src", "s"):
        if variant == "s" and "s" not in an0: continue
        an = an0 if variant == "src" else an0["s"]
        fr_ = []
        cxs, hs = [], []
        fringe = 0.0
        for fn in an["f"]:
            fr = frames[fn]; im = frame_img(pages, fr)
            b = body(im)
            if b:
                x, y, w, h = b
                cxs.append((x + w / 2) - fr["ax"]); hs.append(h)
            a = im[..., 3]
            vis = a > 8
            edge = vis & ~(cv2.erode(vis.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
            edge |= (a > 8) & (a < 250)
            if edge.sum():
                rgb = im[..., :3].astype(np.int32)
                bad = halo_mask(im[..., :3])
                if variant == "s":   # key-green left over from the RIFE re-key
                    bad = bad | ((rgb[..., 1] > np.maximum(rgb[..., 0], rgb[..., 2]) + 40) & (a < 250))
                fringe = max(fringe, float((bad & edge).sum()) / edge.sum())
        jitter = float(np.std(cxs)) if len(set(an["f"])) > 1 else 0.0
        scale = float(np.median(hs)) / idle_h if hs else 1.0
        m = {"fringe": round(fringe, 4), "jitter": round(jitter, 2), "scale": round(scale, 2)}
        if variant == "src":
            out[key] = m
        else:
            out[key]["smooth"] = {**m, "frames": len(an["f"]), "fps": an["fps"], "p": an["p"]}
    return out, idle_h


def flags_for(key, m):
    f = []
    trin = not key.startswith(("fx_", "ui_", "obj_", "portrait_"))
    if trin and m["fringe"] > 0.005: f.append("fringe")
    if trin and m.get("smooth") and m["smooth"]["fringe"] > 0.005: f.append("smooth-fringe")
    if key.startswith(("idle", "walk", "run")) and m["jitter"] > 2.5: f.append("jitter")
    if key.startswith(("idle", "walk", "run", "sit", "happy", "sad", "angry", "listen", "wave")) and \
            not (0.85 <= m["scale"] <= 1.12): f.append("scale")
    return f


def contact(atlas, pages, qa, path):
    frames, anims = atlas["frames"], atlas["anims"]
    tiles = []
    for key in anims:
        uniq = []
        for f in anims[key]["f"]:
            if f not in uniq: uniq.append(f)
        tiles.append((key, uniq, anims[key]["flip"]))
    W = 1800
    font = ImageFont.load_default()
    rows, x, rh, y = [], 0, 0, 0
    layout = []
    for key, uniq, flip in tiles:
        ws = [frames[f]["w"] for f in uniq]; hs = [frames[f]["h"] for f in uniq]
        tw = sum(ws) + 4 * len(ws) + 8; th = max(hs) + 18
        if x + tw > W: x = 0; y += rh + 6; rh = 0
        layout.append((key, uniq, flip, x, y, tw, th)); x += tw + 6; rh = max(rh, th)
    H = y + rh + 6
    canvas = Image.new("RGB", (W, H), (60, 60, 70))
    d = ImageDraw.Draw(canvas)
    for n, (key, uniq, flip, x, y, tw, th) in enumerate(layout):
        base = max(frames[f]["ay"] for f in uniq)
        xx = x + 4
        for k, f in enumerate(uniq):
            fr = frames[f]; im = Image.fromarray(frame_img(pages, fr).copy())
            ax = fr["ax"]
            if flip:
                im = im.transpose(Image.FLIP_LEFT_RIGHT); ax = fr["w"] - ax
            dark = (k + n) % 2 == 0
            bg = Image.new("RGBA", (fr["w"], max(frames[g]["h"] for g in uniq)),
                           (22, 22, 30, 255) if dark else (238, 238, 238, 255))
            oy = base - fr["ay"]
            bg.alpha_composite(im, (0, max(0, oy)))
            canvas.paste(bg.convert("RGB"), (xx, y + 16))
            cy = y + 16 + max(0, oy) + fr["ay"]
            d.line([(xx + ax - 5, cy), (xx + ax + 5, cy)], fill=(0, 220, 255))
            d.line([(xx + ax, cy - 5), (xx + ax, cy + 5)], fill=(0, 220, 255))
            xx += fr["w"] + 4
        fl = flags_for(key, qa[key])
        label = key + (" [flip]" if flip else "") + (" !" + ",".join(fl) if fl else "")
        d.text((x + 4, y + 2), label, fill=(255, 90, 90) if fl else (255, 235, 120), font=font)
    canvas.save(path, optimize=True)


HTML = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Trinity Atlas QA</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#15151c;--fg:#e8e8ef;--mut:#9a9aae;--card:#20202a;--bad:#ff6b6b;--ok:#7ee0a8}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f4f4f7;--fg:#1c1c24;--mut:#62627a;--card:#fff}}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 16px;border-bottom:1px solid #8883;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
header label{display:flex;gap:4px;align-items:center;color:var(--mut)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:12px 16px}
.card{background:var(--card);border-radius:8px;padding:8px;border:1px solid #8882}
.card.sel{outline:2px solid #6cf}
.card h3{margin:0 0 4px;font-size:13px;display:flex;justify-content:space-between;gap:6px}
.card .meta{color:var(--mut);font-size:11px}
.flag{color:var(--bad);font-weight:600}
canvas{display:block;max-width:100%;height:auto;border-radius:4px;margin:auto}
.mir{display:flex;gap:4px}.mir canvas{max-width:50%}
.sbs{display:flex;gap:6px;align-items:flex-end;justify-content:center}.sbs>div{flex:1;min-width:0;text-align:center}
.sbs .lab{font-size:10px;color:var(--mut)}.card button.v{font-size:10px;padding:0 5px}
.card.nos .sm{display:none}
h2{padding:0 16px;margin:18px 0 0;font-size:15px}
</style></head><body>
<header>
 <strong>Trinity atlas QA</strong>
 <label>bg <select id="bg"><option>checker</option><option>dark</option><option>light</option></select></label>
 <label>scale <select id="res"><option value="@1x">@1x</option><option value="@2x" selected>@2x</option></select></label>
 <label><input type="checkbox" id="anc" checked> anchor + baseline</label>
 <label><input type="checkbox" id="onion"> onion skin</label>
 <label>fps x<input type="range" id="fps" min="0" max="3" step="0.05" value="1"><span id="fpsv">1.00</span></label>
 <button id="play">pause</button><button id="prev">&larr; frame</button><button id="next">frame &rarr;</button>
 <label>view <select id="view"><option value="both">source | smooth</option><option value="src">source only</option><option value="s">smooth only</option></select></label>
 <label>filter <input id="q" placeholder="walk, fx_, flagged, smooth" size="12"></label>
 <span id="stat" class="meta"></span>
</header>
<main id="grid"></main>
<h2>Mirror test (flipped anims: source vs mirrored — the TR badge must not appear)</h2>
<main id="mirror"></main>
<script>
const ATLAS = __ATLAS__;
const QA = __QA__;
const BASE = "__BASE__";
const imgs = {};
let playing = true, step = 0, tSel = null;
const $ = s => document.querySelector(s);
function loadPages(res){
  return Promise.all(Object.entries(ATLAS.pages).map(([p,d]) => new Promise(r => {
    const im = new Image(); im.onload = () => { imgs[p] = im; r(); }; im.onerror = () => { const i2 = new Image(); i2.onload=()=>{imgs[p]=i2;r();}; i2.src = BASE + d.png[res]; }; im.src = BASE + d[res];
  })));
}
function checker(ctx,w,h){ const s=8; for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){ctx.fillStyle=((x+y)/s)%2?"#c8c8cc":"#8e8e96";ctx.fillRect(x,y,s,s);} }
const cards = [];
function build(){
  const grid = $("#grid"), mir = $("#mirror");
  for (const [key, an] of Object.entries(ATLAS.anims)){
    const fl = QA[key].flags;
    const c = document.createElement("div"); c.className = "card"; c.dataset.key = key;
    const sm = an.s ? {...an, f: an.s.f, fps: an.s.fps} : null, q = QA[key], qs = q.smooth;
    c.innerHTML = `<h3><span>${key}</span><span>${sm ? '<button class="v" title="per-anim view: both / source / smooth">src|smooth</button> ' : ""}<span class="flag">${fl.join(" ")}</span></span></h3>
      <div class="sbs"><div class="src"><canvas></canvas>${sm ? '<div class="lab">source</div>' : ""}</div>${sm ? '<div class="sm"><canvas></canvas><div class="lab">smooth (RIFE)</div></div>' : ""}</div>
      <div class="meta">${an.f.length}f @${an.fps}fps ${an.loop?"loop":"once"} ${an.flip?"flip ":""}${an.facing||""} ${an.blend!=="normal"?an.blend:""}
      · fringe ${(q.fringe*100).toFixed(2)}% · jitter ${q.jitter}px · scale ${q.scale}
      ${qs ? `<br>smooth: ${an.s.f.length}f @${an.s.fps}fps on ${an.s.p} · fringe ${(qs.fringe*100).toFixed(2)}% · jitter ${qs.jitter}px` : ""}</div>`;
    c.onclick = () => { document.querySelectorAll(".card.sel").forEach(e=>e.classList.remove("sel")); c.classList.add("sel"); tSel = key; };
    grid.appendChild(c);
    const [cvS, cvM] = c.querySelectorAll("canvas");
    const card = {key, an, cv: cvS, el: c, flags: fl, smooth: !!sm, view: null};
    cards.push(card);
    if (sm) {
      const mc = {key, an: sm, cv: cvM, el: c, flags: fl, isSmooth: true, parent: card};
      cards.push(mc);
      c.querySelector("button.v").onclick = (e) => { e.stopPropagation(); card.view = {null:"src", src:"s", s:"both", both:"src"}[card.view] ; applyView(); };
    }
    if (an.flip){
      const m = document.createElement("div"); m.className="card";
      m.innerHTML = `<h3><span>${key}</span><span class="meta">source | mirrored</span></h3><div class="mir"><canvas></canvas><canvas></canvas></div>`;
      mir.appendChild(m);
      const [a,b] = m.querySelectorAll("canvas");
      cards.push({key, an:{...an, flip:false}, cv:a, el:m, flags:[]}); cards.push({key, an, cv:b, el:m, flags:[]});
    }
  }
}
function box(an){ let w=0,up=0,down=0; for(const f of an.f){const fr=ATLAS.frames[f]; w=Math.max(w,fr.ax,fr.w-fr.ax); up=Math.max(up,fr.ay); down=Math.max(down,fr.h-fr.ay);} return {w:2*w+16,h:up+down+16,up:up+8,down}; }
function draw(card, t){
  const res = $("#res").value, k = res==="@2x"?2:1, an = card.an, b = box(an.s ? {...an, f: an.f.concat(an.s.f)} : an);
  card.cv.style.width = b.w + "px";
  const cv = card.cv; if (cv.width !== b.w*k){ cv.width = b.w*k; cv.height = b.h*k; }
  const ctx = cv.getContext("2d"); const bg = $("#bg").value;
  if (bg==="checker") checker(ctx,cv.width,cv.height); else { ctx.fillStyle = bg==="dark"?"#16161e":"#efefef"; ctx.fillRect(0,0,cv.width,cv.height); }
  const n = an.f.length, fps = an.fps * parseFloat($("#fps").value);
  let i = playing ? Math.floor(t/1000*fps) : step; i = an.loop ? ((i % n)+n)%n : Math.min(Math.max(i,0), n-1);
  if (!playing && !an.loop) i = ((step % n)+n)%n;
  const ox = b.w/2*k, oy = b.up*k;
  const put = (fname, alpha) => {
    const fr = ATLAS.frames[fname], im = imgs[fr.p]; if (!im) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = an.blend==="lighter"?"lighter":"source-over";
    ctx.translate(ox, oy); if (an.flip) ctx.scale(-1,1);
    ctx.drawImage(im, fr.x*k, fr.y*k, fr.w*k, fr.h*k, -fr.ax*k, -fr.ay*k, fr.w*k, fr.h*k); ctx.restore();
  };
  if ($("#onion").checked && n>1) put(an.f[(i-1+n)%n], 0.3);
  put(an.f[i], 1);
  if ($("#anc").checked){ ctx.strokeStyle="#00d4ff"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,oy+.5); ctx.lineTo(cv.width,oy+.5); ctx.moveTo(ox+.5,oy-8*k); ctx.lineTo(ox+.5,oy+8*k); ctx.stroke(); }
}
function applyView(){
  for (const c of cards) if (c.smooth) {
    const v = c.view || $("#view").value, src = c.el.querySelector(".src"), sm = c.el.querySelector(".sm");
    src.style.display = v === "s" ? "none" : ""; sm.style.display = v === "src" ? "none" : "";
  }
}
function visible(c){ if (c.el.style.display==="none") return false; const box = c.cv.parentNode; return !box.classList || (box.style.display!=="none"); }
function frame(t){ for (const c of cards) if (visible(c)) draw(c,t); requestAnimationFrame(frame); }
function filter(){ const q=$("#q").value.trim(); for(const c of cards){ if(c.el.parentNode.id!=="grid") continue; const show = !q || (q==="flagged"? c.flags.length>0 : q==="smooth" ? !!c.an.s : c.key.includes(q)); c.el.style.display = show?"":"none"; } }
$("#fps").oninput = e => $("#fpsv").textContent = (+e.target.value).toFixed(2);
$("#play").onclick = e => { playing=!playing; e.target.textContent = playing?"pause":"play"; };
$("#prev").onclick = () => { playing=false; $("#play").textContent="play"; step--; };
$("#next").onclick = () => { playing=false; $("#play").textContent="play"; step++; };
$("#q").oninput = filter;
$("#view").onchange = () => { for (const c of cards) c.view = null; applyView(); };
$("#res").onchange = () => loadPages($("#res").value);
build();
const nflag = Object.values(QA).filter(q=>q.flags.length).length;
const nsm = Object.values(ATLAS.anims).filter(a=>a.s).length;
$("#stat").textContent = `${Object.keys(ATLAS.anims).length} anims (${nsm} smoothed) · ${Object.keys(ATLAS.frames).length} frames · ${nflag} flagged`;
loadPages("@2x").then(()=>requestAnimationFrame(frame));
</script></body></html>
"""


COMPARE = ["walk_F", "walk_R", "idle_F", "hack", "dance"]


def compare(atlas, keys, outd):
    """out/compare_<anim>.webp/.gif (animated, one tick per smooth frame,
    source left / smooth right, 2 cycles) and compare_<anim>.png (static:
    source frames on top at their timing, every smooth frame below), @2x."""
    pages2 = {p: Image.open(os.path.join(ATLAS_DIR, d["@2x"])).convert("RGBA") for p, d in atlas["pages"].items()}
    frames = atlas["frames"]
    font = ImageFont.load_default()
    written = []
    for key in keys:
        an = atlas["anims"].get(key)
        if not an or "s" not in an: continue
        sf, n = an["s"]["f"], len(an["f"])
        per = len(sf) // n                                   # ticks per source frame
        allf = an["f"] + sf
        up = max(frames[f]["ay"] for f in allf) * 2 + 8
        dn = max(frames[f]["h"] - frames[f]["ay"] for f in allf) * 2 + 8
        half = max(max(frames[f]["ax"], frames[f]["w"] - frames[f]["ax"]) for f in allf) * 2 + 8
        cw, ch = 2 * half, up + dn

        def cell(fn, bg):
            fr = frames[fn]
            im = pages2[fr["p"]].crop((2 * fr["x"], 2 * fr["y"], 2 * (fr["x"] + fr["w"]), 2 * (fr["y"] + fr["h"])))
            if an["flip"]: im = im.transpose(Image.FLIP_LEFT_RIGHT)
            ax = (fr["w"] - fr["ax"]) if an["flip"] else fr["ax"]
            c = Image.new("RGBA", (cw, ch), bg)
            c.alpha_composite(im, (half - 2 * ax, up - 2 * fr["ay"]))
            return c
        bg = (34, 34, 44, 255)
        # animated side by side
        anim = []
        for i in range(len(sf) * 2):
            j = i % len(sf)
            c = Image.new("RGBA", (2 * cw + 6, ch + 16), (20, 20, 26, 255))
            c.alpha_composite(cell(an["f"][j // per], bg), (0, 16))
            c.alpha_composite(cell(sf[j], bg), (cw + 6, 16))
            d = ImageDraw.Draw(c)
            d.text((4, 2), f"source {an['fps']} fps", fill=(255, 230, 120), font=font)
            d.text((cw + 10, 2), f"smooth {an['s']['fps']} fps", fill=(126, 224, 168), font=font)
            d.line([(0, 16 + up), (2 * cw + 6, 16 + up)], fill=(0, 160, 200))
            anim.append(c)
        dur = int(round(1000.0 / an["s"]["fps"]))
        base = os.path.join(outd, f"compare_{key}")
        anim[0].save(base + ".webp", save_all=True, append_images=anim[1:], duration=dur, loop=0, quality=90, method=4)
        pal = [im.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT) for im in anim]
        pal[0].save(base + ".gif", save_all=True, append_images=pal[1:], duration=max(20, dur // 10 * 10), loop=0, disposal=1)
        # static strip: row 1 source (each at its tick), row 2 smooth; generated frames tinted bg
        cols = len(sf)
        strip = Image.new("RGBA", (cols * (cw + 2), 2 * (ch + 16)), (20, 20, 26, 255))
        d = ImageDraw.Draw(strip)
        for j, fn in enumerate(sf):
            x = j * (cw + 2)
            if j % per == 0:
                strip.alpha_composite(cell(an["f"][j // per], bg), (x, 16))
                d.text((x + 2, 2), an["f"][j // per][-12:], fill=(255, 230, 120), font=font)
            gen = frames[fn]["p"].startswith("trinity-smooth")
            strip.alpha_composite(cell(fn, (58, 38, 44, 255) if gen else bg), (x, ch + 32))
            d.text((x + 2, ch + 18), ("* " if gen else "") + fn.split("_s")[-1][-10:] if gen else fn[-12:],
                   fill=(126, 224, 168) if gen else (255, 230, 120), font=font)
            d.line([(x, 16 + up), (x + cw, 16 + up)], fill=(0, 160, 200))
            d.line([(x, ch + 32 + up), (x + cw, ch + 32 + up)], fill=(0, 160, 200))
        strip.convert("RGB").save(base + ".png", optimize=True)
        written += [base + ".webp", base + ".gif", base + ".png"]
    return written


def main():
    atlas = json.load(open(os.path.join(ATLAS_DIR, "atlas.json")))
    pages = load_pages(atlas)
    qa, idle_h = metrics(atlas, pages)
    for k in qa: qa[k]["flags"] = flags_for(k, qa[k])
    json.dump(qa, open(os.path.join(OUT, "qa.json"), "w"), indent=1)
    contact(atlas, pages, qa, os.path.join(OUT, "contact.png"))
    base = os.path.relpath(ATLAS_DIR, OUT).replace("\\", "/") + "/"
    html = HTML.replace("__ATLAS__", json.dumps(atlas)).replace("__QA__", json.dumps(qa)).replace("__BASE__", base)
    open(os.path.join(OUT, "preview.html"), "w", encoding="utf-8").write(html)
    cmp_files = compare(atlas, COMPARE, OUT)
    if cmp_files: print("preview: comparisons", ", ".join(os.path.basename(f) for f in cmp_files))
    bad = {k: v["flags"] for k, v in qa.items() if v["flags"]}
    print(f"preview: idle body {idle_h:.0f}px @1x; flagged {len(bad)}: {bad}")
    fr = [k for k, v in qa.items() if "fringe" in v["flags"] or "smooth-fringe" in v["flags"]]
    if fr:
        raise SystemExit(f"preview: FRINGE > 0.5% on {fr}")


if __name__ == "__main__":
    main()
