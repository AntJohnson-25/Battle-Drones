# Project Context: Hop Drone Racing

## Outcome

A multiplayer drone-racing game published on the HopLobby Community tab, built with the HopLobby SDK
and hosted on my own https address.

## Current status

- **2026-11-11: VISION CHANGED (user) → "Drone Hunt".** No more racing. Up to 8 pilots, 3-minute rounds on
  **City** (towers, streets) or **Mountain** (valley, col, gorge, snowy peaks), host picks. Each pilot chases
  their OWN pack of 60 target drones (same seed = same pack for everyone; every 10th is a gold "ace" worth 3)
  that flee along the course and **shoot back**. 100 HP, shot down → 3 s → respawn behind with a shield.
  Space (hold) fires with light aim assist (crosshair goes red). Most points wins; ties → who got there first.
  **Latency design:** everything time-critical is local; the relay only carries ghost positions + scores
  (10/s per player). Scores are self-reported (casual). Gates, laps, pickups removed.
  - `node tools/sim-test.js` PASS (autopilot ~47 kills/round on both courses, takes hits, respawns).
  - `node tools/net-test.js` 17/17 PASS (8 pilots, 60 ms + 8% loss: same scores everywhere, reload keeps
    score, leaver marked, host leaves → new host starts the next round).
  - Headless Edge shots in `Notes/shots/hunt/` (city FPV + chase, mountain, results). Page title is now
    "Hop Drone Hunt" (working title; folder/game id unchanged).
  - **Not hand-played yet.** Older notes below describe the race version.

- 2026-10-09: project created from the Hop Tag SDK starter.
- 2026-10-09: **first playable build.** 3D FPV drone race on one course ("Canyon Loop", ~1.2 km,
  16 gates, 3 laps, ~40 s laps), bots fill the grid to 6, all five pickups, multiplayer with the
  host pattern, HopLobby avatars as pilots on the stand holding a remote. Written fresh in three.js
  r158 (copied from Bladed), reusing Bladed's net / avatar / harness approach; nothing taken from
  Riptide Rumble in the end (surf-specific).
  - `node tools/sim-test.js`: bots-only race, everyone finishes, pickups and hits happen: PASS.
  - `node tools/net-test.js`: host + player over a fake relay (60 ms, 8% loss): 18/18 pass (full race,
    same results on both screens, pickups/hits reach players, a reload rejoins mid-lap, a leaver goes
    last, the host leaving hands the race on, junk messages ignored, message rates 12/s and 15/s).
  - Headless Edge screenshots (`Notes/shots/`): intro on the pilot, over-the-shoulder, countdown in FPV,
    racing, chase cam, results. The test avatar (via `tools/harness.html`) loads (19 bones, 5 clips)
    and holds the remote. ~57 fps on this PC's GPU in headless Edge. Work/ is 0.88 MB.
  - **Not yet played by hand, not yet run in a real HopLobby lobby, real avatars not yet seen.**

## How a race goes

1. Intro (6.5 s): your pilot (your HopLobby avatar) on the stand beside the start, head down,
   holding the remote; then over the shoulder toward the grid; then "goggles on" video static.
2. Countdown (3 s) through your drone's FPV camera on its launch pad; GO, a short auto lift-off.
3. Race: 3 laps, gates in order; the next gate glows lime, the one after white; marker/edge arrow to it.
   Missed gate / wrong way warnings. C swaps FPV and chase camera.
4. Results when every human has finished (or 30 s after the first does): the camera cuts back to your
   pilot, top 3 wave. Host: RACE AGAIN / END GAME FOR EVERYONE. Others wait, or BACK TO LOBBY.

Controls: arrows / WASD steer and climb-dive (altitude held otherwise), Space or Enter fires the
pickup, Shift brakes (tighter turn), C camera, M sound, I invert climb. Esc is HopLobby's (input held,
race carries on; solo pauses). No touch controls yet.

Pickups (host decides, weighted by place): Turbo (2.2 s speed), Homing dart (at the racer ahead: spin-out
1.3 s), Shield (blocks one dart/EMP, 10 s), EMP pulse (20 m, slows others 2.6 s), Smoke trail (5 s of
smoke that whites out the view of anyone flying through it). 3 rows of 4 boxes, 4 s respawn.

## How to run

- Serve the **project folder** (not `Work/`) so the harness works too:
  `& 'G:\ICM Workspace\tools\py313\python.exe' -m http.server 5173 --bind 127.0.0.1 --directory E:\Hoplobby.dev\01-Projects\hop-drone-racing`
