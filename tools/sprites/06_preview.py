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
    for key, an in atlas["anims"].items():
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
                fringe = max(fringe, float((halo_mask(im[..., :3]) & edge).sum()) / edge.sum())
        jitter = float(np.std(cxs)) if len(set(an["f"])) > 1 else 0.0
        scale = float(np.median(hs)) / idle_h if hs else 1.0
        out[key] = {"fringe": round(fringe, 4), "jitter": round(jitter, 2), "scale": round(scale, 2)}
    return out, idle_h


def flags_for(key, m):
    f = []
    trin = not key.startswith(("fx_", "ui_", "obj_", "portrait_"))
    if trin and m["fringe"] > 0.005: f.append("fringe")
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
 <label>filter <input id="q" placeholder="walk, fx_, flagged" size="12"></label>
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
    c.innerHTML = `<h3><span>${key}</span><span class="flag">${fl.join(" ")}</span></h3>
      <canvas></canvas><div class="meta">${an.f.length}f @${an.fps}fps ${an.loop?"loop":"once"} ${an.flip?"flip ":""}${an.facing||""} ${an.blend!=="normal"?an.blend:""}
      · fringe ${(QA[key].fringe*100).toFixed(2)}% · jitter ${QA[key].jitter}px · scale ${QA[key].scale}</div>`;
    c.onclick = () => { document.querySelectorAll(".card.sel").forEach(e=>e.classList.remove("sel")); c.classList.add("sel"); tSel = key; };
    grid.appendChild(c);
    cards.push({key, an, cv: c.querySelector("canvas"), el: c, flags: fl});
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
  const res = $("#res").value, k = res==="@2x"?2:1, an = card.an, b = box(an);
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
function frame(t){ for (const c of cards) if (c.el.style.display!=="none") draw(c,t); requestAnimationFrame(frame); }
function filter(){ const q=$("#q").value.trim(); for(const c of cards){ if(c.el.parentNode.id!=="grid") continue; const show = !q || (q==="flagged"? c.flags.length>0 : c.key.includes(q)); c.el.style.display = show?"":"none"; } }
$("#fps").oninput = e => $("#fpsv").textContent = (+e.target.value).toFixed(2);
$("#play").onclick = e => { playing=!playing; e.target.textContent = playing?"pause":"play"; };
$("#prev").onclick = () => { playing=false; $("#play").textContent="play"; step--; };
$("#next").onclick = () => { playing=false; $("#play").textContent="play"; step++; };
$("#q").oninput = filter;
$("#res").onchange = () => loadPages($("#res").value);
build();
const nflag = Object.values(QA).filter(q=>q.flags.length).length;
$("#stat").textContent = `${Object.keys(ATLAS.anims).length} anims · ${Object.keys(ATLAS.frames).length} frames · ${nflag} flagged`;
loadPages("@2x").then(()=>requestAnimationFrame(frame));
</script></body></html>
"""


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
    bad = {k: v["flags"] for k, v in qa.items() if v["flags"]}
    print(f"preview: idle body {idle_h:.0f}px @1x; flagged {len(bad)}: {bad}")
    fr = [k for k, v in qa.items() if "fringe" in v["flags"]]
    if fr:
        raise SystemExit(f"preview: FRINGE > 0.5% on {fr}")


if __name__ == "__main__":
    main()
