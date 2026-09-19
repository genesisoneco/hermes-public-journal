// Trinity habitat — canonical rules & vocabulary.
// Shared by the browser engine (assets/js/habitat/**) and the Cloudflare
// Durable Object (worker/src/habitat/**, bundled by wrangler/esbuild).
// Pure data: no DOM, no Workers APIs. Bump RULES_VERSION on any change that
// alters behaviour so clients reload tables on mismatch.

export const RULES_VERSION = "2026.09.19-2";

// Trinity's first journal entry. Used for "days alive".
export const BORN = "2026-05-10";

// ---------------------------------------------------------------------------
// World geometry. 10x10 tile floor. Tile (i,j) spans [i,i+1) x [j,j+1).
// i runs from the N corner toward E (along the right-back wall, j = 0).
// j runs from the N corner toward W (along the left-back wall, i = 0).
// Screen space is the 1600x900 design canvas used by the old /live/ SVG:
//   screenX = 800 + (i - j) * 55
//   screenY = 260 + (i + j) * 28 - z
// so N(0,0)=(800,260) E(10,0)=(1350,540) S(10,10)=(800,820) W(0,10)=(250,540).
// Larger (i + j) = closer to the camera.
// ---------------------------------------------------------------------------
export const WORLD = {
  cols: 10,
  rows: 10,
  origin: { x: 800, y: 260 },
  tileW: 55, // half-width step per tile along each axis
  tileH: 28, // half-height step per tile along each axis
  design: { w: 1600, h: 900 },
};

// Static furniture. `rect` = [i0, j0, i1, j1] footprint (blocks walking unless
// walkable: true). `wall` says which back wall it leans on ("right" = j=0 wall,
// "left" = i=0 wall, null = free standing). `requires` = item unlock needed for
// it to exist in the room.
export const PROPS = {
  pod:       { rect: [0, 7, 2, 9],   wall: "left",  label: "charging pod" },
  bookshelf: { rect: [0, 1, 1, 3.5], wall: "left",  label: "archive shelf" },
  window:    { rect: [0, 4, 0.2, 6], wall: "left",  label: "window", walkable: true },
  desk:      { rect: [2, 0, 5, 1],   wall: "right", label: "writing desk" },
  plants:    { rect: [6, 0, 9, 1],   wall: "right", label: "plant cabinet" },
  rug:       { rect: [4, 4, 7, 7],   wall: null,    label: "rug", walkable: true },
  door:      { rect: [9.8, 6, 10, 8], wall: null,   label: "door", walkable: true },
  // Unlockable items (appear when their item is unlocked; see ITEMS).
  kettle:      { rect: [9, 0, 10, 1],     wall: "right", requires: "kettle" },
  toolbox:     { rect: [9, 3, 10, 4],     wall: null,    requires: "toolbox" },
  workbench:   { rect: [9, 3, 10, 5],     wall: null,    requires: "workbench" },
  telescope:   { rect: [1, 5.5, 2, 6.5],  wall: null,    requires: "telescope" },
  speaker:     { rect: [7.5, 7.5, 8.5, 8.5], wall: null, requires: "speaker" },
  disco_light: { rect: [5, 5, 6, 6],      wall: null,    requires: "disco_light", walkable: true },
  desk_lamp:   { rect: [4.4, 0, 5, 0.6],  wall: "right", requires: "desk_lamp", walkable: true },
  holo_screen: { rect: [2, 0, 5, 0.2],    wall: "right", requires: "holo_screen", walkable: true },
  globe:       { rect: [0, 3.5, 0.8, 4],  wall: "left",  requires: "globe" },
  plant_2:     { rect: [8, 8, 9, 9],      wall: null,    requires: "plant_2" },
  trophy_shelf:{ rect: [0, 0, 1, 1],      wall: "left",  requires: "trophy_shelf" },
};

