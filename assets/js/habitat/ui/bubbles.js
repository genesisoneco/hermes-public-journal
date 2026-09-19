// DOM speech / thought bubbles anchored above Trinity's head.
import { h } from "../util/flags.js";

export class Bubbles {
  constructor(stage) {
    this.el = h("div.habitat-bubble", { "aria-hidden": "true" });
    this.txt = h("span.habitat-bubble__text");
    this.el.append(this.txt);
    stage.append(this.el);
    this.until = 0; this.stage = stage;
  }
  show(text, style = "speech", ttl = 3500) {
    if (!text) return;
    this.txt.textContent = text;
    this.el.dataset.style = style;
    this.el.classList.remove("is-on"); void this.el.offsetWidth; this.el.classList.add("is-on");
    this.until = performance.now() + Math.max(1800, Math.min(7000, ttl));
  }
  hide() { this.el.classList.remove("is-on"); this.until = 0; }
  // x,y = css px of the head top inside the stage.
  place(x, y, w, hgt) {
    if (this.until && performance.now() > this.until) this.hide();
    if (!this.until) return;
    const bw = this.el.offsetWidth || 120, bh = this.el.offsetHeight || 40;
    const cx = Math.max(bw / 2 + 8, Math.min(w - bw / 2 - 8, x));
    const cy = Math.max(bh + 44, Math.min(hgt - 8, y - 6));
    this.el.style.transform = `translate(${Math.round(cx - bw / 2)}px, ${Math.round(cy - bh)}px)`;
    this.el.style.setProperty("--tail", Math.round(Math.max(14, Math.min(bw - 14, x - (cx - bw / 2)))) + "px");
  }
}
