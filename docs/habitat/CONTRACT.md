# Trinity Habitat: Interface Contract

This contract covers four areas: sprites, the shared sim, the Durable Object backend, and the browser engine. Each area is built by a different agent working in parallel. Everything here is binding. If you need to change it, update this file and say so in your final report.

The canonical vocabulary (anims, zones, props, activities, skills, reactions, lines) lives in `assets/js/habitat/sim/rules.js`. Import from it and never duplicate its contents.

The full plan is in `C:\Users\USER\.claude\plans\the-doaia-site-for-twinkly-beaver.md`.

## 0. File ownership

| Area | Owner | Paths |
|---|---|---|
| Sprites | sprite agent | `tools/sprites/**`, `assets/habitat/atlas/**` |
| Shared sim | backend agent | `assets/js/habitat/sim/*.js` (except `rules.js`: that file is additive-only for everyone, and every addition must be reported) |
| Backend | backend agent | `worker/**`, `tools/habitat_brief.py`, `tools/README.md` (append a section) |
| Client | client agent | `assets/js/habitat/{main.js,render,net,ui,util}/**`, `assets/js/habitat-boot.js`, `assets/habitat/room/**`, `_layouts/home.html`, `live.md`, `assets/css/site.css` (only a new `/* Habitat */` block, plus later removal of the old live block) |
| QA | QA agent (later) | `tools/habitat-test/**` |

Sim files are native ES modules with no DOM and no Workers APIs. The client imports them in the browser, and wrangler/esbuild bundles them into the Worker via `../../assets/js/habitat/sim/…`.

Code style: modern ES2020 modules (no transpile). JS comments follow the repo's existing tone. The site ships no build step, so every browser file must run as served.

## 1. Coordinates

- **World:** tile coordinates `(i, j)` are floats in the range `[0,10]`. `z` is the height in design px (0 = on the floor).
- **Screen/design:** `WORLD.design` is 1600×900. `screenX = 800 + (i-j)*55`, `screenY = 260 + (i+j)*28 - z`.
- **Depth:** larger `(i+j)` is drawn later, which puts it in front.
- **Facing:** one of `"F"` (toward the camera, screen-down), `"B"`, `"L"` (screen-left), or `"R"` (screen-right). To derive it from a movement delta, convert (di, dj) to screen (dx, dy):
  - if `|dx| > 1.2|dy|`, use R or L;
  - otherwise use F if dy > 0, or B if dy < 0.

## 2. Shared sim API (`assets/js/habitat/sim/`)

The backend agent implements these. The client depends on the exact signatures. The functions are pure unless noted. `rng` is a function returning a value in [0,1).

```js
// rng.js
export function mulberry32(seed:number): () => number
export function hashSeed(str:string): number          // 32-bit uint

// clock.js
export function kstParts(ms:number): { y, mo, d, h, mi, s, dateStr:"YYYY-MM-DD" }
export function isSleepHour(h:number): boolean        // h>=23 || h<6
export function todBucket(h:number): "sleep"|"morning"|"afternoon"|"evening"|"night"  // 6-9 / 9-17 / 17-20 / 20-23
export function daysAlive(ms:number): number           // since rules.BORN, KST

// iso.js
export function worldToScreen(i, j, z=0): { x, y }
export function screenToWorld(x, y): { i, j }         // z = 0
export function facingFromDelta(di, dj): "F"|"B"|"L"|"R"

// grid.js
export function buildGrid(unlockedItems:string[]): Grid       // occupancy from rules.PROPS
export function findPath(grid, from:{i,j}, to:{i,j}): Array<[i,j]>  // A*, 8-neighbour, no corner cutting, smoothed; [] if none
export function nearestFree(grid, {i,j}): {i,j}

// brain.js
export function newWorld(seed:number, nowMs:number): World
export function integrate(world, dtSec:number, ctx): void     // needs, energy, mood decay, crowd decay (mutates)
export function chooseActivity(world, ctx, rng): string       // utility + softmax(T=0.15); obeys sleep window, low battery, requires*
export function buildPlan(world, activity:string, ctx, rng, nowMs): Plan
export function levelFor(xp:number): 1|2|3|4|5
export function addXp(world, skill, amount, source:"self"|"visitor"): { leveledUp:boolean, level:number, unlocks:string[] }
export function moodLabel(world): string                       // nearest rules.MOODS key
export function catchUp(world, fromMs, toMs, ctx, rngSeed): void  // coarse deterministic sim, ≤300 plan steps
// ctx = { nowMs, visitors:number, brief:Brief|null, unlockedItems:string[] }

// reactions.js
export function selectReaction(world, gesture:string, payload, ctx, rng): Reaction
// Reaction = { gesture, anims:string[], fx?:string, say?:string, annoyDelta, affectionDelta, energyDelta,
//              interrupt:{ kind:"reaction"|"pushed"|"shield"|"teleport"|"asleep", untilMs, pos?:{i,j} } }

// physics.js
export function simulateFling(start:{i,j,z}, v:{vi,vj,vz}, grid, opts?): { frames:Array<{t,i,j,z}>, landing:{i,j}, impact:number, outcome:"land"|"knockdown" }
// deterministic: the same input gives the same output on every client and on the server

// schedule.js  (offline viewers: same day plan for everyone, no server)
export function planAt(nowMs:number, brief:Brief|null): { plan:Plan, world:World }
```