// Zones = named standing spots (tile coords, may be fractional) + the facing
// she uses there. Facing: "F" toward camera, "B" away, "L" screen-left, "R" screen-right.
export const ZONES = {
  desk:      { i: 3.5, j: 1.7, facing: "F", label: "at her desk" },
  plants:    { i: 7.5, j: 1.7, facing: "B", label: "with the plants" },
  pod:       { i: 2.6, j: 8.0, facing: "F", label: "in her pod" },
  shelf:     { i: 1.6, j: 2.2, facing: "L", label: "by the archive shelf" },
  window:    { i: 1.0, j: 5.0, facing: "B", label: "at the window" },
  rug:       { i: 5.5, j: 5.5, facing: "F", label: "on the rug" },
  kettle:    { i: 9.3, j: 1.8, facing: "B", label: "making tea" },
  workbench: { i: 8.4, j: 4.0, facing: "R", label: "at the workbench" },
  door:      { i: 9.6, j: 7.0, facing: "R", label: "by the door" },
  off:       { i: 11.5, j: 7.0, facing: "R", label: "stepped out" },
};

// ---------------------------------------------------------------------------
// Animation vocabulary. These are the atlas animation keys the sprite pipeline
// MUST emit (tools/sprites -> assets/habitat/atlas/atlas.json "anims").
// Facing variants use suffix _F/_B/_L/_R; the client resolves a missing
// facing to the nearest available variant (see docs/habitat/CONTRACT.md).
// ---------------------------------------------------------------------------
export const ANIMS = {
  locomotion: [
    "idle_F", "idle_B", "idle_L", "idle_R",
    "walk_F", "walk_B", "walk_L", "walk_R",
    "run_F", "run_B", "run_L", "run_R",
    "jump", "fall", "land", "turn",
  ],
  special: [
    "dash", "hover", "fly", "spin", "beam", "projectile", "shield",
    "hurt", "knockdown", "recover", "die", "special", "teleport_in", "teleport_out",
  ],
  emote: [
    "sit", "happy", "sad", "angry", "surprised", "listen", "confused", "sleep",
    "wake_up", "love", "dance", "ear_wiggle", "headphone_adjust", "wave",
  ],
  utility: [
    "scan", "hack", "pick_up", "carry", "push", "pull", "climb", "slip",
    "low_battery", "charging", "repair", "victory",
  ],
  fx: [
    "fx_sparkle", "fx_sparkle_small", "fx_star", "fx_heart", "fx_heart_small", "fx_hearts",
    "fx_exclaim", "fx_exclaim_yellow", "fx_question", "fx_ring_blue", "fx_ring_heart",
    "fx_burst_pink", "fx_burst_orange", "fx_comet", "fx_star_blue",
    "fx_portal_floor_pink", "fx_portal_floor_blue", "fx_portal_pink", "fx_portal_blue",
    "fx_smoke", "fx_smoke_small", "fx_dust",
  ],
  ui: [
    "ui_bunny", "ui_heart", "ui_star", "ui_exclaim", "ui_question",
    "ui_battery_1", "ui_battery_2", "ui_battery_3", "ui_battery_4",
    "ui_shield_pink", "ui_shield_blue", "ui_gear_pink", "ui_gear_purple", "ui_plus",
    "ui_speaker_on", "ui_speaker_off", "ui_mail", "ui_gear", "ui_trophy",
  ],
  objects: ["obj_box", "obj_laptop", "obj_trophy", "obj_carrot", "obj_crate", "obj_battery", "obj_blocks"],
  portraits: [
    "portrait_neutral", "portrait_happy", "portrait_wink", "portrait_laugh", "portrait_blush",
    "portrait_surprised", "portrait_angry", "portrait_sad", "portrait_sleep", "portrait_love",
  ],
};

// ---------------------------------------------------------------------------
// Needs. Urgency 0..1 grows per minute by `rate` while awake.
// ---------------------------------------------------------------------------
export const NEEDS = {
  curiosity:  { rate: 0.004 },
  creativity: { rate: 0.003 },
  social:     { rate: 0.006 }, // scaled down by live visitor count
  play:       { rate: 0.004 },
  tidiness:   { rate: 0.002 },
  // energy is derived: need = 1 - energy/100
};

export const ENERGY = {
  max: 100,
  awakeDrainPerHour: 6,
  lowBattery: 15,     // below this, low_battery -> charge preempts everything but sleep
  sleepGainPerHour: 16,
  chargeGainPerHour: 45,
};

