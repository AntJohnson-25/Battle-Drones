# Battle Drones: handoff

Game id `battle-drones`. (The project folder is still called `hop-drone-racing`, from the first version.)

## What it is

A drone hunt for 1 to 8 players. Each round is three minutes on one of three courses the host picks:
City, Mountain (snowed in, with light snowfall) or Dunes. Every pilot flies a stealth drone in first
person and chases their own pack of 60 target drones, which flee along the course, barrel-roll out
of the way of incoming fire and shoot back. Forty seconds in, the course's boss arrives with a swarm
of small one-hit drones: the Big Tech CEO in the city, Evil Santa on the mountain, the Mummy Pharaoh
in the dunes. Most points after three minutes wins.

Players are their own HopLobby avatars: in the intro each one walks out to a launch pad and throws
their drone into the air by hand, then flies it from the remote; the top three wave on the results.

## Assets and licences

Every third-party or AI-generated asset in the game, as the HopLobby content policy requires.

| File (in `Work/`) | Source / author | Licence | AI tool (if any) | Credit required |
| --- | --- | --- | --- | --- |
| `hoplobby.js`, `hoplobby.d.ts` | HopLobby SDK v1 | HopLobby SDK (platform-supplied) | none | none |
| `server-example/verify.mjs` | HopLobby SDK starter (player-token example; not used by the game) | HopLobby SDK (platform-supplied) | none | none |
| `vendor/three.min.js`, `vendor/GLTFLoader.js` | three.js r158, three.js authors | MIT (`vendor/three.LICENSE.txt`) | none | licence text kept alongside |
| Everything else: game code, and the models, textures and sounds that code builds at run time | Anthony C Johnson | own work | code written with the help of Claude Code (Anthropic), an AI coding assistant | none |

No image, model, font, music or sound files are shipped. The courses, drones, bosses and scenery are
built from simple shapes in code, the wall and billboard textures are drawn on a canvas in code, the
UI uses system fonts, and every sound is synthesised with Web Audio. So there are no AI-generated
image, model or audio files; the code that makes them was written with an AI coding assistant, whose
terms allow commercial use of its output.

The billboard brands in the city are made up for the game (Zap Cola, Hop FM, Skyline Bank and so on).
The bosses are original, generic characters: no real person, company or copyrighted character.

`tools/` (tests, screenshot tools, a made-up test avatar) is for local testing only and is not deployed.

## Notes for the reviewer

- **No server of our own.** Nothing is saved: no leaderboards, achievements, progress or store.
- **Multiplayer, and why it has no lag.** The host (or a player alone) picks the course and starts the
  round with one `start` message: course, seed and the pilots. Every player then runs their own copy
  of the round. The seed gives everyone the same pack of targets and the same boss, so it is fair,
  and every shot, hit and dodge happens on the player's own machine. The relay only carries each
  pilot's drone position and score, ten times a second, to draw the other pilots and the scoreboard.
- **Scores are self-reported.** That is a deliberate trade for a casual game with no saved results:
  a modified client could report a false score for that one round, and nothing persists.
- **Bad messages.** Every incoming message is checked for type, range and sender before use, and
  dropped otherwise (`tools/net-test.js`: 8 pilots with delay and loss, junk messages, a reload
  mid-round, a leaver, the host leaving; 17 checks pass).
- **Leaving and joining.** A leaver is marked as left and the round carries on. If the host leaves,
  another player becomes host and starts the next round. A late joiner or a reload drops into the
  round in progress and gets their score back.
- **Esc** is HopLobby's: on `pause` the player's input is dropped (the round carries on for everyone);
  on `resume` it comes back. No pointer lock is used.
- **Controls.** Keyboard: arrows or WASD fly, Space fires, Q / E barrel roll, X flip, Shift brake,
  C camera, O obstacle sensor, I invert climb, M sound. A standard controller also works where the
  browser allows it in the frame (left stick, RT fire, LT brake, LB / RB roll, Y flip, X camera;
  Start is not used). No touch controls yet: it is a keyboard or controller game.
- **Browser storage** on our own domain holds two settings only: sound on / off and invert climb.
- **Network.** The page loads only its own files and the SDK it ships with. No analytics, ads,
  trackers, sign-ins or outside requests.
- **Languages:** English and Portuguese (pt-PT).
- **Performance.** About 1 MB in total, no downloads after load. The picture's resolution steps down
  by itself if the frame rate drops.
