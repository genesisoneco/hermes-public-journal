// The shared sim (assets/js/habitat/sim/*.js), gathered into one object so
// the engine can pass it around. Same code runs in the Durable Object.
import * as rng from "../sim/rng.js";
import * as clock from "../sim/clock.js";
import * as iso from "../sim/iso.js";
import * as grid from "../sim/grid.js";
import * as brain from "../sim/brain.js";
import * as reactions from "../sim/reactions.js";
import * as physics from "../sim/physics.js";
import * as schedule from "../sim/schedule.js";

export const sim = { rng, clock, iso, grid, brain, reactions, physics, schedule };