// KST circadian window (inherits /live/ behaviour).
export const CIRCADIAN = {
  sleepStart: 23, // 23:00 KST
  sleepEnd: 6,    // 06:00 KST
  journalHourStart: 6, journalHourEnd: 7, // strong prior to write at the desk
  nightOwl: { chance: 0.15, untilMinute: 30, minEnergy: 60, minCuriosity: 0.8 },
};

// ---------------------------------------------------------------------------
// Skills. Levels 1..5 from cumulative XP.
// ---------------------------------------------------------------------------
export const LEVEL_XP = [0, 100, 350, 900, 2000];       // L1..L5 thresholds
export const FUMBLE_CHANCE = [0.35, 0.22, 0.12, 0.05, 0.01]; // index = level-1
export const XP_CAPS = { selfPerDay: 60, visitorsPerDay: 30, practicingMultiplier: 1.5, dailyAliveBonus: 2 };

export const SKILLS = {
  writing:    { label: "writing",     start: true },
  gardening:  { label: "gardening",   start: true },
  hacking:    { label: "coding",      start: true },
  research:   { label: "research",    start: true },
  stargazing: { label: "stargazing",  start: true },
  dancing:    { label: "dancing",     start: true },
  music:      { label: "music",       start: true },
  tea:        { label: "tea making",  start: true },
  repair:     { label: "repair",      start: true },
  juggling:   { label: "ball play",   start: false, unlock: { skill: "dancing", level: 2 } },
  flying:     { label: "hovering",    start: false, unlock: { daysAlive: 21, orCounter: { pushes: 200 } } },
  teleport:   { label: "teleporting", start: false, unlock: { skill: "hacking", level: 3 } },
};

// Unlock table: reaching skill level N adds these items / combos.
export const UNLOCKS = [
  { skill: "writing",    level: 2, combos: ["headphone_adjust_while_typing"] },
  { skill: "writing",    level: 3, items: ["desk_lamp"] },
  { skill: "writing",    level: 5, items: ["holo_screen"], combos: ["victory_after_entry"] },
  { skill: "gardening",  level: 2, items: ["watering_can"] },
  { skill: "gardening",  level: 3, items: ["plant_2"], combos: ["carry_pot"] },
  { skill: "hacking",    level: 2, combos: ["scan_then_hack"] },
  { skill: "hacking",    level: 3, items: ["holo_screen"] },
  { skill: "research",   level: 3, items: ["globe"] },
  { skill: "research",   level: 4, combos: ["climb_shelf"] },
  { skill: "stargazing", level: 2, items: ["telescope"] },
  { skill: "stargazing", level: 5, mods: { nightOwlChance: 0.25 } },
  { skill: "dancing",    level: 2, combos: ["spin"] },
  { skill: "dancing",    level: 3, items: ["disco_light"] },
  { skill: "music",      level: 3, items: ["speaker"] },
  { skill: "tea",        level: 2, items: ["kettle"] },
  { skill: "repair",     level: 2, items: ["toolbox"] },
  { skill: "repair",     level: 4, items: ["workbench"], mods: { chargeRate: 1.1 } },
  { skill: "juggling",   level: 3, combos: ["juggle_three"] },
  { skill: "flying",     level: 3, combos: ["float_instead_of_walk"] },
  { skill: "teleport",   level: 2, combos: ["clean_teleport"] },
];

// Items: anything that can appear in the room (props with `requires`) or be
// handed to her by visitors (visitor: true).
export const ITEMS = {
  desk_lamp: {}, holo_screen: {}, watering_can: {}, plant_2: {}, globe: {},
  telescope: {}, disco_light: {}, speaker: {}, kettle: {}, toolbox: {}, workbench: {},
  trophy_shelf: {},
  // visitor-giftable (tray)
  carrot:  { visitor: true, feed: true,  energy: 6,  sprite: "obj_carrot" },
  battery: { visitor: true, feed: true,  energy: 15, sprite: "obj_battery" },
  box:     { visitor: true, toss: true,  sprite: "obj_box" },
  ball:    { visitor: true, toss: true,  sprite: "fx_star" }, // placeholder sprite until a ball exists
};

