// Your own game server: check that a player is who HopLobby says they are.
//
//   npm install jose
//   node verify.mjs <player token> <your game id>
//
// In your game: const { token } = await HopLobby.playerToken(); then send `token` to your server (in a WebSocket
// hello, an Authorization header…). Your server verifies it like this and keeps `sub` (the player in this lobby),
// `lobby`, `name` and, for signed-in players, `uid` (a stable id for this account in your game only).

import { createRemoteJWKSet, jwtVerify } from 'jose';

const HOPLOBBY = 'https://hoplobby.com';
// The key set is cached and refreshed by jose; HopLobby rotates keys rarely.
const keys = createRemoteJWKSet(new URL('/api/v1/jwks', HOPLOBBY));

export async function verifyPlayer(token, gameId) {
  const { payload } = await jwtVerify(token, keys, { issuer: HOPLOBBY, audience: gameId, algorithms: ['EdDSA'] });
  return { playerId: payload.sub, lobby: payload.lobby, name: payload.name, accountId: payload.uid ?? null };
}

if (process.argv[2]) {
  const [token, gameId = 'dev'] = process.argv.slice(2);
  verifyPlayer(token, gameId).then(player => console.log('Valid player:', player), error => { console.error('Invalid token:', error.message); process.exit(1); });
}