- Standalone: http://127.0.0.1:5173/Work/index.html (`?autopilot=1` bot flies you, `?debug=1` fps + avatar states).
  Use 127.0.0.1, not `localhost` (Chrome sends `localhost` to IPv6 → refused).
- Local two-player lobby with the made-up test avatar: http://127.0.0.1:5173/tools/harness.html (`?both` for 2 players).
- Real lobby (Dev Mode): Test in Dev Mode with `url=http://127.0.0.1:5173/Work/index.html`, then Open test lobby
  → I'm ready → Launch game. Second player: private window / second profile.
- Screenshots: `powershell -File tools\edge.ps1 -Gpu`, then `node tools/shot.js --url=... --wait=... --shot=...`.
  Restart edge.ps1 between runs (shot.js otherwise attaches to a stale page). Stop it after (`-Stop`; low RAM).

## Layout

| Path | What |
| --- | --- |
| `Work/` | The game; only this folder gets deployed. See `Work/README.md` for the files. |
| `tools/` | sim-test.js, net-test.js (Node), harness.html (local lobby), test-avatar.glb + make-test-avatar.js (made-up avatar), edge.ps1 + shot.js (screenshots) |
| `HANDOFF.md` | Assets and licences table the content policy requires |
| `Source/` | Raw inputs (drone model sources go here) |
| `Notes/` | Design and session notes; `Notes/shots/` screenshots (git-ignored) |
| `Deliverables/` | Submission material: screenshots (1920×1080), key art (1536×1024), notes text |

## Custom drone model (slot ready, not used yet)

Set `DR.DRONE_MODEL = "assets/drone.glb"` in `Work/src/drone.js`. The contract: glTF binary, faces −Z,
about 0.6 m across (it's drawn 2.2× bigger), propellers as separate nodes named `prop...` (spun about their
own Y), any material named `accent...` is tinted in the racer's colour. Low-poly, under ~1 MB, own the
rights; AI-generated is fine if the tool's terms allow commercial use, and it goes in HANDOFF.md.

## Next action

**2026-11-11:** user hand-tests the Drone Hunt build (standalone, then 2+ profiles in Dev Mode). Tune
difficulty (target speed/fire rate/aim assist in `CFG`, sim.js) and confirm the name. Old race list below:

1. User hand-tests standalone, then in a real Dev Mode lobby (2 profiles) to see real avatars on the stand
   and holding the remote (`?debug=1`).
2. Tune from that: flight feel, gate sizes, pickup balance, intro camera framing on real avatars.
3. Then: touch controls (if HopLobby players use phones), a performance check with 16 players on the UHD 600,
   key art and screenshots for submission.

## Waiting on me

Only what needs me: play-tests, reviews, decisions, approvals. Agents add `- [ ]` items; tick them when done.

- [x] User hand-tests standalone (done 2026-10-16)

## Decisions

- 2026-10-09 core loop (chosen by the user): arcade flight, 3 laps through gates, kart-style pickups;
  the host hands out pickups and resolves hits (the relay is unchecked). Low-poly for 16 players.
- 2026-10-09 (user): keep all five pickups. The race **starts on the player's HopLobby character looking
  at the remote, then switches to the drone's point of view** when the race is about to begin. So the
  default camera is FPV (chase cam on C), and avatars are pilots on a stand, not riders on the drones.
- 2026-10-09: Space fires the pickup (Turbo is the boost), Shift brakes.
- 2026-10-09: drones don't collide with each other (ghosts); hillsides bounce you off.
- 2026-10-09: a player who leaves mid-race keeps flying on autopilot but is unplaced (goes last).
- 2026-10-09: the game code lives in `Work/`, so only that folder gets deployed.
- 2026-10-09: the game id is likely `hop-drone-racing`. It can't change after publishing, so confirm before the first submission.

## Open questions and risks

- Finish order is host-decided (fine for casual races). Leaderboards / best laps would need my own server keyed by the player token.
- Real avatars' bone layout is undocumented; the rig is read from the skeleton's shape (works on the spec-matching test avatar). Check `?debug=1` in a real lobby.
- Performance with 16 drones + 16 skinned avatars on the UHD 600 is untested. Auto-quality lowers the resolution if fps stays under 45 while flying.
- Production should load `https://hoplobby.com/sdk/v1/hoplobby.js` (an unchanged copy is allowed). On 2026-10-09 the bundled copy was byte-identical to the hosted v1.