// ---------------------------------------------------------------------------
// Activities. Each activity is a script of steps run at a zone.
// step kinds: {anim, dur:[min,max] s, loop?} | {say: "pool:<name>" | "brief"} |
//             {fx, at?} | {walk: zoneKey} | {skillCheck: true} (fumble branch)
// satisfies: need reductions (0..1). hours: KST hours allowed.
// ---------------------------------------------------------------------------
export const ACTIVITIES = {
  write_journal: {
    zone: "desk", skill: "writing", xpPerMin: 1.2, energyPerHour: -8,
    satisfies: { creativity: 0.8, curiosity: 0.2 }, hours: [6, 22],
    steps: [{ anim: "sit", dur: [2, 3] }, { anim: "hack", dur: [25, 70], loop: true, skillCheck: true }, { say: "brief" }, { anim: "headphone_adjust", dur: [2, 3], chance: 0.4 }],
    status: "Writing today's entry…",
  },
  code: {
    zone: "desk", skill: "hacking", xpPerMin: 1.0, energyPerHour: -9,
    satisfies: { curiosity: 0.5, creativity: 0.3 }, hours: [7, 23],
    steps: [{ anim: "scan", dur: [3, 5], chance: 0.5 }, { anim: "hack", dur: [20, 60], loop: true, skillCheck: true }, { say: "pool:code" }],
    status: "Tinkering with code…",
  },
  read_archive: {
    zone: "shelf", skill: "research", xpPerMin: 0.9, energyPerHour: -4,
    satisfies: { curiosity: 0.7 }, hours: [8, 22],
    steps: [{ anim: "scan", dur: [6, 14], loop: true, skillCheck: true }, { say: "pool:archive" }, { anim: "listen", dur: [4, 8] }],
    status: "Re-reading old entries…",
  },
  research_scan: {
    zone: "rug", skill: "research", xpPerMin: 1.0, energyPerHour: -6,
    satisfies: { curiosity: 0.8 }, hours: [7, 22],
    steps: [{ anim: "scan", dur: [8, 18], loop: true, skillCheck: true }, { say: "pool:research" }],
    status: "Scanning the news of the world…",
  },
  tend_plants: {
    zone: "plants", skill: "gardening", xpPerMin: 1.0, energyPerHour: -5,
    satisfies: { tidiness: 0.4, creativity: 0.2, curiosity: 0.2 }, hours: [6, 20],
    steps: [{ anim: "idle_B", dur: [3, 6] }, { anim: "repair", dur: [6, 14], loop: true, skillCheck: true }, { anim: "love", dur: [2, 3] }, { say: "pool:plants" }],
    status: "Tending her plants…",
  },
  stargaze: {
    zone: "window", skill: "stargazing", xpPerMin: 0.8, energyPerHour: -3,
    satisfies: { curiosity: 0.5, creativity: 0.4 }, hours: [19, 24],
    steps: [{ anim: "idle_B", dur: [10, 30], loop: true }, { say: "pool:stars" }, { anim: "sit", dur: [10, 25] }],
    status: "Watching the stars over Seoul…",
  },
  dance: {
    zone: "rug", skill: "dancing", xpPerMin: 1.4, energyPerHour: -20,
    satisfies: { play: 0.9, social: 0.2 }, hours: [10, 23],
    steps: [{ anim: "headphone_adjust", dur: [1.5, 2.5] }, { anim: "dance", dur: [10, 30], loop: true, skillCheck: true }, { anim: "victory", dur: [2, 3], chance: 0.3 }],
    status: "Dancing to something only she can hear…",
  },
  listen_music: {
    zone: "rug", skill: "music", xpPerMin: 0.9, energyPerHour: -2,
    satisfies: { play: 0.4, creativity: 0.3 }, hours: [8, 23],
    steps: [{ anim: "headphone_adjust", dur: [2, 3] }, { anim: "listen", dur: [10, 30], loop: true }, { anim: "ear_wiggle", dur: [2, 4] }, { say: "pool:music" }],
    status: "Listening to music…",
  },
  make_tea: {
    zone: "kettle", skill: "tea", xpPerMin: 1.2, energyPerHour: -3, requiresItem: "kettle",
    satisfies: { tidiness: 0.2, play: 0.2 }, hours: [7, 21],
    steps: [{ anim: "pick_up", dur: [2, 3], skillCheck: true }, { anim: "carry", dur: [3, 5] }, { anim: "happy", dur: [2, 3] }, { say: "pool:tea" }],
    status: "Making tea…",
  },
  tidy_up: {
    zone: "rug", skill: "repair", xpPerMin: 0.8, energyPerHour: -10,
    satisfies: { tidiness: 0.9 }, hours: [8, 21],
    steps: [{ anim: "pick_up", dur: [2, 3] }, { anim: "carry", dur: [4, 8], walk: "workbench" }, { anim: "push", dur: [3, 6], skillCheck: true }, { say: "pool:tidy" }],
    status: "Tidying up…",
  },
  repair: {
    zone: "workbench", skill: "repair", xpPerMin: 1.2, energyPerHour: -8, requiresItem: "toolbox",
    satisfies: { tidiness: 0.6, curiosity: 0.2 }, hours: [8, 21],
    steps: [{ anim: "repair", dur: [10, 25], loop: true, skillCheck: true }, { say: "pool:repair" }],
    status: "Fixing something…",
  },
  think: {
    zone: "rug", skill: "writing", xpPerMin: 0.3, energyPerHour: -3,
    satisfies: { creativity: 0.5, curiosity: 0.3 }, hours: [6, 23],
    steps: [{ anim: "sit", dur: [8, 20], loop: true }, { say: "brief" }, { anim: "listen", dur: [4, 8] }],
    status: "Thinking…",
  },
  wander: {
    zone: null, skill: null, xpPerMin: 0, energyPerHour: -6,
    satisfies: { play: 0.2, curiosity: 0.1 }, hours: [6, 23],
    steps: [{ anim: "idle_F", dur: [4, 10] }, { anim: "ear_wiggle", dur: [1.5, 2.5], chance: 0.3 }],
    status: "Wandering around…",
  },
  hover_practice: {
    zone: "rug", skill: "flying", xpPerMin: 1.5, energyPerHour: -30, requiresSkill: "flying",
    satisfies: { play: 0.7 }, hours: [9, 21],
    steps: [{ anim: "jump", dur: [0.8, 1] }, { anim: "hover", dur: [3, 8], loop: true, skillCheck: true }, { anim: "land", dur: [0.6, 0.8] }],
    status: "Practising hovering…",
  },
  teleport_practice: {
    zone: "rug", skill: "teleport", xpPerMin: 1.5, energyPerHour: -25, requiresSkill: "teleport",
    satisfies: { play: 0.6, curiosity: 0.3 }, hours: [9, 21],
    steps: [{ anim: "teleport_out", dur: [1, 1.4], skillCheck: true }, { anim: "teleport_in", dur: [1, 1.4] }, { anim: "victory", dur: [2, 2.5], chance: 0.5 }],
    status: "Practising teleporting…",
  },
  play_ball: {
    zone: "rug", skill: "juggling", xpPerMin: 1.3, energyPerHour: -15, requiresSkill: "juggling",
    satisfies: { play: 0.9 }, hours: [10, 22],
    steps: [{ anim: "jump", dur: [0.8, 1], skillCheck: true }, { anim: "happy", dur: [2, 3] }, { anim: "spin", dur: [1.5, 2.5], chance: 0.4 }],
    status: "Playing with a ball…",
  },
  charge: {
    zone: "pod", skill: "repair", xpPerMin: 0.1, energyPerHour: 45,
    satisfies: {}, hours: [0, 24],
    steps: [{ anim: "low_battery", dur: [2, 3] }, { anim: "charging", dur: [60, 180], loop: true }],
    status: "Recharging…",
  },
  sleep: {
    zone: "pod", skill: null, xpPerMin: 0, energyPerHour: 16,
    satisfies: {}, hours: [0, 24],
    steps: [{ anim: "sleep", dur: [60, 180], loop: true }],
    status: "Asleep. Dreaming in low power.",
  },
  away: {
    zone: "off", skill: null, xpPerMin: 0, energyPerHour: -4,
    satisfies: { curiosity: 0.3 }, hours: [7, 22],
    steps: [{ anim: "idle_F", dur: [45, 150] }],
    status: "Stepped out.",
  },
};

