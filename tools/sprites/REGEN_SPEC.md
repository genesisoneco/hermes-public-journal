# Regenerating clean Trinity sheets

The current sheets have several problems: broken alpha, a magenta halo, baked-in labels, irregular layout, and several facings
mixed within one row. Sheets made to this spec drop into the same pipeline. Only the manifest changes (`"layout":"grid"`),
and no code changes are needed.

## Hard rules (every sheet)

- **Canvas:** 2048 px wide (8 columns × 256). Height = rows × 256. PNG.
- **Background:** solid flat **#00FF00** everywhere. No gradient, vignette, floor, shadow or noise.
- **No text of any kind:** no labels, numbers, titles or watermarks. The only text allowed is the "TR" chest badge, and it must never be mirrored.
- **Cells:** fixed 256×256. Frame k of row r sits in the cell at x = k·256, y = r·256. Nothing may cross a cell border, including glows, props, beams and glyphs. Leave at least 8 px of margin.
- **One animation and one facing per row.** The frames play left to right. Unused cells stay pure green.
- **Feet baseline y = 232** inside each cell, for every grounded frame. Airborne frames (jump apex, hover, fall) are drawn higher, so their offset from 232 is the motion.
- **Scale:** idle body height is **200 px** (ear tip to feet). Keep the same scale on every row and every sheet.
- **6–8 frames per action.** Loops must be seamless: the last frame flows into the first.
- **Horizontally centred** on the cell centre (x = 128). Walk and run cycles are in place, with no travel across the cell.
- **Lighting and outline:** same soft 3D render, key light top-left, no rim glow and no coloured outline. Colours never include #00FF00 or anything close to it (no green props on character sheets).
- **FX and props go on their own sheets,** never on character sheets (except glyphs attached to an emote: `? ! zZ ♪ ♥` may sit inside the emote's cell).
- **Facings:** F = toward camera, B = away, R = screen-right, L = screen-left. Provide L and R as separately drawn rows. Never mirror an R row to make L, because the badge text would flip.

## Manifest entry format

```jsonc
"sheets": {
  "c1": { "path": "../../../tmp/Trinity/regen/trinity_locomotion.png", "layout": "grid",
          "cell": [256, 256], "cols": 8, "key": "#00FF00" }
},
"target": { "idleRow": "idle_F", "bodyH1x": 120, "idleRefH": 200 },
"rows": [
  { "id": "idle_F", "sheet": "c1", "row": 0, "frames": 6, "facing": "F", "mode": "solid" },
  { "id": "jump",   "sheet": "c1", "row": 12, "frames": 8, "facing": "R", "mode": "solid", "anchorY": "row" },
  { "id": "shield", "sheet": "c2", "row": 6, "frames": 6, "facing": "F", "mode": "glow" }
],
"anims": { "idle_F": { "src": "idle_F", "f": [0,1,2,3,4,5], "fps": 5, "loop": true, "flip": false, "facing": "F", "blend": "normal" } }
```

`rect` is derived automatically as `[0, row·256, frames·256, 256]` and `facing` may be a single letter. No `refH` is needed,
because every row is drawn at the reference scale (`idleRefH: 200`). Use `anchorY:"row"` for airborne anims, `anchor:"center"` for FX/UI and
`scaleRef` for FX/UI/props. Build with `python build.py` (or `--layout grid` to force grid parsing).

## Sheets and rows (from `rules.ANIMS`)

**Sheet C1: locomotion (16 rows).** Needs 16 rows × 256 = 4096 px tall, or split it into C1a and C1b of 8 rows each.
`idle_F` 6 · `idle_B` 6 · `idle_L` 6 · `idle_R` 6 · `walk_F` 8 · `walk_B` 8 · `walk_L` 8 · `walk_R` 8 · `run_F` 8 · `run_B` 8 ·
`run_L` 8 · `run_R` 8 · `jump` 6 (R) · `fall` 4 (R, loop) · `land` 4 (R) · `turn` 8 (F→R→B→L→F)

**Sheet C2: special (14 rows).** Facing R unless noted.
`dash` 6 · `hover` 6 (F, loop) · `fly` 6 (loop) · `spin` 8 (F) · `beam` 6 · `projectile` 6 · `shield` 6 (F, bubble inside cell) ·
`hurt` 4 (F) · `knockdown` 6 (F) · `recover` 6 (F) · `die` 6 (F) · `special` 8 (F) · `teleport_in` 6 (F) · `teleport_out` 6 (F)

**Sheet C3: emotes (14 rows),** all facing F. `dance` may turn a full circle.
`sit` 6 · `happy` 6 · `sad` 6 · `angry` 6 · `surprised` 6 · `listen` 6 · `confused` 6 · `sleep` 6 (lying, breathing loop, zZ) ·
`wake_up` 6 · `love` 6 · `dance` 8 · `ear_wiggle` 6 · `headphone_adjust` 6 · `wave` 6

**Sheet C4: utility (12 rows).** F unless noted.
`scan` 6 · `hack` 6 (laptop in cell) · `pick_up` 6 (R) · `carry` 8 (R, walk cycle with box) · `push` 6 (R) · `pull` 6 (R) ·
`climb` 8 (R) · `slip` 6 (R) · `low_battery` 6 · `charging` 6 (loop) · `repair` 6 · `victory` 8

**Sheet X1: FX (22 rows, 1–8 frames each).** Use `mode:"glow"`, `anchor:"center"`, and glow drawn on the green background.
`fx_sparkle` `fx_sparkle_small` `fx_star` `fx_heart` `fx_heart_small` `fx_hearts` `fx_exclaim` `fx_exclaim_yellow` `fx_question`
`fx_ring_blue` `fx_ring_heart` `fx_burst_pink` `fx_burst_orange` `fx_comet` `fx_star_blue` `fx_portal_floor_pink`
`fx_portal_floor_blue` `fx_portal_pink` `fx_portal_blue` `fx_smoke` `fx_smoke_small` `fx_dust`
Up to 8 FX can share a row as 1-frame items: give each one its own row entry with `"frames":1` and a `rect` of that cell.

**Sheet U1: UI, objects and portraits (1 frame each, one per cell).**
`ui_bunny` `ui_heart` `ui_star` `ui_exclaim` `ui_question` `ui_battery_1..4` `ui_shield_pink` `ui_shield_blue` `ui_gear_pink`
`ui_gear_purple` `ui_plus` `ui_speaker_on` `ui_speaker_off` `ui_mail` `ui_gear` `ui_trophy` · `obj_box` `obj_laptop` `obj_trophy`
`obj_carrot` `obj_crate` `obj_battery` `obj_blocks` (drawn resting on y = 232) · `portrait_neutral` `happy` `wink` `laugh` `blush`
`surprised` `angry` `sad` `sleep` `love` (head and shoulders, centred).

## Ready-to-paste prompts

Shared prefix (paste it before each sheet prompt):

> Sprite sheet for a 2D game, 2048 px wide, strict grid of 256×256 px cells, 8 columns. Solid pure #00FF00 green background
> filling the whole image, no gradient, no floor, no shadows, no text, no labels, no numbers, no borders, no grid lines.
> Character: "Trinity", a small round pink 3D-rendered bunny robot with two upright ears, pink-and-white over-ear headphones,
> stubby arms and feet, a white belly patch with the black letters "TR" (never mirrored), glossy soft-plastic material, key
> light from top-left, no outline and no glow around the body. Same size and style in every cell: body height 200 px from ear tip to
> feet, feet resting on a baseline 24 px above the bottom of each cell, horizontally centred in the cell. Each row is ONE animation
> seen from ONE direction, frames reading left to right, seamlessly looping where it is a loop. Nothing may cross a cell border.

- **C1 (locomotion):** "Rows top to bottom: 1 idle facing camera (6 frames, gentle breathing and one blink); 2 idle facing away (6);
  3 idle facing screen-left (6); 4 idle facing screen-right (6); 5 walk toward camera (8, in place); 6 walk away (8); 7 walk
  screen-left (8); 8 walk screen-right (8); 9–12 run in the same four directions (8 each, in place, more bounce); 13 jump
  screen-right (6: crouch, launch, rise, apex, descend, pre-land; body higher in the cell as it rises); 14 fall screen-right (4,
  airborne, loop); 15 land screen-right (4: impact squash, recover); 16 turn around in place (8: front → right → back → left →
  front)."
- **C2 (special):** "Rows: dash to screen-right with pink speed streaks (6); hover facing camera with small blue jet flames under the
  feet (6, loop); float/fly screen-right riding a soft blue cloud (6, loop); spin attack with a pink ring swirl (8); energy beam
  fired screen-right, beam fully inside the cell (6); projectile: throw a glowing pink orb screen-right, orb inside the cell (6);
  shield: blue bubble around her (6, loop, bubble fits inside the cell); hurt, eyes squeezed, small stars (4); knockdown, falling
  onto her back (6); recover, getting up (6); defeat, lying with X eyes, last frame with a tiny ghost (6); special attack, pink
  aura burst (8); teleport in, pink light column with floor ring, she materialises (6); teleport out, reverse (6). Glows are
  pink/blue, never green."
- **C3 (emotes):** "All facing camera. Rows: sit (6); happy cheer (6); sad with tears (6); angry with steam puffs (6); surprised
  with a yellow '!' (6); listening with blinks (6); confused with a blue '?' (6); sleeping lying down, breathing, blue 'zZ' (6,
  loop); waking up and stretching (6); love, hugging a pink heart, small hearts (6); dance with music notes (8, may spin a full
  turn); ear wiggle (6); adjusting her headphones (6); wave goodbye (6)."
- **C4 (utility):** "Rows: scan with a small blue hologram panel (6, facing camera); typing on a small laptop (6); pick up a
  cardboard box, screen-right (6); carry the box walking screen-right in place (8); push a grey block screen-right (6); pull a block
  on a rope screen-right (6); climb onto a grey block screen-right (8); slip on a blue puddle (6); low battery, droopy, small red
  battery icon above her head (6); charging on a glowing blue pad with a cable, battery icon filling (6, loop); repair with a blue
  wrench (6); victory jump with confetti and stars (8). All props and icons stay inside their cell."
- **X1 (FX):** "Game VFX sprites, one effect per cell, centred, on solid #00FF00, no text: pink 4-point sparkle, small sparkle,
  golden star sparkle, pink heart, small heart, cluster of three hearts, red '!', yellow '!', pink '?', blue glowing ring (tilted
  ellipse), pink ring with a heart, pink starburst, orange starburst, pink comet streak, blue 4-point flare, pink floor portal
  ring, blue floor portal ring, pink upright portal oval, blue upright portal oval, grey cartoon smoke cloud, small smoke cloud,
  dust puff with a star. Glow falls off to fully transparent green with no dark outline."
- **U1 (UI and objects):** "Flat-shaded glossy game UI icons, one per cell, centred, on solid #00FF00, no text: pink bunny head,
  heart, gold star, red '!', blue '?', battery at 1/4, 2/4, 3/4 and 4/4, pink shield, blue shield, pink gear, purple gear, green
  plus, pink speaker on, pink speaker muted, pink envelope, grey gear, gold trophy; objects resting on the cell baseline:
  cardboard box with a bunny print, small laptop, trophy, carrot, white crate with a bunny print, pink battery, two stacked grey
  stone blocks; then ten head-and-shoulders portraits of Trinity: neutral, happy, wink, laugh, blush, surprised, angry, sad,
  sleepy, love-struck."