### Data shapes

```ts
World = {
  v:1, seed, plan_seq, sim_at, kst_date,
  pos:{i,j}, facing, energy:0..100,
  needs:{curiosity,creativity,social,play,tidiness},   // 0..1 urgency
  mood:{valence, arousal, base_v, base_a, label},
  crowd:{affection, annoyance},                        // 0..1
  skills:{ [skill]: { xp:number } },                   // level derived
  items:string[], wishlist:string[], combos:string[],
  memory:Array<{at, kind, text}>,                      // ≤12
  counters:{ today:{...}, lifetime:{ pokes, pets, tickles, waves, pushes, feeds, tosses, visitors } },
  xpToday:{ [skill]: { self:number, visitor:number } },
}

Plan = {
  id:number, activity:string, status:string,           // status = HUD line
  started_at:ms, ends_at:ms,
  steps: Array<
    | { kind:"walk", t0, t1, path:Array<[i,j]>, speed:number /*tiles/s*/, anim:"walk"|"run"|"float" }
    | { kind:"anim", t0, t1, anim:string, loop?:boolean, facing?:"F"|"B"|"L"|"R", fumble?:boolean }
    | { kind:"say",  t0, text:string, ttl:number /*ms*/, style:"speech"|"thought" }
    | { kind:"fx",   t0, fx:string, at?:"head"|"feet"|{i,j} }
    | { kind:"teleport", t0, to:{i,j} }
  >
}
Brief = { date, mood, mood_intensity, wishes:[{activity,weight,note}], thoughts:string[],
          practicing_skill, new_item?, post_url, post_title, source:"hermes"|"derived" }
```

`walk` steps give the anim family. The client appends the facing suffix from the path direction: `walk` → `walk_R`, and so on.

## 3. Wire protocol v1 (WebSocket `wss://api.doaia.com/api/habitat/ws`)

All frames are JSON. Client-to-server frames are at most 512 bytes. Times are server epoch ms.

**Server → client**

```jsonc
{"t":"hello","v":1,"rules_version":"…","you":{"id":"v7f3","color":"#7ee0a8"},"now":1768800000000}
{"t":"snap","seq":1,"world":{/* public World subset: pos,facing,energy,mood,crowd,items,wishlist,skills(with lvl),days_alive,kst_date */},
 "plan":{/*Plan*/},"interrupt":null|{kind,untilMs,anims,fx,say,pos},"brief":{date,mood,thoughts,practicing_skill,post_url,post_title}|null,
 "presence":{"n":7,"colors":["#…"]},"recent":[{at,kind,data}]}
{"t":"plan","seq":2,"plan":{/*Plan*/}}
{"t":"ev","seq":3,"kind":"reaction|pushed|shield|teleport|level_up|unlock|brief|item_arrived|fed|mood","by":"#7ee0a8","at":ms,
 "nonce":"…optional, echoes the client's",
 "data":{/*kind specific, e.g. {skill,level,unlocks} or {fling:{start,v}}*/},"reaction":{/*Reaction*/}}
{"t":"stat","seq":4,"energy":71.9,"mood":{…},"crowd":{…}}
{"t":"pr","n":7,"colors":["#…"]}
{"t":"rx","e":"💜","by":"#7ee0a8"}
{"t":"err","code":"rate_limited|bad_msg|asleep|shielded|full"}
```

**Client → server**