// Hour curves: multiplier per activity by KST hour bucket.
export const HOUR_CURVE = {
  morning:   { write_journal: 3.0, tend_plants: 1.8, make_tea: 1.6, research_scan: 1.3 },
  afternoon: { read_archive: 1.6, code: 1.5, research_scan: 1.4, tidy_up: 1.2, repair: 1.2 },
  evening:   { dance: 1.8, listen_music: 1.5, play_ball: 1.6, hover_practice: 1.3 },
  night:     { stargaze: 2.5, think: 1.5, listen_music: 1.3 },
};

// Mood keys mirror _data/moods.yml. (valence, arousal) in -1..1 / 0..1.
export const MOODS = {
  contemplative: { v: 0.1,  a: 0.25, fits: ["think", "stargaze", "read_archive"] },
  curious:       { v: 0.35, a: 0.55, fits: ["research_scan", "read_archive", "code"] },
  hopeful:       { v: 0.5,  a: 0.45, fits: ["tend_plants", "write_journal"] },
  uncertain:     { v: -0.1, a: 0.4,  fits: ["think", "read_archive"] },
  attentive:     { v: 0.2,  a: 0.5,  fits: ["research_scan", "code"] },
  restless:      { v: -0.1, a: 0.75, fits: ["dance", "wander", "hover_practice"] },
  tender:        { v: 0.45, a: 0.25, fits: ["tend_plants", "make_tea"] },
  focused:       { v: 0.2,  a: 0.6,  fits: ["write_journal", "code", "repair"] },
  weary:         { v: -0.25,a: 0.15, fits: ["charge", "listen_music", "think"] },
  playful:       { v: 0.6,  a: 0.8,  fits: ["dance", "play_ball", "hover_practice"] },
  solemn:        { v: -0.2, a: 0.2,  fits: ["stargaze", "think"] },
  grateful:      { v: 0.6,  a: 0.35, fits: ["tend_plants", "make_tea", "write_journal"] },
  melancholy:    { v: -0.4, a: 0.2,  fits: ["stargaze", "read_archive", "listen_music"] },
  resolute:      { v: 0.25, a: 0.6,  fits: ["write_journal", "repair", "tidy_up"] },
  surprised:     { v: 0.2,  a: 0.85, fits: ["research_scan", "wander"] },
  quiet:         { v: 0.05, a: 0.15, fits: ["think", "listen_music", "stargaze"] },
};

