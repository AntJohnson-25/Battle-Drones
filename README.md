# Hop Drone Racing

A multiplayer FPV drone race for HopLobby. Everything in this folder gets deployed. Project notes and tools live one
level up, in the project folder.

| File | What it is |
| --- | --- |
| `index.html`, `style.css` | The page HopLobby loads, the HUD |
| `hoplobby.js`, `hoplobby.d.ts` | HopLobby SDK v1, unchanged |
| `vendor/` | three.js r158 and its GLTFLoader (MIT, see `three.LICENSE.txt`) |
| `src/util.js`, `track.js`, `sim.js` | The course and the race. No three.js, so `tools/sim-test.js` runs it in Node |
| `src/net.js` | Multiplayer: the host runs the race and sends snapshots; players report their own drone |
| `src/world.js`, `drone.js`, `pilot.js`, `view.js` | The 3D course, drones, pilots with remotes, cameras |
| `src/hud.js`, `audio.js`, `input.js`, `main.js` | HUD (en / pt-PT), synthesised sound, keys, start-up and loop |
| `server-example/verify.mjs` | The SDK's player-token example, for a future leaderboard server (not used yet) |

Run it from the project folder (not this one), so `tools/harness.html` works too:
`python -m http.server 5173 --bind 127.0.0.1 --directory <project folder>`, then open
http://127.0.0.1:5173/Work/index.html (`?autopilot=1` lets the bot pilot fly; `?debug=1` shows fps and avatar states).
