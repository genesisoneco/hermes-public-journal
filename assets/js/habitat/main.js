// Trinity's Live Habitat — client engine entry. habitat-boot.js imports this
// lazily and calls mount(el, {mode, api, base}). See docs/habitat/CONTRACT.md.
import { readFlags, makeClock, h } from "./util/flags.js";
import { sim } from "./util/sim.js";
import { Scene, drawItemShape } from "./render/scene.js";
import { loadAtlas } from "./render/loader.js";
import { Director } from "./net/sync.js";
import { Offline } from "./net/offline.js";
import { Socket } from "./net/socket.js";
import { endpoints, gestureMsg } from "./net/protocol.js";
import { Hud } from "./ui/hud.js";
import { Bubbles } from "./ui/bubbles.js";
import { Sound } from "./ui/sound.js";
import { bindInput } from "./ui/input.js";
import { bindTray } from "./ui/tray.js";
import { bindControls } from "./ui/controls.js";
import { SKILLS } from "./sim/rules.js";

const PAST = { write_journal: "wrote today's entry", code: "tinkered with code", read_archive: "re-read old entries", research_scan: "scanned the news", tend_plants: "tended her plants", stargaze: "watched the stars", dance: "danced", listen_music: "listened to music", make_tea: "made tea", tidy_up: "tidied up", repair: "fixed something", think: "sat and thought", wander: "wandered around", hover_practice: "practised hovering", teleport_practice: "practised teleporting", play_ball: "played with a ball", charge: "recharged in her pod", sleep: "fell asleep", away: "stepped out" };
const VERB = { poke: "poked her", pet: "petted her", tickle: "tickled her", wave: "waved", push: "gave her a push", feed: "fed her", toss: "tossed her something" };

