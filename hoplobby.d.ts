// HopLobby SDK v1 types. Put this file next to your code (or in a `types` folder) to get autocompletion for the
// global `HopLobby` that https://hoplobby.com/sdk/v1/hoplobby.js defines.

export interface HopLobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isYou: boolean;
  /** A HopLobby account is behind this player (their player token then carries a `uid`). */
  signedIn: boolean;
}

export interface HopLobbyContext {
  sdk: number;
  /** Your game id on HopLobby ("dev" in a Dev Mode test lobby, "standalone" outside HopLobby). The `aud` of player tokens. */
  gameId: string;
  lobbyCode: string;
  playerId: string;
  hostId: string;
  players: HopLobbyPlayer[];
  /** The player's language on HopLobby, e.g. "en" or "pt-PT". */
  locale: string;
  /** True in a Dev Mode test lobby (and standalone). */
  dev: boolean;
  /** Opened on its own, not inside HopLobby. */
  standalone?: boolean;
}

export interface HopLobbyTokenClaims {
  iss: string;
  /** Your game id. Always check it. */
  aud: string;
  /** The player's id in this lobby. */
  sub: string;
  lobby: string;
  name: string;
  /** Stable per account and per game; absent for guests. Use it to save progress. */
  uid?: string;
  iat: number;
  exp: number;
}

export interface HopLobbyEvents {
  message: (data: unknown, from: string) => void;
  players: (players: HopLobbyPlayer[], hostId: string) => void;
  peers: (online: string[]) => void;
  relay: (status: 'connecting' | 'open' | 'closed') => void;
  pause: () => void;
  resume: () => void;
}

export interface HopLobbySdk {
  readonly version: number;
  init(options?: { timeoutMs?: number }): Promise<HopLobbyContext>;
  readonly context: HopLobbyContext | null;
  readonly players: HopLobbyPlayer[];
  readonly me: HopLobbyPlayer | null;
  readonly isHost: boolean;
  progress(fraction: number, label?: string): void;
  ready(): void;
  send(data: unknown, to?: string | string[]): boolean;
  /** A portrait as an image data: URL (WebP, transparent background). */
  avatar(playerId?: string, options?: { format?: 'portrait'; size?: number }): Promise<string>;
  /** A rigged glTF binary with the clips idle, walk, run, jump and wave. */
  avatar(playerId: string | undefined, options: { format: 'glb'; size?: number }): Promise<ArrayBuffer>;
  playerToken(): Promise<{ token: string; expiresAt: number }>;
  exit(): void;
  endGame(): void;
  on<E extends keyof HopLobbyEvents>(event: E, listener: HopLobbyEvents[E]): () => void;
  off<E extends keyof HopLobbyEvents>(event: E, listener: HopLobbyEvents[E]): void;
}

declare global {
  interface Window { HopLobby: HopLobbySdk; }
  const HopLobby: HopLobbySdk;
}
