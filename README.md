# Battle Drones

A drone hunt for HopLobby: 1 to 8 pilots, three courses, three bosses. Everything in this folder gets
deployed. Project notes and tools live one level up, in the project folder.

| File | What it is |
| --- | --- |
| `index.html`, `style.css` | The page HopLobby loads, the HUD |
| `hoplobby.js`, `hoplobby.d.ts` | HopLobby SDK v1, unchanged |
| `vendor/` | three.js r158 and its GLTFLoader (MIT, see `three.LICENSE.txt`) |
| `src/util.js`, `track.js`, `sim.js` | The courses and the hunt (targets, bosses, shots). No three.js, so `tools/sim-test.js` runs it in Node |
| `src/net.js` | Multiplayer: the host starts a round; each player runs their own copy and reports position and score |
| `src/world.js`, `drone.js`, `pilot.js`, `view.js` | The 3D courses, drones and bosses, pilots with remotes, cameras |
| `src/hud.js`, `audio.js`, `input.js`, `main.js` | HUD (en / pt-PT), synthesised sound, keyboard and controller, start-up and loop |
| `server-example/verify.mjs` | The SDK's player-token example, for a future leaderboard server (not used) |

Run it from the project folder (not this one), so `tools/harness.html` works too:
`python tools/serve.py`, then open http://127.0.0.1:5173/Work/index.html
(`?autopilot=1` lets the bot pilot fly; `?course=city|mountain|dunes` picks a course; `?debug=1` shows fps and avatar states).
