# Drone Hunt: next changes (user notes, 2026-11-14)

Noted only. Nothing built yet. Dev Mode hand-test of the 2026-11-11 build is still pending.

1. **Targets roll to dodge.** Target drones can barrel-roll (like the player's Q/E sidestep) to dodge shots.
2. **Faster targets, competitive from the start.** Speed the target drones up so the round is competitive
   from the first second (tune target speed in `CFG`, `Work/src/sim.js`).
3. **New map: sand dunes.** A desert dune map joins City and Mountain (host picks from three).
4. **Clearer graphics overall.** Improve visual clarity across the game (note: city detail already dropped
   headless fps ~46 to 38, so watch performance).
5. **A boss drone character on each map.** All evil characters have **red eyes**.
   - **Snow / Mountain:** evil Santa with red eyes, driving a sleigh drone, deploying multiple mini drones
     that are a pest but beatable.
   - **City:** a person in a suit titled "Big tech CEO" (red eyes). Boss behaviour and minions should fit the
     character (e.g. minions that suit a corporate theme; to be designed).
   - **Sand dunes:** character not decided. Consult the user before designing it.
   - Apply the same logic to every map: a boss that fits the setting, with a swarm of small beatable drones.

## Open questions to settle when building
- Boss rules: does a boss replace the 60-target pack, appear at a set time, or spawn when the pack is cleared?
  Scoring value for a boss and for its minions.
- Is the boss local per pilot (own seeded pack, no lag) or shared between pilots? Per-pilot local fits the
  existing latency design.
- Sand dune boss character (consult).
- Keep `node tools/sim-test.js` and `node tools/net-test.js` passing after each change.
