// Pointer gestures on the room canvas.
//   tap = poke · double-tap = tickle · long-press = pet (hearts while held)
//   drag Trinity = lift (spring lag) → release = fling (push)
// touch-action: pan-y keeps page scroll; we only preventDefault when a
// touch starts on Trinity.

export function bindInput(cv, scene, api) {
  let down = null, lastTap = 0, heartT = 0;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onTouch = (e) => { const t = e.touches[0]; if (!t) return; const r = cv.getBoundingClientRect(); if (api.enabled() && scene.hitTrinity(t.clientX - r.left, t.clientY - r.top)) e.preventDefault(); };
  cv.addEventListener("touchstart", onTouch, { passive: false });

  const liftPos = (p) => {
    const d = scene.toDesign(p.x, p.y), z = 46;
    const w = api.iso.screenToWorld(d.x, d.y + 96 + z * 0);
    return { i: Math.max(0.3, Math.min(9.7, w.i)), j: Math.max(0.3, Math.min(9.7, w.j)), z };
  };

  cv.addEventListener("pointerdown", (e) => {
    if (!api.enabled() || e.button > 0) return;
    const p = pt(e);
    if (!scene.hitTrinity(p.x, p.y)) { api.floorTap(p); return; }
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    down = { ...p, t: performance.now(), id: e.pointerId, mode: "press", hist: [] };
    down.lp = setTimeout(() => { if (down && down.mode === "press") { down.mode = "pet"; api.petStart(); } }, 450);
    cv.classList.add("is-grabbing");
  });
  cv.addEventListener("pointermove", (e) => {
    const p = pt(e);
    if (!down) { cv.classList.toggle("is-over", api.enabled() && scene.hitTrinity(p.x, p.y)); return; }
    if (e.pointerId !== down.id) return;
    const moved = Math.hypot(p.x - down.x, p.y - down.y);
    if (down.mode === "press" && moved > 9) { clearTimeout(down.lp); down.mode = "lift"; api.lift(liftPos(p)); }
    if (down.mode === "lift") {
      const lp = liftPos(p); api.lift(lp);
      down.hist.push({ t: performance.now(), ...lp }); if (down.hist.length > 8) down.hist.shift();
    }
    if (down.mode === "pet" && performance.now() - heartT > 330) { heartT = performance.now(); api.petHearts(); }
  });
  const end = (e, cancel) => {
    if (!down || e.pointerId !== down.id) return;
    clearTimeout(down.lp); cv.classList.remove("is-grabbing");
    const d = down; down = null;
    if (d.mode === "pet") { api.petEnd(); return; }
    if (d.mode === "lift") {
      const h = d.hist, a = h[0], b = h[h.length - 1];
      let vi = 0, vj = 0;
      if (a && b && b.t - a.t > 10) { const dt = (b.t - a.t) / 1000; vi = (b.i - a.i) / dt; vj = (b.j - a.j) / dt; }
      api.release({ vi, vj, pos: b || null, cancel: !!cancel });
      return;
    }
    if (cancel) return;
    // Taps poke immediately; a second tap inside the window upgrades the
    // reaction to a tickle (and skips the gesture throttle so it isn't lost).
    const now = performance.now();
    if (now - lastTap < 300) { lastTap = 0; api.gesture("tickle", {}, { force: true }); }
    else { lastTap = now; api.gesture("poke"); }
  };
  cv.addEventListener("pointerup", (e) => end(e, false));
  cv.addEventListener("pointercancel", (e) => end(e, true));
  // Long-press on touch shouldn't open the context menu over her.
  cv.addEventListener("contextmenu", (e) => { const p = pt(e); if (scene.hitTrinity(p.x, p.y)) e.preventDefault(); });
  return () => cv.removeEventListener("touchstart", onTouch);
}
