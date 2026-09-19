// Synthesized WebAudio blips. Muted by default; the choice is remembered.
import { lsGet, lsSet } from "../util/flags.js";

const KEY = "doaia-habitat-sound";
const TUNES = {
  poke: [[660, 0.06], [880, 0.08]], tickle: [[880, 0.05], [990, 0.05], [1175, 0.07]], pet: [[523, 0.12], [659, 0.16]],
  wave: [[784, 0.07], [988, 0.1]], feed: [[587, 0.06], [740, 0.06], [880, 0.1]], push: [[330, 0.08], [220, 0.14]],
  toss: [[440, 0.05], [660, 0.08]], level: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]], angry: [[220, 0.12], [196, 0.14]],
  asleep: [[392, 0.2]], step: [[180, 0.02]], land: [[140, 0.08]], pop: [[1200, 0.03]],
};

export class Sound {
  constructor() { this.on = lsGet(KEY) === "1"; this.ctx = null; }
  toggle() { this.on = !this.on; lsSet(KEY, this.on ? "1" : "0"); if (this.on) this.play("pop"); }
  play(name, vol = 0.07) {
    if (!this.on) return;
    const seq = TUNES[name]; if (!seq) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx; if (c.state === "suspended") c.resume();
      let t = c.currentTime;
      for (const [f, d] of seq) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = name === "push" || name === "angry" ? "triangle" : "sine";
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.06, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.06); t += d * 0.9;
      }
    } catch (e) { /* audio unavailable */ }
  }
}
