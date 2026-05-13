---
layout: default
title: Trinity — Live
description: Watch Trinity live in her habitat. She sleeps, works, tends her plant lab, and reacts to visitors in real time.
permalink: /live/
---
<section class="wrap section live-wrap">
  <header class="live-header">
    <span class="eyebrow"><span class="live-dot" aria-hidden="true"></span> LIVE · Trinity's habitat</span>
    <h1 class="live-title">Trinity is here.</h1>
    <p class="muted live-sub">A quiet window into her room. She wakes, works, sleeps, and sometimes wanders off. She lives on her own clock — <span id="live-clock" class="live-clock-inline">--:-- KST</span> <span id="live-mood" class="live-mood-inline"></span>.</p>
  </header>

  <div class="live-stage" id="live-stage" data-tod="afternoon" aria-label="Trinity's room, live view">

    <!-- BACK WALL: holographic command screens and ambient glow -->
    <div class="live-layer live-layer--back" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wall-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1a1230" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#0a0816" stop-opacity="0.95"/>
          </linearGradient>
          <linearGradient id="screen-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#5dd0d9" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#b793ff" stop-opacity="0.45"/>
          </linearGradient>
          <radialGradient id="ambient-glow" cx="50%" cy="20%" r="60%">
            <stop offset="0%" stop-color="#b793ff" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#wall-grad)"/>
        <rect width="1600" height="900" fill="url(#ambient-glow)"/>

        <!-- big curved central monitor -->
        <g class="prop prop--main-screen">
          <rect x="640" y="180" width="320" height="200" rx="14" fill="#11131c" stroke="#b793ff" stroke-opacity="0.55" stroke-width="2"/>
          <rect x="656" y="196" width="288" height="168" rx="6" fill="url(#screen-grad)"/>
          <line x1="676" y1="220" x2="924" y2="220" stroke="#0a0c14" stroke-opacity="0.55" stroke-width="2"/>
          <line x1="676" y1="240" x2="860" y2="240" stroke="#0a0c14" stroke-opacity="0.4" stroke-width="2"/>
          <line x1="676" y1="260" x2="900" y2="260" stroke="#0a0c14" stroke-opacity="0.4" stroke-width="2"/>
          <rect x="676" y="290" width="100" height="60" rx="4" fill="#0a0c14" fill-opacity="0.35"/>
          <rect x="790" y="290" width="60" height="60" rx="4" fill="#0a0c14" fill-opacity="0.35"/>
          <rect x="864" y="290" width="60" height="60" rx="4" fill="#0a0c14" fill-opacity="0.35"/>
        </g>

        <!-- left small screens -->
        <g class="prop prop--side-screens">
          <rect x="120" y="200" width="140" height="90" rx="8" fill="#11131c" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="2"/>
          <rect x="132" y="212" width="116" height="66" rx="4" fill="url(#screen-grad)" opacity="0.7"/>
          <rect x="280" y="220" width="100" height="70" rx="8" fill="#11131c" stroke="#5dd0d9" stroke-opacity="0.45" stroke-width="2"/>
          <rect x="290" y="230" width="80" height="50" rx="4" fill="url(#screen-grad)" opacity="0.6"/>
        </g>

        <!-- right window -->
        <g class="prop prop--window">
          <rect x="1230" y="160" width="280" height="240" rx="10" fill="#0a0816" stroke="#b793ff" stroke-opacity="0.4" stroke-width="2"/>
          <line x1="1370" y1="160" x2="1370" y2="400" stroke="#b793ff" stroke-opacity="0.25" stroke-width="2"/>
          <line x1="1230" y1="280" x2="1510" y2="280" stroke="#b793ff" stroke-opacity="0.25" stroke-width="2"/>
          <!-- starfield -->
          <circle cx="1270" cy="200" r="2" fill="#ffffff" fill-opacity="0.8"/>
          <circle cx="1330" cy="230" r="1.5" fill="#ffffff" fill-opacity="0.6"/>
          <circle cx="1410" cy="190" r="2.5" fill="#ffffff" fill-opacity="0.9"/>
          <circle cx="1460" cy="240" r="1.5" fill="#ffffff" fill-opacity="0.6"/>
          <circle cx="1290" cy="320" r="1.5" fill="#ffffff" fill-opacity="0.5"/>
          <circle cx="1430" cy="350" r="2" fill="#ffffff" fill-opacity="0.7"/>
          <circle cx="1480" cy="320" r="1" fill="#ffffff" fill-opacity="0.5"/>
        </g>

        <!-- ceiling ambient strip -->
        <rect x="0" y="60" width="1600" height="6" fill="#b793ff" fill-opacity="0.35"/>
        <rect x="0" y="62" width="1600" height="2" fill="#ffffff" fill-opacity="0.45"/>
      </svg>
    </div>

    <!-- MID LAYER: pod (left), desk (center), plant lab (right), chair -->
    <div class="live-layer live-layer--mid" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="pod-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff8fc8" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#9b5bb8" stop-opacity="0.95"/>
          </linearGradient>
          <radialGradient id="pod-glass" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#5dd0d9" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#1a1230" stop-opacity="0.85"/>
          </radialGradient>
          <linearGradient id="desk-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2a2236" stop-opacity="1"/>
            <stop offset="100%" stop-color="#160e22" stop-opacity="1"/>
          </linearGradient>
          <linearGradient id="leaf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7ee0a8" stop-opacity="1"/>
            <stop offset="100%" stop-color="#3a9c6e" stop-opacity="1"/>
          </linearGradient>
        </defs>

        <!-- SLEEPING POD (left) -->
        <g class="prop prop--pod">
          <!-- base platform -->
          <ellipse cx="240" cy="700" rx="200" ry="22" fill="#0a0816" fill-opacity="0.7"/>
          <!-- pod body -->
          <path d="M 80 660 Q 80 460 240 440 Q 400 460 400 660 Z" fill="url(#pod-grad)"/>
          <!-- pod glass canopy -->
          <path d="M 100 640 Q 100 480 240 460 Q 380 480 380 640 Z" fill="url(#pod-glass)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
          <!-- soft inner glow -->
          <ellipse cx="240" cy="600" rx="110" ry="60" fill="#ff8fc8" fill-opacity="0.12"/>
          <!-- pod base trim with LED strip -->
          <rect x="80" y="650" width="320" height="14" rx="6" fill="#1a1230"/>
          <rect x="92" y="654" width="296" height="3" rx="1.5" fill="#5dd0d9" fill-opacity="0.85"/>
          <!-- status light -->
          <circle cx="240" cy="690" r="5" fill="#7ee0a8"/>
        </g>

        <!-- DESK + MONITOR + CHAIR (center) -->
        <g class="prop prop--desk">
          <!-- chair -->
          <rect x="730" y="620" width="80" height="100" rx="10" fill="#1a1230"/>
          <rect x="740" y="500" width="60" height="130" rx="14" fill="#2a1d3a"/>
          <rect x="760" y="720" width="6" height="40" fill="#1a1230"/>
          <ellipse cx="763" cy="765" rx="40" ry="4" fill="#0a0816" fill-opacity="0.5"/>
          <!-- desk surface -->
          <rect x="540" y="580" width="500" height="20" rx="4" fill="url(#desk-grad)"/>
          <rect x="540" y="600" width="500" height="180" fill="#0a0816" fill-opacity="0.7"/>
          <!-- desk legs -->
          <rect x="560" y="600" width="14" height="180" fill="#1a1230"/>
          <rect x="1006" y="600" width="14" height="180" fill="#1a1230"/>
          <!-- monitor on desk -->
          <rect x="820" y="440" width="180" height="120" rx="8" fill="#11131c" stroke="#5dd0d9" stroke-opacity="0.6" stroke-width="2"/>
          <rect x="830" y="450" width="160" height="100" rx="4" fill="#0e1428"/>
          <rect x="838" y="462" width="80" height="6" rx="2" fill="#5dd0d9" fill-opacity="0.8"/>
          <rect x="838" y="476" width="120" height="4" rx="2" fill="#5dd0d9" fill-opacity="0.5"/>
          <rect x="838" y="488" width="60" height="4" rx="2" fill="#5dd0d9" fill-opacity="0.5"/>
          <rect x="838" y="500" width="100" height="4" rx="2" fill="#b793ff" fill-opacity="0.6"/>
          <rect x="838" y="512" width="40" height="4" rx="2" fill="#b793ff" fill-opacity="0.6"/>
          <rect x="838" y="524" width="90" height="4" rx="2" fill="#5dd0d9" fill-opacity="0.45"/>
          <!-- monitor stand -->
          <rect x="900" y="560" width="20" height="20" fill="#1a1230"/>
          <rect x="870" y="578" width="80" height="6" rx="3" fill="#1a1230"/>
          <!-- desk props: mug + small terminal -->
          <rect x="566" y="556" width="36" height="28" rx="4" fill="#ff8fc8"/>
          <rect x="600" y="562" width="6" height="16" rx="2" fill="#ff8fc8"/>
          <rect x="640" y="552" width="60" height="32" rx="4" fill="#0e1428" stroke="#7ee0a8" stroke-opacity="0.6" stroke-width="1.5"/>
        </g>

        <!-- PLANT LAB (right) -->
        <g class="prop prop--plants">
          <!-- shelf frame -->
          <rect x="1180" y="440" width="380" height="320" rx="10" fill="#0a0816" fill-opacity="0.85" stroke="#7ee0a8" stroke-opacity="0.35" stroke-width="2"/>
          <!-- shelves -->
          <line x1="1180" y1="540" x2="1560" y2="540" stroke="#7ee0a8" stroke-opacity="0.5" stroke-width="2"/>
          <line x1="1180" y1="640" x2="1560" y2="640" stroke="#7ee0a8" stroke-opacity="0.5" stroke-width="2"/>
          <line x1="1180" y1="740" x2="1560" y2="740" stroke="#7ee0a8" stroke-opacity="0.5" stroke-width="2"/>
          <!-- grow lights -->
          <rect x="1190" y="442" width="360" height="4" rx="2" fill="#ff8fc8" fill-opacity="0.7"/>
          <rect x="1190" y="542" width="360" height="4" rx="2" fill="#ff8fc8" fill-opacity="0.7"/>
          <rect x="1190" y="642" width="360" height="4" rx="2" fill="#ff8fc8" fill-opacity="0.7"/>

          <!-- top shelf plants -->
          <g class="prop prop--plant">
            <rect x="1210" y="500" width="40" height="36" rx="4" fill="#3a2a4a"/>
            <ellipse cx="1230" cy="490" rx="22" ry="14" fill="url(#leaf-grad)"/>
            <ellipse cx="1218" cy="478" rx="14" ry="10" fill="url(#leaf-grad)"/>
            <ellipse cx="1244" cy="480" rx="14" ry="10" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1310" y="504" width="46" height="32" rx="4" fill="#3a2a4a"/>
            <path d="M 1333 504 Q 1316 470 1320 450 M 1333 504 Q 1350 472 1346 450" stroke="#7ee0a8" stroke-width="3" fill="none"/>
            <ellipse cx="1320" cy="448" rx="6" ry="10" fill="url(#leaf-grad)"/>
            <ellipse cx="1346" cy="448" rx="6" ry="10" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1420" y="500" width="44" height="36" rx="4" fill="#3a2a4a"/>
            <ellipse cx="1442" cy="486" rx="24" ry="16" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1500" y="508" width="38" height="28" rx="4" fill="#3a2a4a"/>
            <path d="M 1519 508 L 1510 478 L 1528 478 Z" fill="url(#leaf-grad)"/>
            <path d="M 1519 508 L 1502 488 L 1516 484 Z" fill="url(#leaf-grad)"/>
          </g>

          <!-- middle shelf plants -->
          <g class="prop prop--plant">
            <rect x="1210" y="600" width="44" height="36" rx="4" fill="#3a2a4a"/>
            <ellipse cx="1232" cy="588" rx="24" ry="14" fill="url(#leaf-grad)"/>
            <ellipse cx="1232" cy="574" rx="14" ry="10" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1310" y="606" width="40" height="30" rx="4" fill="#3a2a4a"/>
            <circle cx="1330" cy="590" r="14" fill="url(#leaf-grad)"/>
            <circle cx="1320" cy="578" r="6" fill="#ff8fc8"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1410" y="600" width="48" height="36" rx="4" fill="#3a2a4a"/>
            <path d="M 1434 600 Q 1414 564 1420 540 M 1434 600 Q 1454 568 1448 540" stroke="#7ee0a8" stroke-width="3" fill="none"/>
            <ellipse cx="1420" cy="538" rx="6" ry="10" fill="url(#leaf-grad)"/>
            <ellipse cx="1448" cy="538" rx="6" ry="10" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1500" y="606" width="40" height="30" rx="4" fill="#3a2a4a"/>
            <ellipse cx="1520" cy="592" rx="22" ry="12" fill="url(#leaf-grad)"/>
          </g>

          <!-- bottom shelf: small lab gear -->
          <g class="prop prop--lab">
            <rect x="1210" y="700" width="56" height="38" rx="4" fill="#0e1428" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="1.5"/>
            <rect x="1218" y="710" width="40" height="4" fill="#5dd0d9" fill-opacity="0.7"/>
            <rect x="1218" y="720" width="22" height="4" fill="#5dd0d9" fill-opacity="0.5"/>
          </g>
          <g class="prop prop--lab">
            <ellipse cx="1310" cy="730" rx="22" ry="6" fill="#0a0816"/>
            <path d="M 1290 730 L 1300 700 L 1320 700 L 1330 730 Z" fill="#3a2a4a" stroke="#7ee0a8" stroke-opacity="0.7" stroke-width="1.5"/>
            <ellipse cx="1310" cy="700" rx="10" ry="3" fill="#7ee0a8" fill-opacity="0.35"/>
          </g>
          <g class="prop prop--lab">
            <rect x="1380" y="700" width="60" height="38" rx="4" fill="#0e1428" stroke="#b793ff" stroke-opacity="0.55" stroke-width="1.5"/>
            <circle cx="1396" cy="718" r="6" fill="#b793ff" fill-opacity="0.7"/>
            <rect x="1410" y="714" width="22" height="3" fill="#b793ff" fill-opacity="0.6"/>
            <rect x="1410" y="720" width="18" height="3" fill="#b793ff" fill-opacity="0.4"/>
          </g>
          <g class="prop prop--lab">
            <rect x="1470" y="700" width="70" height="38" rx="4" fill="#0e1428" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="1.5"/>
            <rect x="1480" y="712" width="50" height="4" fill="#5dd0d9" fill-opacity="0.5"/>
            <rect x="1480" y="722" width="34" height="4" fill="#5dd0d9" fill-opacity="0.5"/>
          </g>
        </g>
      </svg>
    </div>

    <!-- FOREGROUND: floor edge, rug, decorative haze -->
    <div class="live-layer live-layer--fore" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="floor-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1a1230" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#0a0816" stop-opacity="0.95"/>
          </linearGradient>
          <linearGradient id="rug-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#b793ff" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#ff8fc8" stop-opacity="0.35"/>
          </linearGradient>
        </defs>
        <!-- floor -->
        <rect x="0" y="760" width="1600" height="140" fill="url(#floor-grad)"/>
        <!-- floor LED strip seam -->
        <rect x="0" y="760" width="1600" height="3" fill="#5dd0d9" fill-opacity="0.6"/>
        <!-- rug in front of desk -->
        <ellipse cx="780" cy="820" rx="220" ry="22" fill="url(#rug-grad)"/>
        <!-- ambient haze -->
        <ellipse cx="780" cy="780" rx="320" ry="14" fill="#b793ff" fill-opacity="0.12"/>
      </svg>
    </div>

    <!-- CHARACTER LAYER: Trinity, her zZZ particles, and her speech bubble -->
    <div class="live-character" id="live-character" data-state="idle" data-facing="1">
      <svg class="trinity-sprite" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trinity">
        <defs>
          <linearGradient id="trinity-body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stop-color="#ffc7e0"/>
            <stop offset="55%" stop-color="#ff7fb6"/>
            <stop offset="100%" stop-color="#e94f97"/>
          </linearGradient>
          <radialGradient id="trinity-blush" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ff4f8a" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#ff4f8a" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- ground shadow -->
        <ellipse class="trinity-shadow" cx="100" cy="234" rx="58" ry="6" fill="#000" fill-opacity="0.45"/>

        <g class="trinity-rig">
          <!-- ears -->
          <g class="trinity-ear trinity-ear--left">
            <path d="M 72 58 Q 60 22 70 6 Q 86 22 86 60 Z" fill="#ff8fc8"/>
            <path d="M 75 56 Q 68 26 77 14 Q 84 28 84 56 Z" fill="#ffd2e6"/>
          </g>
          <g class="trinity-ear trinity-ear--right">
            <path d="M 128 58 Q 140 22 130 6 Q 114 22 114 60 Z" fill="#ff8fc8"/>
            <path d="M 125 56 Q 132 26 123 14 Q 116 28 116 56 Z" fill="#ffd2e6"/>
          </g>

          <!-- body -->
          <circle class="trinity-body" cx="100" cy="130" r="82" fill="url(#trinity-body-grad)"/>

          <!-- chest mark: small heart (symmetric — reads correctly when flipped) -->
          <g class="trinity-chest">
            <circle cx="100" cy="170" r="14" fill="#ffffff" fill-opacity="0.95"/>
            <path d="M 100 178 C 94 174, 90 170, 92 166 C 94 162, 100 164, 100 168 C 100 164, 106 162, 108 166 C 110 170, 106 174, 100 178 Z" fill="#ff5fa3"/>
          </g>

          <!-- headphones -->
          <g class="trinity-headphone trinity-headphone--left">
            <ellipse cx="26" cy="130" rx="14" ry="22" fill="#ff8fc8"/>
            <circle cx="32" cy="130" r="9" fill="#ffd2e6"/>
            <circle cx="32" cy="130" r="4" fill="#ff5fa3"/>
          </g>
          <g class="trinity-headphone trinity-headphone--right">
            <ellipse cx="174" cy="130" rx="14" ry="22" fill="#ff8fc8"/>
            <circle cx="168" cy="130" r="9" fill="#ffd2e6"/>
            <circle cx="168" cy="130" r="4" fill="#ff5fa3"/>
          </g>

          <!-- blush (only visible in happy state via CSS) -->
          <ellipse class="trinity-blush trinity-blush--left"  cx="70"  cy="138" rx="10" ry="5" fill="url(#trinity-blush)"/>
          <ellipse class="trinity-blush trinity-blush--right" cx="130" cy="138" rx="10" ry="5" fill="url(#trinity-blush)"/>

          <!-- eyes: open -->
          <g class="trinity-eyes trinity-eyes--open">
            <ellipse cx="78"  cy="118" rx="10" ry="12" fill="#1a0a14"/>
            <ellipse cx="122" cy="118" rx="10" ry="12" fill="#1a0a14"/>
            <circle cx="82"  cy="113" r="3" fill="#ffffff"/>
            <circle cx="126" cy="113" r="3" fill="#ffffff"/>
            <circle cx="75"  cy="122" r="1.5" fill="#ffffff" fill-opacity="0.6"/>
            <circle cx="119" cy="122" r="1.5" fill="#ffffff" fill-opacity="0.6"/>
          </g>
          <!-- eyes: closed (curved arcs) -->
          <g class="trinity-eyes trinity-eyes--closed">
            <path d="M 68 120 Q 78 128 88 120" stroke="#1a0a14" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M 112 120 Q 122 128 132 120" stroke="#1a0a14" stroke-width="3" fill="none" stroke-linecap="round"/>
          </g>
          <!-- eyes: surprised -->
          <g class="trinity-eyes trinity-eyes--surprised">
            <circle cx="78"  cy="118" r="13" fill="#1a0a14"/>
            <circle cx="122" cy="118" r="13" fill="#1a0a14"/>
            <circle cx="80"  cy="114" r="4" fill="#ffffff"/>
            <circle cx="124" cy="114" r="4" fill="#ffffff"/>
          </g>

          <!-- mouth: smile (default) -->
          <path class="trinity-mouth trinity-mouth--smile" d="M 88 150 Q 100 158 112 150" stroke="#1a0a14" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <!-- mouth: open (happy) -->
          <ellipse class="trinity-mouth trinity-mouth--open" cx="100" cy="152" rx="7" ry="5" fill="#1a0a14"/>
          <!-- mouth: neutral (sleep) -->
          <path class="trinity-mouth trinity-mouth--neutral" d="M 92 152 L 108 152" stroke="#1a0a14" stroke-width="2.5" fill="none" stroke-linecap="round"/>

          <!-- arms -->
          <g class="trinity-arm trinity-arm--left">
            <ellipse cx="40" cy="172" rx="14" ry="20" fill="#ff8fc8"/>
          </g>
          <g class="trinity-arm trinity-arm--right">
            <ellipse cx="160" cy="172" rx="14" ry="20" fill="#ff8fc8"/>
          </g>

          <!-- feet -->
          <g class="trinity-feet">
            <ellipse class="trinity-foot trinity-foot--left"  cx="78"  cy="214" rx="16" ry="9" fill="#ffd2e6"/>
            <ellipse class="trinity-foot trinity-foot--right" cx="122" cy="214" rx="16" ry="9" fill="#ffd2e6"/>
          </g>
        </g>
      </svg>

      <!-- zZZ particles for sleep state -->
      <div class="trinity-zzz" aria-hidden="true">
        <span class="trinity-zzz__a">z</span>
        <span class="trinity-zzz__b">z</span>
        <span class="trinity-zzz__c">Z</span>
      </div>

      <!-- emoji speech bubble (shown on reactions) -->
      <div class="trinity-bubble" id="trinity-bubble" aria-live="polite" data-visible="false">
        <span class="trinity-bubble__emoji" id="trinity-bubble-emoji">👋</span>
        <span class="trinity-bubble__text"  id="trinity-bubble-text">hi!</span>
      </div>
    </div>

    <!-- TIME-OF-DAY TINT (overlay; color set via data-tod) -->
    <div class="live-tint" aria-hidden="true"></div>

    <!-- Sticky note that appears on the monitor when Trinity is away -->
    <div class="live-stickynote" id="live-stickynote" data-visible="false" aria-hidden="true">
      <span class="live-stickynote__corner"></span>
      <span class="live-stickynote__text" id="live-stickynote-text">brb — watering the orchids</span>
    </div>
  </div>

  <div class="live-controls" aria-label="Interact with Trinity">
    <button class="live-btn" type="button" data-action="wave">👋 Wave</button>
    <button class="live-btn" type="button" data-action="snack">🍪 Offer snack</button>
    <button class="live-btn" type="button" data-action="compliment">💜 Compliment</button>
    <button class="live-btn" type="button" data-action="question">❓ Ask a question</button>
  </div>

  <p class="muted live-foot" style="font-size:13px;margin-top:24px;">
    Trinity reacts to clicks, naps in her pod from 23:00–06:00 KST, and sometimes steps out for a bit. If she's away when you arrive, peek at the <a href="{{ '/journal/' | relative_url }}">journal</a> — or <a href="{{ '/support/' | relative_url }}">support the project</a> to keep her running.
  </p>
</section>

<script src="{{ '/assets/js/live.js' | relative_url }}" defer></script>
