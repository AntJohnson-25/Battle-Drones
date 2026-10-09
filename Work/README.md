# HopLobby SDK starter

Build a multiplayer browser game **with HopLobby**. Your game stays yours: you build it with any engine, host it on
your own website, and HopLobby opens it in a frame inside its lobbies. The SDK (`hoplobby.js`) connects the two.

From HopLobby your game gets:

- **The lobby:** who's playing, who hosts, the player's language, and updates when people join or leave.
- **The relay:** send any JSON to the other players (up to 16 KB a message and 60 a second).
- **Avatars:** each player's HopLobby character, as a portrait or a rigged 3D model with animations.
- **Player tokens:** signed proof of who a player is, for your own server.
- **The shell:** HopLobby's loading screen, Esc menu, fullscreen and "back to lobby" around your game.

This folder is a working example, **Hop Tag**. Play it, then replace it with your game.

## Run it

You need any static web server. With Node.js:

```bash
npm run dev
```

Open http://localhost:5173. On its own, the game runs in **standalone mode**: one player, no relay, placeholder
avatars. That's enough to work on your game.

## Test it inside HopLobby (Dev Mode)

1. Keep `npm run dev` running.
2. Sign in on hoplobby.com with your developer account and open **https://hoplobby.com/dev-play?url=http://localhost:5173**
   (or use **Test in Dev Mode** in the developer portal).
3. Press **Open test lobby**, then **I'm ready** and **Launch game**.
4. To test multiplayer on your own computer, join the lobby code from a second browser profile. To test with friends,
   put your build on an `https` address first (any static host works) and use that address instead of localhost.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page HopLobby loads. Loads the SDK, then the game. |
| `game.js` | Hop Tag. Shows init, loading progress, avatars, the relay and host handover. |
| `hoplobby.js` | The SDK. In production, load `https://hoplobby.com/sdk/v1/hoplobby.js` instead. |
| `hoplobby.d.ts` | TypeScript types for the global `HopLobby`. |
| `server-example/verify.mjs` | How your own server checks a player token. |

## The SDK in one screen

```js
const ctx = await HopLobby.init();            // { gameId, lobbyCode, playerId, hostId, players, locale, dev }
HopLobby.progress(0.5, 'Loading levels');     // HopLobby's loading bar
HopLobby.ready();                             // reveal your game

HopLobby.send({ x, y });                      // to everyone else
HopLobby.send({ hp: 3 }, playerId);           // to one player (or an array of ids)
HopLobby.on('message', (data, from) => {});
HopLobby.on('players', (players, hostId) => {}); // joins, leaves, new host
HopLobby.on('pause', () => {}); HopLobby.on('resume', () => {}); // HopLobby's Esc menu

const portrait = await HopLobby.avatar(playerId);                 // data: URL (WebP image)
const glb = await HopLobby.avatar(playerId, { format: 'glb' });   // ArrayBuffer: idle, walk, run, jump, wave
const { token } = await HopLobby.playerToken();                   // send to your server

HopLobby.exit();      // this player back to the lobby
HopLobby.endGame();   // host: everyone back to the lobby
```

The full reference and the platform rules are in the developer docs: https://developers.hoplobby.com/docs

## Rules that matter most

- **Host it yourself over https** and keep it online. HopLobby never runs or stores your game.
- **Don't trust browsers.** The relay passes messages along without checking them. Anything that matters (scores,
  rewards, saves) belongs on your server, keyed by the verified player token.
- **No ads, trackers, outside sign-ins, payments or personal data.** Players are HopLobby's guests.
- **Esc belongs to HopLobby's menu.** The SDK passes it on; listen to `pause` / `resume`.
