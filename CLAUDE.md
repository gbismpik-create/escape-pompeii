# Escape Pompeii — project rules

## Concept
Endless 3-lane runner in the browser. The player flees through Pompeii during the
eruption of Vesuvius (79 AD) toward the harbour. Difficulty follows 3 real
eruption phases: pumice fall (0–60 s), ash & darkness (60–150 s), surge chasing
from behind (150 s+).

## Game design
The full vision is in GAME_DESIGN.md. Read it for context, but build ONLY what
"Current milestone" asks for; suggest anything else instead of building it.

## Tone
Dramatic but respectful: real people died. No bodies, plaster casts or gore.
Game over = screen fades to ash + distance + a short historical fact.

## Tech
- Vite + Three.js, plain JavaScript, ES modules
- Must run smoothly on a mid-range Android phone browser
- All tunable numbers (speeds, spawn rates, phase timings, hitboxes) live in src/config.js
- Keep files small and focused (player.js, track.js, obstacles.js, input.js, ui.js...)

## Controls
Arrow keys / WASD and touch swipes: left/right = change lane, up = jump, down = slide.

## Workflow rules for Claude
- Build one small feature at a time; stop and let me test before moving on
- Never add features that aren't requested; suggest them instead
- After each working step, summarise what changed and how to test it
- Explain any new concept briefly (I'm learning Three.js)

## Current milestone
The finale: Porta Stabia, the tombs road, vineyards and fields, the beach at Stabiae, end screen with epilogue.

## Later (do NOT build yet)
Artifacts collection, power-ups, mobile app wrapper, ads, multiple cities.

From the GAME_DESIGN.md build order:
- Two more districts (planned; next after the finale): the baths (indoor, low vaults, pools, steam vents that hide the next obstacle) and the Great Palaestra by the amphitheatre (a calmer, wide stretch with plane trees)
- Rescued followers
- Gladiator barracks courtyard with gladiator followers (last step of the theatre district)
- Villa: tighter random obstacle rows inside the house
- Rooftops, steps 2–4: rubble ramp onto the roofs, gaps, washing lines, roof crossings at junctions, collapsing roofs in phase 3 (step 1, the pumice, is built)
