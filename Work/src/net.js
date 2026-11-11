// Multiplayer over the HopLobby relay. Built so lag never matters:
//
// - The host (or a player on their own) picks the course and starts a round:
//   one "start" message with the course, a seed and the pilots.
// - Every player then runs their OWN round (sim.js): the same pack of targets
//   from the same seed, their own shots, the targets' return fire, all local.
// - Each player tells everyone else where their drone is and their score, ten
//   times a second. Other pilots are drawn as ghost drones, about 120 ms behind
//   so they move smoothly; nothing about them affects your round.
//
// Messages (every one is checked: the relay passes anything along):
//   host -> all     { t: "start", id, c, seed, el, roster: [[name, hl]], sc? }   a new round (el: seconds gone)
//   player -> all   { t: "p", id, x, y, z, yw, pt, rl, sp, sc, lk, dn, f }       my drone + score
//   player -> host  { t: "hi" }                                                  (re)joined: send me the round
// Scores are each player's own report. Casual play only: no saved leaderboards.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;
  const SEND_EVERY = 1 / 10, DELAY = 0.12;

  const N = {
    ctx: null, role: "solo",   // solo | host | client
    match: null,                // { id, c, seed, roster, at (host clock when it started) }
    S: null, sendT: 0, lastHi: 0, scores: {},
    on: {}                      // start(match, t0, score) | promoted() | left(name)
  };
  function hostId() { return HopLobby.context ? HopLobby.context.hostId : null; }
  function myId() { return HopLobby.context ? HopLobby.context.playerId : null; }
  const now = function () { return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000; };
  N.now = now;

  N.init = function (ctx, handlers) {
    N.ctx = ctx;
    N.on = handlers || {};
    if (!ctx || ctx.standalone) { N.role = "solo"; return; }
    N.role = ctx.hostId === ctx.playerId ? "host" : "client";
    HopLobby.on("message", onMessage);
    HopLobby.on("players", onPlayers);
    HopLobby.on("relay", function (s) { if (s === "open" && N.role === "client") hello(true); });
    if (N.role === "client") hello(true);
  };
  N.isHost = function () { return N.role === "host"; };
  N.isClient = function () { return N.role === "client"; };
  N.online = function () { return N.role !== "solo"; };

  function hello(force) {
    const t = now();
    if (!force && t - N.lastHi < 1) return;
    N.lastHi = t;
    HopLobby.send({ t: "hi" }, hostId());
  }

  N.humans = function () {
    if (!N.online()) return [{ name: (HopLobby.me && HopLobby.me.name) || "You", hl: myId() }];
    return HopLobby.players.slice().sort(function (a, b) { return (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0); })
      .map(function (p) { return { name: String(p.name || "Player").slice(0, 24), hl: p.id }; });
  };

  // ------------------------------------------------------------------ starting a round
  // Host / solo: make a new round and tell everyone.
  N.newMatch = function (course, roster) {
    N.match = {
      id: Math.random().toString(36).slice(2, 10), c: course, seed: Math.floor(Math.random() * 1e9),
      roster: roster, at: now()
    };
    N.scores = {};
    if (N.isHost()) sendStart();
    return N.match;
  };
  function sendStart(to) {
    const m = N.match;
    const msg = { t: "start", id: m.id, c: m.c, seed: m.seed, el: U.r2(now() - m.at), roster: m.roster.map(function (r) { return [r.name, r.hl || ""]; }) };
    // A player who reloads mid-round gets their score back.
    if (to && N.S) { const r = N.S.racers.find(function (x) { return x.hl === to; }); if (r) msg.sc = r.score; }
    HopLobby.send(msg, to);
  }

  function clientStart(d) {
    if (typeof d.id !== "string" || DR.Track.COURSES.indexOf(d.c) < 0 || !U.num(d.seed, 1e10) || !U.num(d.el, 1e5)) return;
    if (!Array.isArray(d.roster) || d.roster.length < 1 || d.roster.length > DR.CFG.maxPilots) return;
    const roster = [];
    for (let i = 0; i < d.roster.length; i++) {
      const r = d.roster[i];
      if (!Array.isArray(r) || typeof r[0] !== "string" || typeof r[1] !== "string") return;
      roster.push({ name: r[0].slice(0, 24), hl: r[1] || null });
    }
    if (N.match && N.match.id === d.id && N.S) return;   // already in it
    N.match = { id: d.id.slice(0, 16), c: d.c, seed: d.seed >>> 0, roster: roster, at: now() - d.el };
    if (N.on.start) N.on.start(N.match, d.el, U.num(d.sc, 1000) ? Math.max(0, d.sc | 0) : 0);
  }

  // main.js built this player's round: from now on we report on it.
  N.attach = function (S) {
    N.S = S;
    N.sendT = 0; N.finalSent = 0;
    S.racers.forEach(function (r) { r.rb = []; r.remote = r.id !== S.humanId; });
  };

  // ------------------------------------------------------------------ every step
  N.step = function (S, dt) {
    if (!N.online() || S !== N.S || !N.match) return;
    interpolate(S);
    N.sendT += dt;
    const me = S.me();
    // After the round, a few more reports so the final score surely lands.
    if (me && N.sendT >= (S.over ? 0.5 : SEND_EVERY) && (!S.over || N.finalSent < 6)) {
      N.sendT = 0;
      if (S.over) N.finalSent++;
      HopLobby.send({
        t: "p", id: N.match.id, x: U.r2(me.x), y: U.r2(me.y), z: U.r2(me.z), yw: U.r3(me.yaw),
        pt: U.r3(U.wrap(me.pitch)), rl: U.r3(U.wrap(me.roll)), sp: U.r1(me.speed), sc: me.score, lk: U.r2(me.lastKillT),
        dn: me.downT > 0 ? 1 : 0, f: S.over ? 1 : 0
      });
    }
  };

  function onPos(d, from) {
    const S = N.S;
    if (!S || !N.match || d.id !== N.match.id) { if (N.isClient()) hello(false); return; }
    const r = S.racers.find(function (x) { return x.hl === from; });
    if (!r || r.id === S.humanId) return;
    if (![d.x, d.y, d.z].every(function (v) { return U.num(v, 3000); })) return;
    if (!U.num(d.yw, 10) || !U.num(d.pt, 4) || !U.num(d.rl, 4) || !U.num(d.sp, 100) || !U.num(d.sc, 1000) || !U.num(d.lk, 1e4)) return;
    r.left = false;
    const sc = Math.max(0, Math.floor(d.sc));
    if (sc !== r.score) { r.score = sc; r.lastKillT = d.lk; if (S.over) DR.Sim.rank(S); }
    r.downT = d.dn ? 1 : 0;
    r.done = !!d.f;
    r.rb.push({ at: now(), x: d.x, y: d.y, z: d.z, yaw: U.wrap(d.yw), pitch: d.pt, roll: d.rl, speed: d.sp });
    if (r.rb.length > 10) r.rb.shift();
  }

  // Ghost drones: smoothly between the two reports around (now - DELAY).
  function interpolate(S) {
    const rt = now() - DELAY;
    S.racers.forEach(function (r) {
      if (r.id === S.humanId || !r.rb || !r.rb.length) return;
      const src = r.rb;
      let a = null, b = null;
      for (let k = src.length - 1; k >= 0; k--) { if (src[k].at <= rt) { a = src[k]; b = src[k + 1] || null; break; } }
      if (!a) a = src[0];
      const D = r.disp;
      if (b) {
        const u = U.clamp((rt - a.at) / Math.max(1e-3, b.at - a.at), 0, 1);
        D.x = a.x + (b.x - a.x) * u; D.y = a.y + (b.y - a.y) * u; D.z = a.z + (b.z - a.z) * u;
        D.yaw = a.yaw + U.wrap(b.yaw - a.yaw) * u; D.pitch = a.pitch + (b.pitch - a.pitch) * u; D.roll = a.roll + U.wrap(b.roll - a.roll) * u;
      } else {
        const e = U.clamp(rt - a.at, 0, 0.25);
        D.x = a.x + U.fwdX(a.yaw) * a.speed * e; D.y = a.y; D.z = a.z + U.fwdZ(a.yaw) * a.speed * e;
        D.yaw = a.yaw; D.pitch = a.pitch; D.roll = a.roll;
      }
      D.speed = a.speed;
      r.x = D.x; r.y = D.y; r.z = D.z;
    });
  }

  // ------------------------------------------------------------------ the lobby
  function onMessage(d, from) {
    if (!d || typeof d !== "object" || typeof d.t !== "string") return;
    if (d.t === "p") { onPos(d, from); return; }
    if (N.isHost()) { if (d.t === "hi" && N.match) sendStart(from); return; }
    if (from !== hostId()) return;
    if (d.t === "start") clientStart(d);
  }

  function onPlayers(players, newHost) {
    const ids = new Set(players.map(function (p) { return p.id; }));
    const S = N.S;
    if (S) S.racers.forEach(function (r) {
      if (r.id !== S.humanId && r.hl && !ids.has(r.hl) && !r.left) {
        r.left = true;
        if (S.over) DR.Sim.rank(S);
        if (N.on.left) N.on.left(r.name);
      }
    });
    if (newHost === myId() && !N.isHost()) {
      // The host left: we start the next rounds now. The round in play carries on.
      N.role = "host";
      if (N.on.promoted) N.on.promoted();
    }
  }

  DR.Net = N;
})(globalThis.DR);
