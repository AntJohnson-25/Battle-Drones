# Project Context: Hop Drone Racing

## Outcome

A multiplayer drone-racing game published on the HopLobby Community tab, built with the HopLobby SDK
and hosted on my own https address.

## Current status

- 2026-10-09: project created. `Work/` is an unmodified copy of the Hop Tag SDK starter; only the
  package name and the page title were changed. It runs locally in standalone mode. No drone-racing
  code yet.

## How to run

- Serve `Work/` on port 5173. Either `npm run dev` from `Work/` (downloads `serve` via npx), or with py313:
  `& 'G:\ICM Workspace\tools\py313\python.exe' -m http.server 5173 --bind 127.0.0.1 --directory <path to Work>`.
- With the Python server, use **http://127.0.0.1:5173**, not `localhost`: Chrome resolves `localhost`
  to IPv6, which gets "connection refused". Dev Mode accepts 127.0.0.1 addresses.
- Standalone: open http://127.0.0.1:5173. Verified rendering 2026-10-09: title, placeholder avatar, "it" ring, standalone banner.
- In a real lobby (Dev Mode): signed in on hoplobby.com, use Test in Dev Mode on the portal (or the
  `dev-play` address with `url=http://127.0.0.1:5173`). Then Open test lobby → I'm ready → Launch game.
  For a second player, use a private window or a second browser profile.

## Layout

| Path | What |
| --- | --- |
| `Work/` | The game: everything here gets deployed (index.html, game.js, hoplobby.js, hoplobby.d.ts) |
| `Work/server-example/` | Token verification example; not deployed; basis for a future game server |
| `HANDOFF.md` | Assets and licences table that the content policy requires |
| `Source/` | Raw inputs (reference art, sketches, sound sources) |
| `Notes/` | Design notes and session notes |
| `Deliverables/` | Submission material: screenshots (1920×1080), key art (1536×1024), notes text |

## Next action

Decide the core loop for drone racing (track shape, 2D top-down vs 3D, how many players, laps vs
checkpoints, what the host decides), then replace Hop Tag in `Work/game.js`.

## Decisions

- 2026-10-09: started from Hop Tag as a working multiplayer base rather than porting an existing game.
- 2026-10-09: the game code lives in `Work/`, so only that folder gets deployed; project docs stay out of the hosted site.
- 2026-10-09: the game id is likely `hop-drone-racing`. It can't change after publishing, so confirm before the first submission.

## Open questions and risks

- Players must appear as HopLobby avatars. How does a player's avatar show on a drone: a pilot portrait on the drone, or a 3D avatar riding or attached to its bones?
- Racing results count as "results that matter". Is a host-decided finish order enough, or does it need my own server (e.g. for leaderboards)?
- Production should load `https://hoplobby.com/sdk/v1/hoplobby.js` (the platform rules allow an unchanged copy too). On 2026-10-09 the bundled copy was byte-identical to the hosted v1.
