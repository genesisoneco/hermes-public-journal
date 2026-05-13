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

    <!-- BACK LAYER: ISO back walls (two angled walls meeting at the back corner) + wall-mounted screens, window, ceiling LEDs -->
    <div class="live-layer live-layer--back" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wall-left-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#0e0820" stop-opacity="1"/>
            <stop offset="100%" stop-color="#231642" stop-opacity="1"/>
          </linearGradient>
          <linearGradient id="wall-right-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#231642" stop-opacity="1"/>
            <stop offset="100%" stop-color="#0e0820" stop-opacity="1"/>
          </linearGradient>
          <linearGradient id="screen-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#5dd0d9" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#b793ff" stop-opacity="0.45"/>
          </linearGradient>
          <radialGradient id="ambient-glow" cx="50%" cy="20%" r="60%">
            <stop offset="0%" stop-color="#b793ff" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>

        <!-- room void above walls -->
        <rect width="1600" height="900" fill="#06050e"/>

        <!-- BACK-LEFT WALL: parallelogram, from W floor corner up to ceiling -->
        <path d="M 250 540 L 800 260 L 800 20 L 250 300 Z" fill="url(#wall-left-grad)"/>
        <!-- BACK-RIGHT WALL: parallelogram, from N corner to E floor corner -->
        <path d="M 800 260 L 1350 540 L 1350 300 L 800 20 Z" fill="url(#wall-right-grad)"/>

        <!-- ambient glow on inner corner -->
        <ellipse cx="800" cy="170" rx="620" ry="170" fill="url(#ambient-glow)"/>

        <!-- corner seam highlight -->
        <line x1="800" y1="20" x2="800" y2="260" stroke="#b793ff" stroke-opacity="0.35" stroke-width="1.5"/>

        <!-- ceiling LED strips along the two top wall edges -->
        <line x1="250" y1="300" x2="800" y2="20"   stroke="#ff8fc8" stroke-opacity="0.65" stroke-width="3"/>
        <line x1="800" y1="20"  x2="1350" y2="300" stroke="#ff8fc8" stroke-opacity="0.65" stroke-width="3"/>

        <!-- MAIN holographic screen mounted on back-LEFT wall (skewed into iso plane) -->
        <g class="prop prop--main-screen">
          <path d="M 380 320 L 660 180 L 660 360 L 380 500 Z" fill="#11131c" stroke="#b793ff" stroke-opacity="0.55" stroke-width="2"/>
          <path d="M 392 326 L 648 198 L 648 348 L 392 478 Z" fill="url(#screen-grad)"/>
          <!-- screen content lines (parallel to wall plane) -->
          <line x1="408" y1="346" x2="628" y2="236" stroke="#0a0c14" stroke-opacity="0.55" stroke-width="2"/>
          <line x1="408" y1="370" x2="592" y2="278" stroke="#0a0c14" stroke-opacity="0.4"  stroke-width="2"/>
          <line x1="408" y1="394" x2="624" y2="286" stroke="#0a0c14" stroke-opacity="0.4"  stroke-width="2"/>
          <path d="M 408 420 L 470 389 L 470 444 L 408 475 Z" fill="#0a0c14" fill-opacity="0.35"/>
          <path d="M 484 382 L 540 354 L 540 408 L 484 436 Z" fill="#0a0c14" fill-opacity="0.35"/>
        </g>

        <!-- Small side screen further along back-LEFT wall -->
        <g class="prop prop--side-screens">
          <path d="M 700 200 L 760 170 L 760 240 L 700 270 Z" fill="#11131c" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="1.5"/>
          <path d="M 706 206 L 754 182 L 754 234 L 706 264 Z" fill="url(#screen-grad)" opacity="0.7"/>
        </g>

        <!-- WINDOW on back-RIGHT wall (cosmic view, skewed iso) -->
        <g class="prop prop--window">
          <path d="M 1020 200 L 1300 340 L 1300 480 L 1020 340 Z" fill="#0a0816" stroke="#b793ff" stroke-opacity="0.45" stroke-width="2"/>
          <!-- mullion vertical (parallel to wall axis) -->
          <line x1="1160" y1="270" x2="1160" y2="410" stroke="#b793ff" stroke-opacity="0.3" stroke-width="1.5"/>
          <!-- mullion horizontal -->
          <line x1="1020" y1="270" x2="1300" y2="410" stroke="#b793ff" stroke-opacity="0.3" stroke-width="1.5"/>
          <!-- starfield -->
          <circle cx="1060" cy="240" r="2"   fill="#ffffff" fill-opacity="0.85"/>
          <circle cx="1110" cy="260" r="1.4" fill="#ffffff" fill-opacity="0.6"/>
          <circle cx="1180" cy="290" r="2.3" fill="#ffffff" fill-opacity="0.9"/>
          <circle cx="1230" cy="320" r="1.5" fill="#ffffff" fill-opacity="0.6"/>
          <circle cx="1090" cy="310" r="1"   fill="#ffffff" fill-opacity="0.5"/>
          <circle cx="1200" cy="380" r="1.7" fill="#ffffff" fill-opacity="0.7"/>
          <circle cx="1250" cy="420" r="1"   fill="#ffffff" fill-opacity="0.5"/>
          <!-- faint distant galaxy -->
          <ellipse cx="1140" cy="330" rx="14" ry="5" fill="#b793ff" fill-opacity="0.18" transform="rotate(20 1140 330)"/>
        </g>
      </svg>
    </div>

    <!-- MID LAYER: ISO floor (rhombus) + tile grid + iso props (pod, desk, chair, plant cabinet) -->
    <div class="live-layer live-layer--mid" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="floor-iso-grad" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%"   stop-color="#1a1230"/>
            <stop offset="100%" stop-color="#0d0820"/>
          </linearGradient>
          <linearGradient id="pod-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#ff8fc8"/>
            <stop offset="100%" stop-color="#9b5bb8"/>
          </linearGradient>
          <radialGradient id="pod-glass" cx="50%" cy="40%" r="60%">
            <stop offset="0%"   stop-color="#5dd0d9" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#1a1230" stop-opacity="0.85"/>
          </radialGradient>
          <linearGradient id="desk-top-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#3a2a52"/>
            <stop offset="100%" stop-color="#1a0f2a"/>
          </linearGradient>
          <linearGradient id="leaf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#7ee0a8"/>
            <stop offset="100%" stop-color="#3a9c6e"/>
          </linearGradient>
          <linearGradient id="cabinet-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#160e26"/>
            <stop offset="100%" stop-color="#0a0518"/>
          </linearGradient>
          <linearGradient id="cabinet-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#0a0518"/>
            <stop offset="100%" stop-color="#050210"/>
          </linearGradient>
        </defs>

        <!-- ISO FLOOR rhombus: corners at N(800,260) E(1350,540) S(800,820) W(250,540) -->
        <path d="M 800 260 L 1350 540 L 800 820 L 250 540 Z" fill="url(#floor-iso-grad)"/>

        <!-- floor tile grid (4 lines each diagonal direction = 5x5 tiles) -->
        <g stroke="#b793ff" stroke-opacity="0.13" stroke-width="1" fill="none">
          <!-- W↔E diagonals (parallel to N-E edge) -->
          <line x1="360"  y1="316" x2="910"  y2="596"/>
          <line x1="470"  y1="372" x2="1020" y2="652"/>
          <line x1="580"  y1="428" x2="1130" y2="708"/>
          <line x1="690"  y1="484" x2="1240" y2="764"/>
          <!-- N↔S diagonals (parallel to N-W edge) -->
          <line x1="910"  y1="316" x2="360"  y2="596"/>
          <line x1="1020" y1="372" x2="470"  y2="652"/>
          <line x1="1130" y1="428" x2="580"  y2="708"/>
          <line x1="1240" y1="484" x2="690"  y2="764"/>
        </g>

        <!-- floor perimeter LED seam -->
        <path d="M 800 260 L 1350 540 L 800 820 L 250 540 Z" fill="none" stroke="#5dd0d9" stroke-opacity="0.45" stroke-width="1.8"/>

        <!-- rug rhombus on floor in front of the desk (renders under Trinity) -->
        <radialGradient id="rug-iso-grad-mid" cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stop-color="#ff8fc8" stop-opacity="0.45"/>
          <stop offset="60%"  stop-color="#b793ff" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#b793ff" stop-opacity="0.10"/>
        </radialGradient>
        <path d="M 820 720 L 1060 840 L 820 880 L 580 750 Z" fill="url(#rug-iso-grad-mid)"/>

        <!-- ============= POD (back-left zone) ============= -->
        <g class="prop prop--pod">
          <!-- pod base platform (iso rhombus on floor) -->
          <path d="M 430 510 L 540 565 L 430 620 L 320 565 Z" fill="#0a0816" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="2"/>
          <!-- LED ring on base edge -->
          <path d="M 430 510 L 540 565 L 430 620 L 320 565 Z" fill="none" stroke="#5dd0d9" stroke-opacity="0.65" stroke-width="1"/>
          <!-- pod body: vertical capsule centered on base, viewed straight-on (a known iso convention for rounded objects) -->
          <path d="M 360 540 L 360 380 Q 360 330 430 330 Q 500 330 500 380 L 500 540 Z" fill="url(#pod-grad)"/>
          <!-- pod glass canopy (slightly inset) -->
          <path d="M 370 530 L 370 380 Q 370 340 430 340 Q 490 340 490 380 L 490 530 Z" fill="url(#pod-glass)" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>
          <!-- inner glow -->
          <ellipse cx="430" cy="450" rx="50" ry="80" fill="#ff8fc8" fill-opacity="0.13"/>
          <!-- pod base front edge highlight -->
          <line x1="320" y1="565" x2="430" y2="620" stroke="#5dd0d9" stroke-opacity="0.4" stroke-width="1"/>
          <line x1="540" y1="565" x2="430" y2="620" stroke="#5dd0d9" stroke-opacity="0.4" stroke-width="1"/>
          <!-- status light -->
          <circle cx="430" cy="592" r="3.5" fill="#7ee0a8"/>
        </g>

        <!-- ============= PLANT LAB (back-right zone) — drawn before desk so the closer-to-camera desk paints over it ============= -->
        <g class="prop prop--plants">
          <!-- cabinet top rhombus -->
          <path d="M 1100 360 L 1230 425 L 1100 490 L 970 425 Z" fill="#0a0816" stroke="#7ee0a8" stroke-opacity="0.35" stroke-width="1.5"/>
          <!-- front face (toward W-S direction) -->
          <path d="M 970 425 L 1100 490 L 1100 620 L 970 555 Z" fill="url(#cabinet-front)" stroke="#7ee0a8" stroke-opacity="0.3" stroke-width="1"/>
          <!-- right face (toward E-S direction) -->
          <path d="M 1230 425 L 1100 490 L 1100 620 L 1230 555 Z" fill="url(#cabinet-side)" stroke="#7ee0a8" stroke-opacity="0.25" stroke-width="1"/>

          <!-- shelf dividers on front face (horizontal in iso plane) -->
          <line x1="970" y1="468" x2="1100" y2="533" stroke="#7ee0a8" stroke-opacity="0.45" stroke-width="1.3"/>
          <line x1="970" y1="512" x2="1100" y2="577" stroke="#7ee0a8" stroke-opacity="0.45" stroke-width="1.3"/>
          <!-- shelf dividers on right face -->
          <line x1="1100" y1="533" x2="1230" y2="468" stroke="#7ee0a8" stroke-opacity="0.35" stroke-width="1.3"/>
          <line x1="1100" y1="577" x2="1230" y2="512" stroke="#7ee0a8" stroke-opacity="0.35" stroke-width="1.3"/>

          <!-- grow-light strip along top rim -->
          <path d="M 970 425 L 1100 490 L 1230 425" stroke="#ff8fc8" stroke-opacity="0.7" stroke-width="2" fill="none"/>

          <!-- TOP shelf plants -->
          <g class="prop prop--plant">
            <rect x="990" y="448" width="16" height="11" rx="2" fill="#3a2a4a"/>
            <ellipse cx="998" cy="443" rx="10" ry="6" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1024" y="465" width="18" height="11" rx="2" fill="#3a2a4a"/>
            <path d="M 1033 465 Q 1024 446 1027 432 M 1033 465 Q 1043 447 1040 432" stroke="#7ee0a8" stroke-width="1.6" fill="none"/>
            <ellipse cx="1027" cy="432" rx="3.5" ry="6" fill="url(#leaf-grad)"/>
            <ellipse cx="1040" cy="432" rx="3.5" ry="6" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1060" y="483" width="18" height="11" rx="2" fill="#3a2a4a"/>
            <circle cx="1069" cy="476" r="8" fill="url(#leaf-grad)"/>
            <circle cx="1064" cy="472" r="3" fill="#ff8fc8"/>
          </g>

          <!-- MIDDLE shelf plants -->
          <g class="prop prop--plant">
            <rect x="990" y="492" width="16" height="11" rx="2" fill="#3a2a4a"/>
            <ellipse cx="998" cy="488" rx="11" ry="5" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1028" y="510" width="18" height="11" rx="2" fill="#3a2a4a"/>
            <ellipse cx="1037" cy="503" rx="9" ry="6" fill="url(#leaf-grad)"/>
            <ellipse cx="1032" cy="497" rx="5" ry="4" fill="url(#leaf-grad)"/>
          </g>
          <g class="prop prop--plant">
            <rect x="1064" y="527" width="18" height="11" rx="2" fill="#3a2a4a"/>
            <path d="M 1073 527 Q 1063 510 1067 500" stroke="#7ee0a8" stroke-width="1.6" fill="none"/>
            <ellipse cx="1067" cy="500" rx="3.5" ry="5" fill="url(#leaf-grad)"/>
          </g>

          <!-- BOTTOM shelf: lab gear silhouettes -->
          <g class="prop prop--lab">
            <path d="M 990 552 L 1020 567 L 1020 580 L 990 565 Z" fill="#0e1428" stroke="#5dd0d9" stroke-opacity="0.55" stroke-width="1"/>
            <line x1="998" y1="560" x2="1014" y2="568" stroke="#5dd0d9" stroke-opacity="0.65" stroke-width="1"/>
          </g>
          <g class="prop prop--lab">
            <path d="M 1030 568 L 1060 583 L 1060 597 L 1030 582 Z" fill="#0e1428" stroke="#b793ff" stroke-opacity="0.55" stroke-width="1"/>
            <circle cx="1040" cy="576" r="2" fill="#b793ff" fill-opacity="0.85"/>
          </g>
        </g>

        <!-- ============= DESK + MONITOR + CHAIR (center, closer to camera — drawn last so it paints over the plant cabinet where they overlap) ============= -->
        <g class="prop prop--desk">
          <!-- CHAIR (placed slightly behind/north of desk) -->
          <g class="prop">
            <!-- seat top rhombus -->
            <path d="M 950 510 L 1010 540 L 950 570 L 890 540 Z" fill="#1a0e26"/>
            <!-- seat side faces (slight thickness) -->
            <path d="M 890 540 L 950 570 L 950 590 L 890 560 Z" fill="#0e0518"/>
            <path d="M 1010 540 L 950 570 L 950 590 L 1010 560 Z" fill="#080310"/>
            <!-- backrest plate (tilted up) -->
            <path d="M 950 510 L 980 495 L 980 440 L 950 455 Z" fill="#2a1d40"/>
            <path d="M 980 495 L 980 440 L 1010 425 L 1010 480 Z" fill="#1a0e2a"/>
          </g>

          <!-- DESK box: top rhombus + two visible side faces -->
          <path d="M 820 540 L 1010 635 L 820 730 L 630 635 Z" fill="url(#desk-top-grad)" stroke="#5dd0d9" stroke-opacity="0.18" stroke-width="1"/>
          <path d="M 1010 635 L 820 730 L 820 770 L 1010 675 Z" fill="#180e28"/>
          <path d="M 820 730 L 630 635 L 630 675 L 820 770 Z" fill="#100820"/>

          <!-- MONITOR standing on desk (small iso box facing back) -->
          <path d="M 740 510 L 870 575 L 870 645 L 740 580 Z" fill="#0e1428" stroke="#5dd0d9" stroke-opacity="0.6" stroke-width="2"/>
          <line x1="756" y1="528" x2="858" y2="580" stroke="#5dd0d9" stroke-opacity="0.85" stroke-width="2"/>
          <line x1="756" y1="548" x2="828" y2="584" stroke="#5dd0d9" stroke-opacity="0.5"  stroke-width="2"/>
          <line x1="756" y1="568" x2="858" y2="620" stroke="#b793ff" stroke-opacity="0.65" stroke-width="2"/>
          <line x1="756" y1="588" x2="816" y2="618" stroke="#b793ff" stroke-opacity="0.55" stroke-width="2"/>
          <!-- monitor stand (tiny rhombus on desk top) -->
          <path d="M 810 638 L 836 651 L 822 661 L 798 648 Z" fill="#1a0e22"/>

          <!-- pink mug on desk top -->
          <ellipse cx="710" cy="640" rx="14" ry="6" fill="#ff8fc8"/>
          <path d="M 696 640 L 696 624 Q 696 618 710 618 Q 724 618 724 624 L 724 640" fill="#ff8fc8"/>
          <ellipse cx="710" cy="624" rx="14" ry="5" fill="#ffd2e6"/>

          <!-- small terminal device next to mug -->
          <path d="M 740 660 L 800 690 L 800 706 L 740 676 Z" fill="#0e1428" stroke="#7ee0a8" stroke-opacity="0.55" stroke-width="1"/>
          <line x1="752" y1="672" x2="788" y2="690" stroke="#7ee0a8" stroke-opacity="0.7" stroke-width="1.5"/>
        </g>
      </svg>
    </div>

    <!-- FOREGROUND: only the soft ground-haze along the front floor edges (sits in front of Trinity for a subtle fog-at-feet feel) -->
    <div class="live-layer live-layer--fore" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path d="M 250 540 L 800 820 L 1350 540" fill="none" stroke="#b793ff" stroke-opacity="0.07" stroke-width="42" stroke-linejoin="round"/>
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
