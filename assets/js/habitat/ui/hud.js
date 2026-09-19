// HUD overlay: status line with mood portrait, battery, watchers / solo
// badge, sound toggle, event ticker. Full mode also fills the side panel
// (skills with levels, event log).
import { h } from "../util/flags.js";
import { SKILLS } from "../sim/rules.js";
import { drawPlaceholder } from "../render/trinity.js";

const PORTRAIT = { playful: "happy", grateful: "happy", hopeful: "happy", tender: "blush", surprised: "surprised", restless: "wink", melancholy: "sad", solemn: "sad", weary: "sad", curious: "neutral", attentive: "neutral", focused: "neutral", resolute: "neutral", contemplative: "neutral", quiet: "neutral", uncertain: "neutral" };
const PH_EXPR = { happy: "happy", blush: "love", surprised: "surprised", wink: "ear_wiggle", sad: "sad", sleep: "sleep", love: "love", neutral: "idle_F", angry: "angry", laugh: "happy" };

export class Hud {
  constructor(root, stage, mode, sound) {
    this.root = root; this.mode = mode;
    this.portrait = h("canvas.habitat-hud__portrait", { width: 64, height: 64, "aria-hidden": "true" });
    this.statusText = h("span.habitat-hud__text", { text: "Waking the room…" });
    this.status = h("div.habitat-hud__status", null, this.portrait, this.statusText);
    this.batFill = h("span.habitat-hud__batfill");
    this.batPct = h("span.habitat-hud__pct", { text: "--%" });
    this.bat = h("span.habitat-hud__chip.habitat-hud__battery", { title: "Battery" }, h("span.habitat-hud__bat", { "aria-hidden": "true" }, this.batFill), this.batPct);
    this.watch = h("span.habitat-hud__chip.habitat-hud__watch", { text: "" });
    this.clock = h("span.habitat-hud__chip.habitat-hud__clock", { text: "" });
    this.soundBtn = h("button.habitat-hud__chip.habitat-hud__sound", { type: "button", "aria-pressed": "false", "aria-label": "Sound", title: "Sound" });
    this.soundBtn.addEventListener("click", () => { sound.toggle(); this.syncSound(sound); });
    this.sound = sound; this.syncSound(sound);
    this.right = h("div.habitat-hud__right", null, this.clock, this.bat, this.watch, this.soundBtn);
    this.ticker = h("div.habitat-hud__ticker", { "aria-hidden": "true" });
    this.el = h("div.habitat-hud", null, this.status, this.right, this.ticker);
    stage.append(this.el);
    this.live = root.querySelector("[data-hab-live]");
    this.panel = root.querySelector("[data-hab-panel]");
    if (this.panel) {
      this.skillsEl = this.panel.querySelector("[data-hab-skills]");
      this.logEl = this.panel.querySelector("[data-hab-log]");
    }
    this.lastKey = ""; this.tickT = 0; this.atlas = null;
  }
  syncSound(s) {
    this.soundBtn.setAttribute("aria-pressed", s.on ? "true" : "false");
    this.soundBtn.innerHTML = s.on
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
    this.soundBtn.setAttribute("aria-label", s.on ? "Mute sounds" : "Turn sounds on");
  }
  setAtlas(a) { this.atlas = a; this.lastKey = ""; }

