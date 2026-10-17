# Tactical Battles — verification

## Player-visible behavior

TIE pairs split distraction and flanking roles with visible novice/veteran/leader labels. Losing a wingman produces a temporary withdrawal or a four-second reinforcement call, shown on a world marker. Destroying the caller cancels its request. Only one extra bonus-only fighter can be requested per phase; mandatory campaign targets remain available. Trench and Vader rules are preserved.

G cycles cover/attack/escort orders; active support fighters change real targets and fire physical friendly bolts. Escort follows the weakest surviving ally. Three surviving Y-wings earn 75 points at the third checkpoint, or 150 if each retains at least half its hull. Enemy interception, battery destruction and power-node shutdown remain separate tactical choices.

Only hull damage beyond shields faults engines, weapons or sensors. B selects the repair priority, V channels a finite repair; the selected subsystem alone improves. Damage reduces actual speed/acceleration, firing/cooling or lock acquisition without removing control. Repair, orders and integrity are also accessible in the existing collapsible avionics panel.

## QA evidence

- Environment: local production build, Playwright Chromium/WebGL software renderer; Browser plugin unavailable. Desktop 1440 × 900; responsive portrait/landscape and touch 390 × 844.
- Build: `npm run build` passed, 47 modules; normal large-chunk advisory remains.
- Combined gate: standalone `npm run test` passed **133/133**, zero failures/skips; 215.6 seconds total.
- Page identity/content, missing-resource and console/shader checks, cameras, weapons, pause, QTE, defeat/replay and victory passed in existing browser tests.
- Touch interaction: open avionics → select engine repair → select escort order → observe real engine snapshots → restore hull/cover and close panel. All three subsystem rows render; panel scroll contains the added controls without covering touch fire/flight buttons.
- Five real-engine integration tests cover shields versus hull faults, selected repair/pause, live wing retargeting, pair labels/radio, physical escort checkpoint rewards/reset, and actual flight/laser effects. Pure modules have 20 further checks.

Current screenshots: `%TEMP%/death-star-assault-qa/tactical-orders-touch.png`, `tactics-touch.png`, `hud-mobile.png`, `trench.png`, `cockpit.png`. The coordinator inspected the new touch screenshot. Long equipment content intentionally scrolls inside the compact panel.

## Limits

Software-rendered browser timings do not establish hardware GPU FPS. Pair offsets use the authored world axes; this is an arcade coordination model. A withdrawing survivor re-engages after three seconds so kill-count missions cannot stall. No Sites update was published.