export async function mount(el, opts = {}) {
  const mode = opts.mode || el.dataset.mode || "embed";
  const base = opts.base || el.dataset.base || "/assets/";
  const flags = readFlags();
  const clock = makeClock(flags);
  const mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = !!(mq && mq.matches);
  let extT = 0, raf = 0, last = performance.now(), dirty = true, visible = true, hudT = 0, running = false, ready = false;

  // --- DOM ----------------------------------------------------------------
  const stage = el.querySelector("[data-hab-stage]") || el.appendChild(h("div.habitat__stage", { "data-hab-stage": "" }));
  const cv = h("canvas.habitat__canvas", { "aria-hidden": "true" });
  stage.prepend(cv);
  stage.tabIndex = 0;
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-roledescription", "interactive room");
  stage.setAttribute("aria-label", "Trinity's room. Keys: P poke, T tickle, H pet, W wave, S or arrow keys push.");
  const sound = new Sound();
  const hud = new Hud(el, stage, mode, sound);
  const bubbles = new Bubbles(stage);

  const director = new Director(sim, clock);
  const scene = new Scene(cv, { mode, reduced });
  scene.resize();

  loadAtlas(base, Math.min(2, window.devicePixelRatio || 1), () => { dirty = true; }).then((a) => {
    if (!a) return;
    scene.setAtlas(a); hud.setAtlas(a); dirty = true;
    el.classList.add("has-atlas");
    for (const b of el.querySelectorAll("[data-item]")) paintItemIcon(b, a);
  });

  // --- networking ---------------------------------------------------------
  let offline = null, socket = null, fallbackT = 0, closeT = 0;
  const startOffline = () => {
    if (offline) return;
    offline = new Offline(sim, director, clock, flags); offline.start();
    el.dataset.net = "offline"; dirty = true;
  };
  const stopOffline = () => { if (offline) { offline.stop(); offline = null; } };
  if (flags.net === "offline") queueMicrotask(startOffline); // after listeners are wired
  else {
    const ep = endpoints(opts.api || el.dataset.api);
    socket = new Socket(ep.ws, (m) => {
      if (m.t === "hello") { if (!clock.frozen && m.now) clock.setOffset(m.now - Date.now()); return; }
      if (m.t === "snap") { stopOffline(); director.mode = "live"; el.dataset.net = "live"; clearTimeout(fallbackT); }
      if (director.mode === "live") director.handle(m);
      dirty = true;
    }, (st) => {
      // Arm once per outage: re-arming on every failed retry pushed solo view out to ~8 s.
      if (st === "open") { clearTimeout(closeT); closeT = 0; }
      if (st === "closed" && !offline && !closeT) closeT = setTimeout(() => { closeT = 0; if (!socket.open) startOffline(); }, 3000);
    });
    socket.connect();
    fallbackT = setTimeout(() => { if (director.mode !== "live") startOffline(); }, 4000);
  }
  // Periodically try the live world again while we're in solo view.
  const retryT = setInterval(() => { if (offline && socket && !socket.open) socket.connect(); }, 60e3);

  // --- events → bubbles / fx / ticker / sound -----------------------------
  director.on("say", (s) => { bubbles.show(s.text, s.style, s.ttl); dirty = true; });
  director.on("fx", (f) => { scene.fx(f.fx, f.at); });
  director.on("state", () => { dirty = true; });
  director.on("err", (e) => { if (e.code === "rate_limited") hud.tick("easy — she needs a second"); if (e.code === "shielded") hud.tick("her shield is up"); });
  director.on("rx", (m) => hud.tick(m.e));
  // Room log: every plan she starts, seeded with the last few on arrival.
  const kfmt = (ms) => { const p = sim.clock.kstParts(ms); return String(p.h).padStart(2, "0") + ":" + String(p.mi).padStart(2, "0"); };
  hud.fmt = kfmt; hud.now = clock.now;
  const seen = new Set();
  const logPlan = (p) => { if (!p || seen.has(p.id + ":" + p.started_at)) return; seen.add(p.id + ":" + p.started_at); hud.log(p.started_at, p.activity === "level_up" ? `levelled up: ${sim.reactions.skillLabel(p.skill)} Lv${p.level}` : PAST[p.activity] || p.status); };
  director.on("plan", ({ plan, fresh }) => {
    if (plan.activity === "level_up" && !fresh) { hud.tick(`learned: ${sim.reactions.skillLabel(plan.skill)} Lv${plan.level}`, plan.started_at); sound.play("level"); for (const u of plan.unlocks || []) if (/^item:/.test(u)) hud.tick("new in her room: " + u.slice(5).replace(/_/g, " "), plan.started_at); }
    logPlan(plan);
    if (fresh && hud.logEl) { // backfill from the deterministic day plan
      let t = plan.started_at - 1, got = 0, lastAct = plan.activity;
      for (let k = 0; k < 24 && got < 6 && t > 0; k++) {
        let prev; try { prev = sim.schedule.planAt(t, null).plan; } catch (e) { break; }
        if (prev.ends_at - prev.started_at >= 60e3 && prev.activity !== lastAct) { logPlan(prev); got++; lastAct = prev.activity; }
        t = prev.started_at - 1;
      }
      for (const e of director.recent || []) if (e.data && e.data.gesture) hud.log(e.at, `someone ${VERB[e.data.gesture] || e.data.gesture}`);
    }
  });
  director.on("ev", (m) => {
    const who = m.mine || m.by === "you" ? "you" : "someone";
    const d = m.data || {};
    let text = "";
    if (m.kind === "level_up") { text = `learned: ${(SKILLS[d.skill] || {}).label || d.skill} Lv${d.level}`; sound.play("level"); scene.fx("fx_burst_pink"); }
    else if (m.kind === "unlock") text = `new in her room: ${[].concat(d.unlocks || d.items || d.item || []).map((u) => String(u).replace(/^\w+:/, "")).join(", ").replace(/_/g, " ")}`;
    else if (m.kind === "brief") text = d.post_title ? `new entry: ${d.post_title}` : "she wrote today's entry";
    else if (m.kind === "item_arrived") text = `something arrived: ${String(d.item || "").replace(/_/g, " ")}`;
    else if (m.kind === "shield") text = "shield up!";
    else if (m.kind === "teleport") text = "she teleported somewhere calmer";
    else if (m.kind === "fed") text = `${who} fed her a ${d.item || "snack"}`;
    else if (d.gesture && VERB[d.gesture]) text = `${who} ${VERB[d.gesture]}`;
    if (!m.mine && who !== "you" && d.gesture === "toss" && d.toss) scene.addItem({ item: d.toss.item, i: d.toss.i, j: d.toss.j, z: 260 });
    if (text) hud.tick(text, m.at);
  });

  // --- gestures -----------------------------------------------------------
  let lastG = 0, liftT = null, lift = null;
  const rng = sim.rng.mulberry32((flags.seed ?? Date.now()) >>> 0);
  const enabled = () => !!director.plan;
  function gesture(k, payload = {}, opt = {}) {
    const now = performance.now();
    if ((!opt.force && now - lastG < 220) || !enabled()) return;
    lastG = now;
    sound.play(k === "poke" && director.world && director.world.crowd && director.world.crowd.annoyance > 0.6 ? "angry" : k);
    if (director.mode === "live" && socket && socket.open) {
      const m = gestureMsg(k, payload);
      director.expect(m.nonce); socket.send(m);
      const sh = director.interrupt;
      if (!(sh && sh.kind === "shield" && clock.now() < sh.untilMs)) try { // predict locally so our own gesture reacts instantly
        const r = sim.reactions.selectReaction(director.world, k, payload, { nowMs: clock.now(), visitors: director.presence.n, brief: null, unlockedItems: (director.world && director.world.items) || [], pos: { i: director.last.i, j: director.last.j } }, rng);
        director.applyReaction(r, clock.now(), {});
      } catch (e) { /* server will tell us */ }
      hud.tick(`you ${VERB[k] || k}`);
    } else if (offline) offline.gesture(k, payload);
    dirty = true;
  }
  const push = (vi, vj) => {
    if (vi == null) { const a = Math.random() * Math.PI * 2; vi = Math.cos(a) * 0.5; vj = Math.sin(a) * 0.5; }
    gesture("push", { vi, vj, vz: 0.45 });
  };
  const give = (item, pos, onHer) => {
    const a = scene.actor, feed = item === "carrot" || item === "battery";
    const at = pos || { i: a.i + 0.9, j: a.j + 0.4 };
    if (feed) { scene.addItem({ item, i: at.i, j: at.j, z: 140, to: { i: a.i, j: a.j }, life: 1.4 }); gesture("feed", { item }); }
    else { const t = onHer || !pos ? { i: a.i + 0.55, j: a.j - 0.25 } : at; scene.addItem({ item, i: t.i, j: t.j, z: 280 }); gesture("toss", { item, i: t.i, j: t.j }); }
  };
  const api = {
    enabled, iso: sim.iso, gesture, give,
    floorTap: (p) => { const d = scene.toDesign(p.x, p.y); scene.parts.emit("spark", d.x, d.y); },
    petStart: () => { gesture("pet"); scene.fx("fx_heart_small"); },
    petHearts: () => scene.fx("fx_heart_small"),
    petEnd: () => {},
    lift: (pos) => { liftT = pos; if (!lift) { lift = { ...director.last, z: 0 }; sound.play("pop"); } },
    release: ({ vi, vj, cancel }) => {
      const z = lift ? lift.z : 0; lift = null; liftT = null; director.override = null;
      if (cancel) return;
      gesture("push", { vi: vi / sim.physics.FLING.maxH, vj: vj / sim.physics.FLING.maxH, vz: 0.35, z });
      lastG = 0;
    },
    button: (k, b) => { if (k === "push") push(); else if (k === "feed" || k === "toss") give(b.dataset.item || "carrot"); else { gesture(k); if (k === "pet") scene.fx("fx_hearts"); } },
    push,
  };
  for (const b of el.querySelectorAll("[data-item]")) paintItemIcon(b, null);
  const unbind = bindInput(cv, scene, api);
  bindTray(el, stage, scene, api);
  const controls = bindControls(el, stage, api);

  // --- loop ---------------------------------------------------------------
  function frame(ts) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
    const now = clock.now();
    const kst = sim.clock.kstParts(now), tod = sim.clock.todBucket(kst.h);
    scene.setRoom(tod, (director.world && director.world.items) || []);
    if (liftT) { // spring lag while she's held
      const k = 1 - Math.exp(-dt * 14);
      lift.i += (liftT.i - lift.i) * k; lift.j += (liftT.j - lift.j) * k; lift.z += (liftT.z - lift.z) * k;
      director.override = { ...lift };
    }
    const s = director.plan ? director.sample(now) : null;
    scene.render(now, reduced ? 0 : dt, s, { kst, charging: s && /charg|sleep/.test(s.anim) });
    const hp = scene.headPos(), css = scene.toCss(hp.x, hp.y);
    bubbles.place(css.x, css.y, scene.cssW, scene.cssH);
    if (ts - hudT > 250 || reduced) { hudT = ts; hud.update({ world: director.world, status: director.status, presence: director.presence, mode: director.mode, sim }, { kst }); }
    if (!ready && director.plan) {
      ready = true; el.classList.add("is-ready"); controls.setEnabled(true);
      // Warm the lazy atlas page a few seconds after the room is up (if nothing needed it sooner).
      extT = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => scene.atlas && scene.atlas.need && scene.atlas.need("trinity-ext")), 4000);
    }
    dirty = false;
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const setRunning = () => {
    const want = visible && !document.hidden;
    if (want === running) return;
    running = want;
    if (running) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; setRunning(); }, { rootMargin: "100px" });
  io.observe(el);
  const onVis = () => setRunning();
  document.addEventListener("visibilitychange", onVis);
  // Reduced motion: static redraws on state change only.
  const staticT = reduced ? setInterval(() => { if (running && (dirty || true)) kick(); }, 4000) : 0;
  if (reduced) director.on("state", () => running && kick());
  const ro = new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (Math.round(r.width) !== scene.cssW || Math.round(r.height) !== scene.cssH) { scene.resize(); kick(); } });
  ro.observe(stage);
  controls.setEnabled(false);
  running = true; kick();

  // --- debug hooks (CONTRACT §5) -------------------------------------------
  const handle = {
    state: () => ({ mode: director.mode, status: director.status, plan: director.plan, world: director.world, interrupt: director.interrupt, atlas: !!scene.atlas }),
    anim: () => scene.actor.anim,
    pos: () => ({ i: scene.actor.i, j: scene.actor.j, z: scene.actor.z }),
    emit: (g, p) => (g === "feed" || g === "toss" ? give((p && p.item) || (g === "feed" ? "carrot" : "ball"), p && p.i != null ? p : null, true) : g === "push" && !p ? push() : gesture(g, p || {})),
    fps: () => Math.round(scene.fps),
    // Viewport px of Trinity's body centre (for pointer-driven tests).
    screen: () => { const p = scene.toCss(scene.actor.x, scene.actor.y - 45), r = cv.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; },
  };
  if (flags.debug || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__habitat = handle;

  return {
    destroy() {
      cancelAnimationFrame(raf); running = false; io.disconnect(); ro.disconnect(); unbind();
      clearInterval(retryT); clearInterval(staticT); clearTimeout(fallbackT); clearTimeout(closeT); clearTimeout(extT);
      document.removeEventListener("visibilitychange", onVis);
      if (socket) socket.destroy(); stopOffline();
      cv.remove(); hud.el.remove(); bubbles.el.remove();
    },
  };
}

// Swap the tray's emoji for atlas item art once the atlas is in.
// Procedural art until the atlas has the object sprite (the ball stays procedural).
function paintItemIcon(b, a) {
  const item = b.dataset.item, key = { carrot: "obj_carrot", battery: "obj_battery", box: "obj_box" }[item];
  const an = a && key && a.anims[key], fr = an && a.frames[an.f[0]], pg = fr && a.pages[fr.p];
  const icon = b.querySelector(".habitat-item__icon");
  if (!icon || (a && !pg)) return;
  const c = document.createElement("canvas"); c.width = c.height = 64; c.className = "habitat-item__icon"; c.setAttribute("aria-hidden", "true");
  const x = c.getContext("2d");
  if (pg) { const k = Math.min(60 / fr.w, 60 / fr.h); x.drawImage(pg.img, fr.x * pg.res, fr.y * pg.res, fr.w * pg.res, fr.h * pg.res, (64 - fr.w * k) / 2, (64 - fr.h * k) / 2, fr.w * k, fr.h * k); }
  else { x.translate(32, 54); x.scale(1.45, 1.45); drawItemShape(x, item, 0.4); }
  icon.replaceWith(c);
}