  update(d, extra) {
    const w = d.world || {}, status = d.status, energy = Math.round(w.energy ?? 0);
    if (this.statusText.textContent !== status) {
      this.statusText.textContent = status;
      this.status.classList.remove("is-new"); void this.status.offsetWidth; this.status.classList.add("is-new");
      if (this.live) this.live.textContent = "Trinity: " + status;
    }
    this.batPct.textContent = energy + "%";
    this.batFill.style.width = Math.max(4, Math.min(100, energy)) + "%";
    this.bat.dataset.level = energy < 15 ? "low" : energy < 40 ? "mid" : "ok";
    this.bat.classList.toggle("is-charging", /charg|asleep/i.test(status));
    if (d.mode === "live") { const n = (d.presence && d.presence.n) || 1; this.watch.textContent = `${n} watching`; this.watch.classList.remove("is-solo"); this.watch.title = "Visitors in the room right now"; }
    else { this.watch.textContent = "solo view"; this.watch.classList.add("is-solo"); this.watch.title = "Can't reach the live room, so you're watching a local copy of her day"; }
    if (extra && extra.kst) this.clock.textContent = String(extra.kst.h).padStart(2, "0") + ":" + String(extra.kst.mi).padStart(2, "0") + " KST";
    const mood = (w.mood && w.mood.label) || "curious";
    const asleep = /asleep/i.test(status);
    const pkey = asleep ? "sleep" : (w.crowd && w.crowd.annoyance > 0.6) ? "angry" : (w.crowd && w.crowd.affection > 0.75) ? "love" : PORTRAIT[mood] || "neutral";
    const key = pkey + "|" + !!this.atlas;
    if (key !== this.lastKey) { this.lastKey = key; this.drawPortrait(pkey); this.portrait.title = "Mood: " + mood; }
    if (this.skillsEl && w.skills) this.renderSkills(w.skills, d.sim);
  }
  drawPortrait(p) {
    const c = this.portrait.getContext("2d"); c.clearRect(0, 0, 64, 64);
    const a = this.atlas, an = a && a.anims["portrait_" + p], fr = an && a.frames[an.f[0]], pg = fr && a.pages[fr.p];
    if (pg) { const k = Math.min(64 / fr.w, 64 / fr.h); c.drawImage(pg.img, fr.x * pg.res, fr.y * pg.res, fr.w * pg.res, fr.h * pg.res, (64 - fr.w * k) / 2, (64 - fr.h * k) / 2, fr.w * k, fr.h * k); return; }
    c.save(); c.translate(32, 88); c.scale(0.62, 0.62); drawPlaceholder(c, PH_EXPR[p] || "idle_F", 0.3, 1, "F"); c.restore();
  }
  renderSkills(skills, sim) {
    const lv = (xp) => (sim ? sim.brain.levelFor(xp) : 1);
    const keys = Object.keys(skills).filter((k) => SKILLS[k] || skills[k].label);
    const sig = keys.map((k) => k + (skills[k].lvl || lv(skills[k].xp || 0)) + ":" + Math.floor(skills[k].xp || 0)).join();
    if (sig === this.skillSig) return; this.skillSig = sig;
    this.skillsEl.replaceChildren(...keys.map((k) => {
      const xp = skills[k].xp || 0, L = skills[k].lvl || lv(xp), th = [0, 100, 350, 900, 2000], lo = th[L - 1], hi = th[L] ?? th[4];
      const pct = L >= 5 ? 100 : Math.round(((xp - lo) / (hi - lo)) * 100);
      return h("li.habitat-skill", null, h("span.habitat-skill__name", { text: skills[k].label || SKILLS[k].label }), h("span.habitat-skill__lvl", { text: "Lv" + L }),
        h("span.habitat-skill__bar", { role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": (skills[k].label || SKILLS[k].label) + " progress" }, h("span", { style: `width:${pct}%` })));
    }));
  }
  // Room log line (full mode). at = epoch ms; fmt formats it as KST HH:MM.
  log(at, text) {
    if (!this.logEl) return;
    const li = h("li", null, h("time", { text: this.fmt ? this.fmt(at) : "" }), " " + text);
    li.dataset.at = at;
    const after = [...this.logEl.children].find((x) => +x.dataset.at <= at);
    this.logEl.insertBefore(li, after || null);
    while (this.logEl.children.length > 40) this.logEl.lastChild.remove();
  }
  tick(text, at) {
    const item = h("span.habitat-hud__tick", { text });
    this.ticker.append(item);
    while (this.ticker.children.length > 2) this.ticker.firstChild.remove();
    setTimeout(() => item.classList.add("is-out"), 4200);
    setTimeout(() => item.remove(), 5000);
    this.log(at || (this.now ? this.now() : Date.now()), text);
  }
  announce(text) { if (this.live) this.live.textContent = text; }
}
