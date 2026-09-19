// A11y toolbar: every gesture as a real button, plus keyboard shortcuts
// while the room has focus. Pushes pick a random-ish direction.
const KEYS = { p: "poke", " ": "poke", t: "tickle", h: "pet", w: "wave", s: "push" };

export function bindControls(root, stage, api) {
  const btns = [...root.querySelectorAll("[data-gesture]")];
  for (const b of btns) b.addEventListener("click", () => api.button(b.dataset.gesture, b));
  stage.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[e.key.toLowerCase()];
    const arrows = { ArrowLeft: [-0.4, 0.4], ArrowRight: [0.4, -0.4], ArrowUp: [-0.5, -0.5], ArrowDown: [0.5, 0.5] }[e.key];
    if (arrows) { e.preventDefault(); api.push(arrows[0], arrows[1]); return; }
    if (k) { e.preventDefault(); k === "push" ? api.push() : api.button(k); }
  });
  // The fullscreen toggle (full mode only).
  const fs = root.querySelector("[data-hab-fullscreen]");
  if (fs) {
    if (!document.fullscreenEnabled) fs.hidden = true;
    fs.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else (root.querySelector("[data-hab-stage]") || root).requestFullscreen().catch(() => {});
    });
    document.addEventListener("fullscreenchange", () => fs.setAttribute("aria-pressed", document.fullscreenElement ? "true" : "false"));
  }
  const setEnabled = (on) => { for (const b of [...btns, ...root.querySelectorAll("[data-item]")]) b.disabled = !on; };
  return { setEnabled };
}
