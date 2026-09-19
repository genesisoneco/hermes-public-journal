// Item tray: drag a carrot / battery / ball / box into the room (or click it).
// Carrot + battery = feed (dropped near her), ball + box = toss (lands where dropped).
import { h } from "../util/flags.js";

const FEED = new Set(["carrot", "battery"]);

export function bindTray(root, stage, scene, api) {
  const btns = [...root.querySelectorAll("[data-item]")];
  let drag = null;
  const drop = (item, cx, cy) => {
    const r = stage.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return false;
    const d = scene.toDesign(x, y), w = api.iso.screenToWorld(d.x, d.y);
    const pos = { i: Math.max(0.5, Math.min(9.5, w.i)), j: Math.max(0.5, Math.min(9.5, w.j)) };
    api.give(item, pos, scene.hitTrinity(x, y));
    return true;
  };
  for (const b of btns) {
    const item = b.dataset.item;
    b.addEventListener("click", () => { if (b.dataset.dragged) { delete b.dataset.dragged; return; } api.give(item, null, true); });
    b.addEventListener("pointerdown", (e) => {
      if (!api.enabled() || e.button > 0) return;
      drag = { item, b, x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
    });
    b.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.ghost = h("div.habitat-ghost", { "aria-hidden": "true" }, b.querySelector(".habitat-item__icon").cloneNode(true));
        document.body.append(drag.ghost); b.classList.add("is-dragging"); stage.classList.add("is-drop-target");
      }
      if (drag.ghost) { e.preventDefault(); drag.ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`; }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (d.ghost) { d.ghost.remove(); b.classList.remove("is-dragging"); stage.classList.remove("is-drop-target"); b.dataset.dragged = "1"; setTimeout(() => delete b.dataset.dragged, 50); if (e.type === "pointerup") drop(d.item, e.clientX, e.clientY); }
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
  }
  return { isFeed: (i) => FEED.has(i) };
}