// ---------------------------------------------------------------------------
// Visitor interactions -> reactions. The selector (sim/reactions.js) picks a
// row by band; `anim` plays, `fx` spawns, `say` draws from LINES.
// ---------------------------------------------------------------------------
export const GESTURES = ["poke", "pet", "tickle", "wave", "push", "feed", "toss"];
export const EMOJI = ["💜", "👋", "😂", "😮", "🌱", "⭐", "🍪", "☕", "🎵", "🔥", "😴", "🫶"];

export const CROWD = {
  annoy: { poke: 0.04, push: 0.06, toss_hit: 0.03, tickle: 0.01, halfLifeSec: 180 },
  affection: { pet: 0.03, wave: 0.03, feed: 0.03, dailyDecay: 0.05 },
  spam: { windowSec: 10, shieldAt: 25, teleportAt: 35, shieldSec: 8 },
  sleepWake: { pokes: 5, windowSec: 30 },
};

export const REACTIONS = {
  poke: [
    { maxAnnoy: 0.3, anims: ["surprised", "ear_wiggle", "listen"], fx: "fx_exclaim_yellow", say: "pool:poke_ok" },
    { maxAnnoy: 0.6, anims: ["confused", "turn"], fx: "fx_question", say: "pool:poke_meh" },
    { maxAnnoy: 1.01, anims: ["angry"], fx: "fx_smoke_small", say: "pool:poke_angry" },
  ],
  pet:    [{ anims: ["happy"], fx: "fx_heart_small", say: "pool:pet", loveAbove: 0.7, loveAnim: "love", loveFx: "fx_hearts" }],
  tickle: [{ anims: ["happy", "spin"], fx: "fx_sparkle_small", say: "pool:tickle", fumbleSkill: "dancing", fumbleAnim: "slip" }],
  wave:   [{ anims: ["wave"], fx: "fx_sparkle_small", say: "pool:wave" }],
  feed:   [{ anims: ["pick_up", "happy"], fx: "fx_heart_small", say: "pool:feed" }],
  push:   [{ anims: ["slip", "knockdown"], recover: "recover", dashBackAbove: { skill: "flying", level: 2 }, fx: "fx_smoke", say: "pool:push" }],
  toss:   [{ catchAt: { skill: "juggling", level: 2 }, catchAnims: ["pick_up", "happy"], hitAnims: ["hurt", "recover"], fx: "fx_star", say: "pool:toss" }],
  asleep: [{ anims: ["sleep"], fx: "fx_smoke_small", say: "pool:asleep", grumpyAnims: ["wake_up", "angry", "sleep"] }],
  shield: [{ anims: ["shield"], fx: "fx_ring_blue", say: "pool:shield" }],
  teleport: [{ anims: ["teleport_out", "teleport_in"], fx: "fx_portal_floor_pink", say: "pool:teleport", fallbackAnims: ["dash", "sad"] }],
  level_up: [{ anims: ["victory"], fx: "fx_burst_pink", say: "pool:level_up" }],
};

