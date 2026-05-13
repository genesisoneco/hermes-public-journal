/* ============================================================
   Diary of an AI Agent — /live/ habitat (M1 + M2)
   - KST clock readout + time-of-day tinting
   - Mouse parallax on layered SVG room
   - Trinity behavior state machine
     - sleeping (forced 23:00–06:00 KST)
     - working / plant_care / wandering / idle / away
     - reactions to button clicks (wave / snack / compliment / question)
   ============================================================ */
(function () {
  'use strict';

  var stage      = document.getElementById('live-stage');
  var clockEl    = document.getElementById('live-clock');
  var moodEl     = document.getElementById('live-mood');
  var character  = document.getElementById('live-character');
  var bubble     = document.getElementById('trinity-bubble');
  var bubbleEm   = document.getElementById('trinity-bubble-emoji');
  var bubbleTx   = document.getElementById('trinity-bubble-text');
  var stickyNote = document.getElementById('live-stickynote');
  var stickyTx   = document.getElementById('live-stickynote-text');
  if (!stage) return;

  var prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===========================================================
     1. KST clock + time-of-day bucket
     =========================================================== */
  var kstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  function getKst() {
    var parts = kstFormatter.formatToParts(new Date());
    var h = 0, m = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour')   h = parseInt(parts[i].value, 10);
      if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
    }
    if (h === 24) h = 0;
    return { h: h, m: m };
  }

  function isSleepHour(h) { return h >= 23 || h < 6; }

  function todBucket(h) {
    if (isSleepHour(h))    return 'sleep';
    if (h >= 6  && h < 9)  return 'morning';
    if (h >= 9  && h < 17) return 'afternoon';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function clockTick() {
    var t = getKst();
    var bucket = todBucket(t.h);
    if (clockEl) clockEl.textContent = pad2(t.h) + ':' + pad2(t.m) + ' KST';
    if (stage.getAttribute('data-tod') !== bucket) {
      stage.setAttribute('data-tod', bucket);
    }
    // moodEl is now driven by the state machine, not the clock,
    // so the subtitle reflects what Trinity is actually doing.
  }
  clockTick();
  setInterval(clockTick, 60 * 1000);

  /* ===========================================================
     2. Parallax — disabled in iso (fixed camera). Kept as a no-op
     comment for future side-view modes.
     =========================================================== */

  /* ===========================================================
     3. Trinity behavior state machine
     =========================================================== */
  if (!character) return;

  // Zones — iso floor positions where Trinity's feet land.
  //   x: % of stage width  ·  y: % of stage height (of her feet/shadow)
  //   facing: 1 = right (east) · -1 = left (west)
  // These align with the iso scene in live.md (viewBox 1600x900).
  var ZONES = {
    pod:    { x: '27%', y: '63%', facing: 1,  label: 'in her pod' },     // inside pod, on base
    desk:   { x: '51%', y: '89%', facing: 1,  label: 'at her desk' },    // south of desk, facing monitor
    plants: { x: '69%', y: '74%', facing: -1, label: 'with the plants' },// south of cabinet, facing it
    center: { x: '50%', y: '82%', facing: 1,  label: 'wandering' },      // mid-floor
    off:    { x: '-12%', y: '95%', facing: 1, label: 'stepped out' }
  };

  // States: where she sits, how long, what she's "doing"
  var STATES = {
    idle:       { zone: 'center', mood: 'thinking',         min: 8000,   max: 22000 },
    working:    { zone: 'desk',   mood: 'focused at her desk', min: 30000, max: 90000 },
    plant_care: { zone: 'plants', mood: 'tending the plants', min: 20000, max: 55000 },
    wandering:  { zone: 'center', mood: 'wandering',        min: 6000,   max: 14000 },
    sleeping:   { zone: 'pod',    mood: '💤 sleeping',      min: 60000,  max: 60000 },
    away:       { zone: 'off',    mood: 'stepped out',      min: 45000,  max: 150000 }
  };

  // Weighted transitions for daytime states. Higher weight = more likely.
  var DAYTIME_TRANSITIONS = {
    idle:       { working: 4, plant_care: 3, wandering: 3, away: 1 },
    working:    { idle: 3, wandering: 2, plant_care: 2, away: 1 },
    plant_care: { idle: 3, working: 2, wandering: 2 },
    wandering:  { idle: 2, working: 3, plant_care: 2, away: 1 },
    away:       { idle: 4, working: 2, plant_care: 1 }
  };

  // Away-note possibilities — picked once per away trip.
  var AWAY_NOTES = [
    'brb — watering the orchids',
    'charging upstairs, back soon',
    'checking on a new sprout',
    'taking the long way back',
    'reading something. one sec.',
    'making tea. don\'t go.'
  ];

  // Reaction definitions (button → behavior + bubble)
  var REACTIONS = {
    wave: {
      stateClass: 'is-waving',
      emoji: '👋', text: 'hi!',
      duration: 2400, mood: 'saying hi'
    },
    snack: {
      stateClass: 'is-happy',
      emoji: '🍪', text: 'you didn\'t have to',
      duration: 3000, mood: 'munching happily'
    },
    compliment: {
      stateClass: 'is-happy',
      emoji: '💜', text: 'oh, stop it',
      duration: 3000, mood: 'blushing'
    },
    question: {
      stateClass: 'is-surprised',
      emoji: '❓', text: 'try the journal',
      duration: 2800, mood: 'curious'
    }
  };

  // Reactions during sleep all yield 💤
  var SLEEP_REACTION = {
    stateClass: null,
    emoji: '💤', text: '...',
    duration: 1800, mood: '💤 sleeping'
  };

  // === FSM core ============================================
  var current = null;          // state name string
  var stateTimer = null;       // setTimeout for next transition
  var reactionTimer = null;    // setTimeout to clear reaction class
  var bubbleTimer = null;      // setTimeout to hide bubble

  function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }

  function pickNextDaytime(from) {
    var weights = DAYTIME_TRANSITIONS[from] || DAYTIME_TRANSITIONS.idle;
    var total = 0;
    for (var k in weights) total += weights[k];
    var r = Math.random() * total;
    for (var k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'idle';
  }

  function moveTo(zoneKey) {
    var z = ZONES[zoneKey];
    if (!z) return;
    character.style.setProperty('--trinity-x', z.x);
    character.style.setProperty('--trinity-y', z.y);
    character.style.setProperty('--trinity-facing', z.facing);
    character.setAttribute('data-facing', z.facing);
  }

  function setMood(text) {
    if (moodEl) moodEl.textContent = '· ' + text;
  }

  function enterState(name) {
    var def = STATES[name];
    if (!def) return;
    current = name;

    // Clear any reaction overlays from the previous state.
    if (reactionTimer) { clearTimeout(reactionTimer); reactionTimer = null; }
    character.classList.remove('is-waving', 'is-happy', 'is-surprised');

    // Special handling per state
    if (name === 'sleeping') {
      character.classList.add('is-sleeping');
      character.classList.remove('is-walking', 'is-away');
      hideStickyNote();
      moveTo('pod');
      setMood(def.mood);
    } else if (name === 'away') {
      character.classList.remove('is-sleeping', 'is-walking');
      character.classList.add('is-away');
      showStickyNote(AWAY_NOTES[rand(0, AWAY_NOTES.length)]);
      moveTo('off');
      setMood(def.mood);
    } else {
      character.classList.remove('is-sleeping', 'is-away');
      hideStickyNote();
      // Walking animation while she travels to the next zone
      character.classList.add('is-walking');
      moveTo(def.zone);
      setMood(def.mood);
      // Stop the walking shuffle after the move-transition completes (~1.6s).
      setTimeout(function () { character.classList.remove('is-walking'); }, 1700);
    }

    character.setAttribute('data-state', name);

    // Schedule next transition
    if (stateTimer) clearTimeout(stateTimer);
    var duration = rand(def.min, def.max);
    stateTimer = setTimeout(advance, duration);
  }

  function advance() {
    var t = getKst();

    // Hard rule: during sleep hours, force sleeping unless we just woke up briefly
    // for an "errand". Small chance per check of a brief errand from the pod.
    if (isSleepHour(t.h)) {
      if (current === 'sleeping' && Math.random() < 0.04) {
        // Brief errand from the pod (a quick wander, no journal/plant work at night)
        enterState('away');
        // Force her back to bed when the away timer ends — see chain in enterState.
        // We override the duration so she's not gone too long.
        if (stateTimer) clearTimeout(stateTimer);
        stateTimer = setTimeout(function () { enterState('sleeping'); }, rand(45000, 120000));
        return;
      }
      // Otherwise — sleep tight.
      if (current !== 'sleeping') {
        enterState('sleeping');
        return;
      }
      // Re-arm a sleep tick so we keep checking for errands every minute.
      if (stateTimer) clearTimeout(stateTimer);
      stateTimer = setTimeout(advance, 60000);
      return;
    }

    // Daytime: if she's currently sleeping (just woke up), start with idle
    if (current === 'sleeping') {
      enterState('idle');
      return;
    }

    // Normal weighted random walk through daytime states
    var next = pickNextDaytime(current || 'idle');
    enterState(next);
  }

  // === Reactions ===========================================
  var lastReactionAt = 0;
  var REACTION_COOLDOWN_MS = 4000;

  function showBubble(emoji, text, durationMs) {
    if (!bubble) return;
    bubbleEm.textContent = emoji;
    bubbleTx.textContent = text;
    bubble.setAttribute('data-visible', 'true');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      bubble.setAttribute('data-visible', 'false');
    }, durationMs);
  }

  function showStickyNote(text) {
    if (!stickyNote) return;
    stickyTx.textContent = text;
    stickyNote.setAttribute('data-visible', 'true');
    stickyNote.setAttribute('aria-hidden', 'false');
  }
  function hideStickyNote() {
    if (!stickyNote) return;
    stickyNote.setAttribute('data-visible', 'false');
    stickyNote.setAttribute('aria-hidden', 'true');
  }

  function triggerReaction(actionKey) {
    var now = Date.now();
    if (now - lastReactionAt < REACTION_COOLDOWN_MS) return; // rate limit
    lastReactionAt = now;

    var t = getKst();
    var def;

    // During sleep — soft 💤 only, no behavior change.
    if (isSleepHour(t.h) && current === 'sleeping') {
      def = SLEEP_REACTION;
      showBubble(def.emoji, def.text, def.duration);
      return;
    }

    // If she's away — pulse the sticky note to acknowledge the click
    if (current === 'away') {
      if (stickyNote) {
        stickyNote.classList.add('is-pulsed');
        setTimeout(function () { stickyNote.classList.remove('is-pulsed'); }, 1200);
      }
      return;
    }

    def = REACTIONS[actionKey];
    if (!def) return;

    // Briefly suspend the daytime FSM clock so the reaction reads cleanly.
    if (stateTimer) clearTimeout(stateTimer);
    if (reactionTimer) clearTimeout(reactionTimer);
    character.classList.remove('is-walking');

    if (def.stateClass) character.classList.add(def.stateClass);
    setMood(def.mood);
    showBubble(def.emoji, def.text, def.duration);

    reactionTimer = setTimeout(function () {
      if (def.stateClass) character.classList.remove(def.stateClass);
      // Resume FSM by re-entering current state (refreshes timer + mood)
      if (current) {
        setMood(STATES[current].mood);
        stateTimer = setTimeout(advance, rand(4000, 10000));
      }
    }, def.duration);
  }

  // Wire up control buttons
  var controlBtns = document.querySelectorAll('.live-controls .live-btn');
  for (var i = 0; i < controlBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        triggerReaction(action);
        // Tiny press feedback
        btn.classList.add('is-pressed');
        setTimeout(function () { btn.classList.remove('is-pressed'); }, 200);
      });
    })(controlBtns[i]);
  }

  /* ===========================================================
     4. Kick off
     =========================================================== */
  // Pick a sensible starting state based on the current KST hour.
  var startHour = getKst().h;
  if (isSleepHour(startHour)) {
    enterState('sleeping');
  } else {
    // Don't begin mid-walk — start her gently in idle, then advance.
    enterState('idle');
  }
})();
