/*!
 * HopLobby SDK v1 — https://developers.hoplobby.com/docs/sdk
 *
 * Your game runs on your own host, inside a frame on hoplobby.com. This file is the whole bridge: it talks to the
 * HopLobby page around your game with postMessage. It needs no build step and no other files.
 *
 *   <script src="https://hoplobby.com/sdk/v1/hoplobby.js"></script>
 *   const ctx = await HopLobby.init();          // who is playing, who hosts, which lobby
 *   HopLobby.on('message', (data, from) => {});  // messages from the other players (the relay)
 *   HopLobby.send({ move: 'left' });             // to everyone else; HopLobby.send(data, playerId) to one player
 *   HopLobby.ready();                            // your game finished loading: HopLobby reveals it
 *
 * Opened on its own (not inside HopLobby), init() resolves with a one-player "standalone" context so you can work on
 * your game without the platform; send() does nothing and avatar() draws a placeholder.
 */
(function (global) {
  'use strict';
  if (global.HopLobby && global.HopLobby.version) return;

  var VERSION = 1;
  // Only hoplobby.com (and HopLobby's own local development) may drive the game.
  var PARENTS = [/^https:\/\/(www\.)?hoplobby\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/];
  var framed = global.parent && global.parent !== global;
  var parentOrigin = null;
  var context = null;
  var listeners = {};
  var pending = {};
  var nextId = 1;
  var initPromise = null;
  var readySent = false;

  function emit(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[event] || []).slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (error) { setTimeout(function () { throw error; }); }
    });
  }
  function post(message) {
    if (!framed || !parentOrigin) return false;
    message.hl = 'sdk';
    global.parent.postMessage(message, parentOrigin);
    return true;
  }
  function request(method, params) {
    if (!parentOrigin) return Promise.reject(new Error('HopLobby: call HopLobby.init() first.'));
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { delete pending[id]; reject(new Error('HopLobby: ' + method + ' timed out.')); }, 30000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      post({ type: 'request', id: id, method: method, params: params || {} });
    });
  }
  function setPlayers(players, hostId) {
    context.players = players;
    context.hostId = hostId;
  }

  function onMessage(event) {
    if (event.source !== global.parent) return;
    var data = event.data;
    if (!data || data.hl !== 'site' || typeof data.type !== 'string') return;
    if (parentOrigin === null) {
      if (data.type !== 'init' || !PARENTS.some(function (re) { return re.test(event.origin); })) return;
      parentOrigin = event.origin;
    } else if (event.origin !== parentOrigin) return;
    switch (data.type) {
      case 'init':
        if (context) return;
        context = data.context;
        emit('_init', context);
        break;
      case 'players':
        if (!context) return;
        setPlayers(data.players, data.hostId);
        emit('players', data.players, data.hostId);
        break;
      case 'peers': emit('peers', data.online); break;
      case 'message': emit('message', data.data, data.from); break;
      case 'relay': emit('relay', data.status); break;
      case 'pause': emit('pause'); break;
      case 'resume': emit('resume'); break;
      case 'response': {
        var call = pending[data.id];
        if (!call) return;
        delete pending[data.id];
        clearTimeout(call.timer);
        if (data.ok) call.resolve(data.result); else call.reject(new Error(data.error || 'HopLobby: request failed.'));
        break;
      }
    }
  }
  global.addEventListener('message', onMessage);

  // Esc belongs to HopLobby's menu in every game. Keys typed into your frame never reach the page around it, so pass it on.
  global.addEventListener('keydown', function (event) {
    if ((event.key === 'Escape' || event.code === 'Escape') && parentOrigin) { event.preventDefault(); post({ type: 'escape' }); }
  });

  function standalone() {
    var id = 'standalone-player';
    return {
      sdk: VERSION, gameId: 'standalone', lobbyCode: 'LOCAL0', playerId: id, hostId: id, locale: (navigator.language || 'en'),
      dev: true, standalone: true,
      players: [{ id: id, name: 'You', isHost: true, isYou: true, signedIn: false }],
    };
  }
  function placeholderAvatar(size) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var g = canvas.getContext('2d');
    g.fillStyle = '#efe6ff'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#8a5cf6';
    g.beginPath(); g.arc(size / 2, size * 0.38, size * 0.18, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(size / 2, size * 0.9, size * 0.32, size * 0.3, 0, 0, Math.PI * 2); g.fill();
    return canvas.toDataURL('image/png');
  }

  var HopLobby = {
    version: VERSION,

    /**
     * Connect to HopLobby. Resolves with the context: { gameId, lobbyCode, playerId, hostId, players, locale, dev }.
     * Outside HopLobby it resolves straight away with a one-player context that has `standalone: true`.
     */
    init: function (options) {
      if (initPromise) return initPromise;
      var timeoutMs = (options && options.timeoutMs) || 15000;
      if (!framed) {
        context = standalone();
        initPromise = Promise.resolve(context);
        return initPromise;
      }
      initPromise = new Promise(function (resolve, reject) {
        var tries = 0;
        var hello = setInterval(function () {
          if (context || ++tries > timeoutMs / 250) {
            clearInterval(hello);
            if (!context) reject(new Error('HopLobby: no answer from the HopLobby page. Open your game from a HopLobby lobby, or on its own for standalone mode.'));
            return;
          }
          // Nothing secret here: the page answers only its own frame, and we only listen to hoplobby.com.
          global.parent.postMessage({ hl: 'sdk', type: 'hello', version: VERSION }, '*');
        }, 250);
        HopLobby.on('_init', function (ctx) { clearInterval(hello); resolve(ctx); });
        global.parent.postMessage({ hl: 'sdk', type: 'hello', version: VERSION }, '*');
      });
      return initPromise;
    },

    /** The context from init() (null before). */
    get context() { return context; },
    /** Everyone in the lobby: [{ id, name, isHost, isYou, signedIn }]. Kept up to date (see on('players')). */
    get players() { return context ? context.players : []; },
    /** You. */
    get me() { return context ? context.players.filter(function (p) { return p.id === context.playerId; })[0] || null : null; },
    /** True when you host the lobby. The host can change if they leave: listen to on('players'). */
    get isHost() { return !!context && context.hostId === context.playerId; },

    /** Report loading progress (0..1) while HopLobby shows its loading screen. `label` is shown under the bar. */
    progress: function (fraction, label) {
      post({ type: 'progress', fraction: Math.max(0, Math.min(1, Number(fraction) || 0)), label: label ? String(label).slice(0, 60) : undefined });
    },
    /** Your game is ready to be seen: HopLobby fades its loading screen out. */
    ready: function () {
      if (readySent) return;
      readySent = true;
      post({ type: 'ready' });
    },

    /**
     * Send any JSON value to the other players through the HopLobby relay. `to` is a player id or a list of them;
     * leave it out to send to everyone else. Up to 16 KB per message and 60 messages a second (bursts of 120).
     * The relay never reads, keeps or checks your messages: whatever needs trusting belongs on your own server.
     */
    send: function (data, to) {
      if (!context || context.standalone) return false;
      var message = { type: 'send', data: data };
      if (to !== undefined) message.to = to;
      return post(message);
    },

    /**
     * A player's HopLobby avatar. format 'portrait' (default): an image data: URL (WebP, transparent background).
     * format 'glb': an ArrayBuffer of a rigged glTF binary with the clips "idle", "walk", "run", "jump" and "wave".
     * size: the portrait's pixels (64–512).
     */
    avatar: function (playerId, options) {
      var format = options && options.format === 'glb' ? 'glb' : 'portrait';
      var size = Math.max(64, Math.min(512, (options && options.size) || 256));
      if (context && context.standalone) return format === 'portrait' ? Promise.resolve(placeholderAvatar(size)) : Promise.reject(new Error('HopLobby: GLB avatars need HopLobby. Open your game from a lobby.'));
      return request('avatar', { playerId: playerId || (context && context.playerId), format: format, size: size });
    },

    /**
     * A signed token that proves who this player is, for your own server. Verify it with the keys at
     * https://hoplobby.com/api/v1/jwks (or GET /api/v1/verify) and check that `aud` is your game id.
     * Resolves with { token, expiresAt }. Tokens last an hour: ask again for a fresh one.
     */
    playerToken: function () {
      if (context && context.standalone) return Promise.reject(new Error('HopLobby: player tokens need HopLobby. Open your game from a lobby.'));
      return request('token');
    },

    /** Leave the game and go back to the lobby (just for this player). */
    exit: function () { post({ type: 'exit' }); },
    /** Host only: end the game for everyone and return the lobby to the waiting room. */
    endGame: function () { post({ type: 'end' }); },

    /**
     * Events: 'message' (data, fromPlayerId), 'players' (players, hostId), 'peers' (ids connected to the relay now),
     * 'relay' ('connecting' | 'open' | 'closed'), 'pause' and 'resume' (HopLobby's menu opened or closed).
     * Returns a function that removes the listener.
     */
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return function () { HopLobby.off(event, fn); };
    },
    off: function (event, fn) {
      listeners[event] = (listeners[event] || []).filter(function (item) { return item !== fn; });
    },
  };

  global.HopLobby = HopLobby;
})(typeof window !== 'undefined' ? window : this);