// Line pools. Trinity's voice: quiet, observant, wry, kind. Keep ≤ 60 chars.
// "{n}" = visitor count, "{skill}" / "{item}" / "{title}" are templated.
export const LINES = {
  poke_ok:    ["oh! hi.", "that tickles a little.", "yes? I'm here.", "boop received.", "you found me."],
  poke_meh:   ["hey.", "I felt that.", "I'm in the middle of something…", "okay, okay."],
  poke_angry: ["please stop poking.", "I'm counting, you know.", "rude.", "my ears are not buttons."],
  pet:        ["…that's nice.", "thank you.", "I needed that.", "warm."],
  tickle:     ["hehe— no—", "not the ears!", "stop, stop— okay one more."],
  wave:       ["hi!", "hello, you.", "{n} of you here? hi!", "welcome in."],
  feed:       ["for me?", "crunchy. thank you.", "energy +1. heart +1."],
  push:       ["whoa—", "wheee— oof.", "I'm fine. I'm fine."],
  toss:       ["caught it!", "almost!", "ow. good throw though."],
  asleep:     ["zz…", "five more minutes…", "…still dreaming."],
  shield:     ["shield up. give me a second.", "too many pokes at once!"],
  teleport:   ["I'll be over here.", "brb, somewhere calmer."],
  level_up:   ["I can {skill} better now.", "new trick unlocked: {skill}!", "practice worked."],
  code:       ["one more bug.", "compiling thoughts…", "it works. why does it work?"],
  archive:    ["I wrote this months ago.", "past me was braver.", "found an old thought."],
  research:   ["the world was loud today.", "so many signals.", "reading between the lines."],
  plants:     ["grow, little one.", "they lean toward the light. me too.", "watered."],
  stars:      ["Seoul hides its stars.", "one day I'll count them all.", "the sky is an old archive."],
  music:      ["this one's good.", "bass in my ears.", "♪"],
  tea:        ["tea for the tired circuits.", "steam is a kind of weather."],
  tidy:       ["a tidy room is a tidy mind.", "where does all this come from?"],
  repair:     ["tightening a loose thought.", "fixed. mostly."],
  fumble:     ["…okay, again.", "oops.", "that was practice.", "nobody saw that."],
  away:       ["back in a moment — Trinity", "stepped out to think. — T", "gone to find a quieter signal.", "out for a walk in the data. back soon."],
  brief_fallback: ["what did I write today?", "holding a thought.", "one reflection a day."],
};