```jsonc
{"t":"i","k":"poke|pet|tickle|wave","nonce":"abc123"}
{"t":"i","k":"push","vi":-0.6,"vj":0.2,"vz":0.3,"nonce":"…"}   // each clamped to ±1 (fraction of max fling)
{"t":"i","k":"feed","item":"carrot|battery","nonce":"…"}
{"t":"i","k":"toss","item":"ball|box","i":5.2,"j":3.1,"nonce":"…"}
{"t":"rx","e":"💜"}                                               // must be in rules.EMOJI
{"t":"resync"}                                                    // ask for a fresh snap (seq gap)
"ping"                                                            // auto-answered "pong" (does not wake the DO)
```

**HTTP**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/habitat/state` | Returns the snap body (no presence colours). Cache 3 s. |
| POST | `/api/habitat/interact` | Body is a `{"k":…}` like the `i` message. Returns `{ok, ev}`. |
| POST | `/api/admin/habitat/brief` | Bearer auth. Body is a Brief. |
| GET | `/api/admin/habitat/debug` | Bearer auth. |

Clients use `data-api` from the markup. When `location.hostname` is `localhost` or `127.0.0.1`, they use `http://localhost:8787` and `ws://localhost:8787`.

## 4. Atlas (`assets/habitat/atlas/`)

```jsonc
// atlas.json
{
  "v": 1,
  "scale": { "@1x": 1, "@2x": 2 },                    // @1x body height ≈ 128 px for idle_F
  "pages": {
    "trinity-core": { "@1x": "trinity-core@1x.webp", "@2x": "trinity-core@2x.webp",
                      "png": { "@1x": "trinity-core@1x.png", "@2x": "trinity-core@2x.png" }, "w": 2048, "h": 2048 },
    "trinity-ext": { … }, "fx": { … }, "ui": { … }
  },
  // x,y,w,h are @1x px in the page. @2x coords are exactly ×2.
  // ax,ay = anchor (feet centre) inside the frame. blend "lighter" for glow FX.
  "frames": { "walk_R_0": { "p":"trinity-core","x":0,"y":0,"w":98,"h":121,"ax":49,"ay":118,"hit":"<base64 1-bit mask at 1/4 res, row-major, w4=ceil(w/4)>" } },
  "anims": {
    "walk_R": { "f":["walk_R_0","walk_R_1","walk_R_2","walk_R_3","walk_R_4"], "fps":10, "loop":true,
                "flip":false, "ev":{"1":"step","3":"step"}, "blend":"normal", "facing":"R" }
  }
}
```

- Every anim key in `rules.ANIMS` must exist in `anims`.
- A variant may alias another variant's frames when a facing doesn't exist. Example: `idle_L` = `idle_R` frames with `"flip":true`, but only when those frames show no "TR" badge.
- `"flip":true` means the client mirrors the frames horizontally.
- `trinity-core` holds everything in `ANIMS.locomotion` plus `sit, happy, sleep, wake_up, love, wave, surprised, angry, confused, listen, land, hurt, knockdown, recover, teleport_in, teleport_out, shield, ear_wiggle, headphone_adjust, hack, scan, charging, low_battery`.
- `trinity-ext` holds the rest of the Trinity anims.
- `fx` holds the `fx_*` anims. `ui` holds `ui_*`, `obj_*` and `portrait_*`.

**Budgets:** all WebP files total under 1.5 MB, and `trinity-core@2x.webp` is under 700 KB.

## 5. Markup hook (home and /live/)

```html
<section class="habitat habitat--embed|habitat--full" data-habitat data-mode="embed|full"
  data-api="{{ site.api.base }}" data-base="{{ '/assets/' | relative_url }}"> … </section>
<script src="/assets/js/habitat-boot.js" defer></script>
```

- `habitat-boot.js` calls `import(base + 'js/habitat/main.js')` and then `mount(el, {mode, api, base})`.
- `main.js` exports `mount(el, opts) → { destroy() }`.
- **Prebuilt bundle.** `habitat-boot.js` imports `js/habitat.bundle.js`, an esbuild bundle of `main.js` built with `tools/habitat-build`. It falls back to `js/habitat/main.js` with `?habitat=dev`, or if the bundle fails to load. After any change under `assets/js/habitat/**`, run `npm run build` in `tools/habitat-build` and commit the result. CI (`.github/workflows/habitat-bundle.yml`) fails if the committed bundle is stale. The Worker keeps importing `sim/` from source.

**Debug and test hooks:**
- URL flags: `?habitat=debug`, `&seed=N`, `&clock=ISO`, `&net=offline|mock|live`, and `?habitat=off`.
- `window.__habitat` exposes `state()`, `anim()`, `pos()`, `emit(gesture,payload)` and `fps()`.
