# Hop Drone Racing: handoff

## Assets and licences

Every third-party or AI-generated asset in the game, as the HopLobby content policy requires
(see `03-Resources/hoplobby-developer-docs/10-content-policy.md`). Mark AI-generated assets with the
tool used, and mention them in the submission notes too.

| File (in `Work/`) | Source / author | Licence | AI tool (if any) | Credit required |
| --- | --- | --- | --- | --- |
| `hoplobby.js`, `hoplobby.d.ts` | HopLobby SDK v1 | HopLobby SDK (platform-supplied) | none | none |
| `vendor/three.min.js`, `vendor/GLTFLoader.js` | three.js r158, three.js authors | MIT (`vendor/three.LICENSE.txt`) | none | licence text kept alongside |
| Everything else (code, procedural models, canvas textures, synthesised sound) | Anthony C Johnson | own work | none | none |

No image, model, font or sound files are shipped: models are built in code, the UI uses system fonts,
and sound is synthesised with Web Audio. `tools/test-avatar.glb` is a made-up test figure for local
testing only and is not deployed.

## Notes for the reviewer

(Draft) Multiplayer uses the relay with the host pattern; the host decides laps, places, pickups and hits.
No own server yet, so no saved results or leaderboards. Players appear as their HopLobby avatars as pilots
on the stand beside the start; bots are robot figures. No AI-generated assets.
