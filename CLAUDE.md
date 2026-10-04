# Escape Pompeii — project rules

## Concept
Endless 3-lane runner in the browser. The player flees through Pompeii during the
eruption of Vesuvius (79 AD) toward the harbour. Difficulty follows 3 real
eruption phases: pumice fall (0–60 s), ash & darkness (60–150 s), surge chasing
from behind (150 s+).

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
Week 1: grey boxes that feel good (see plan). No art, sound or menus yet.

## Later (do NOT build yet)
Artifacts collection, power-ups, mobile app wrapper, ads, multiple cities.
