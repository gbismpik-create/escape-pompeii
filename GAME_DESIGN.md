Game design: what makes it different
Keep the Temple Run / Subway Surfers controls, but make each run a journey through a real city with an ending: you wander Pompeii's streets, take turns at junctions, cross famous places and finally escape to the coast where Pliny the Elder's ships are landing.
Pillars
1. An escape with an ending. A run lasts about 4–6 minutes, from your home street to the beach. Endless mode unlocks after the first escape for score chasers.
2. Turns and wandering. Every 20–40 seconds the street reaches a junction and you swipe left or right to turn, as in Temple Run. At crossroads you can also run straight on. Missing the turn at a T-junction means hitting the wall. After each turn the obstacles continue, mixed with new ones that fit the next street. Different turns lead through different districts, so every run follows a different route.
3. A compass instead of a map. A small compass shows Vesuvius and the sea. The player feels they are finding their way out, not running down one endless corridor.
4. The world rises. In phase 2 the streets fill with pumice and you climb onto the rooftops, jumping gaps between houses; in phase 3 collapsing roofs force you back down.
5. Save people. Fleeing citizens join you as a chain of followers. More followers means a higher score, but your turns get wider and you can lose them to obstacles.
6. Raise the shield. A fourth action next to jump, slide and lane change: tap to hold the scutum overhead against falling tiles and pumice. You run slower and cannot jump while it is up.
Districts, based on the real city
District
Real place in Pompeii
What changes in gameplay
Residential streets
Via dell'Abbondanza and the streets around it: shops, fountains, stepping stones
The standard three-lane run; bakeries with millstones that roll loose as obstacles
Forum
The civic and religious centre: open square, temples, Basilica, bronze Apollo at the Temple of Apollo
The street opens into a wide square: more lanes, fleeing crowds to weave through, columns and statues toppling
Theatre quarter
Large Theatre (about 5,000 seats), Odeon (about 1,500), the Quadriporticus behind them that became gladiator barracks
Run across the stage and along the stepped seating tiers; gladiators join as followers or block the gates
Baths
Stabian Baths, the oldest and largest bath complex
Indoor run: low vaults to slide under, pools to jump, steam vents that hide the next obstacle
Villas
House of the Faun with its dancing-faun bronze, House of the Vettii
Shortcut through a rich house: atrium pool to jump, colonnaded garden, frescoed rooms, garden statues
Amphitheatre end
Amphitheatre (70 BC) and the large exercise ground beside it
Wide open ground with trees and arena tunnels, a breather between tight streets
City gate
Porta Stabia, the south gate
Timed slide under a collapsing gateway: the last moment inside the walls
Statues
Statues appear every few hundred metres: gods, emperors and local notables on pedestals at crossroads, in the Forum and in villa gardens.
• Landmarks: intact statues help players recognise where they are and which way to turn.
• Hazards: some topple across the lanes, with a shadow warning before they fall.
• Collection: passing a statue unlocks it in the museum screen with a one-line fact.
Finale: out of the city to Pliny's ships
Historically, Pliny the Elder commanded the fleet at Misenum. He sailed across the bay on a rescue mission and landed at Stabiae, just south of Pompeii, where he died. The finale follows that route:
1. Leave the city through Porta Stabia.
2. Run the road outside the walls, lined with family tombs, as Roman roads outside city gates were.
3. Break out into vineyards and green fields under the darkening sky: cypress trees, farm carts, frightened animals, the first ash settling on the grass.
4. Reach the beach at Stabiae: galleys offshore and boats on the sand. Final sprint across the beach with the surge glowing behind you, then board a boat.
5. End screen with your route, the people you saved, and a short, respectful epilogue: Pliny died at Stabiae, and his nephew Pliny the Younger wrote the eyewitness letters we still read.
Coins and economy
• Two coins: the silver denarius (value 1, common) and the gold aureus (rare, worth 25 silver).
• Silver buys power-up upgrades, characters and outfits; gold buys revives and premium characters.
• Gold converts both ways: 1 gold → 25 silver; 100 silver → 1 gold, at most 5 a day.
• Four power-ups: Mercury's purse (magnet), Fortuna's favour (double silver), Aegis of Minerva (survive one crash), Wings of Pegasus (higher, longer jumps).
• Premium hero: Pliny the Elder.
• Coins look the same in every district.
Build order after the prototype
Build these one at a time and play each before starting the next.
[ ] Shield action (uses the existing legionary and animations)
[ ] Runs with an ending: distance bar, beach finish line
[ ] Turns at junctions: corner chunks; on a turn the world rotates 90° around the runner
[ ] Statues: static landmarks first, then toppling ones
[ ] Rescued followers
[ ] Forum district
[ ] Theatre district
[ ] Villa shortcut
[ ] Rooftop phase
[ ] Outside the walls: tombs road, fields, beach finale
Kickoff prompt for turns:
Read CLAUDE.md. Plan (no code yet) a turning system for the runner: the street is a
sequence of chunks with headings; every 20-40 s place a junction chunk (T or cross).
The player swipes left/right inside a short window to turn; missing a T-junction
ends the run. On a turn, rotate the world 90° around the runner so movement code
stays the same. After a turn, continue spawning chunks of the district the new
street leads to (residential, forum, theatre, villa). Show a compass with Vesuvius
and the sea.
