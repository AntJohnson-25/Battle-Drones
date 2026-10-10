// Multiplayer over the HopLobby relay (the host pattern from the developer docs).
// The lobby host runs the race (sim.js): bots, laps, places, pickup boxes, darts,
// EMPs and the finish order, and sends a snapshot 12 times a second. Every other
// player flies their own drone locally, so it feels instant, and reports where it
// is plus a running count of item presses; everything else they draw from the
// snapshots, about 120 ms behind so it stays smooth.
//
// Messages (every one is checked: the relay passes anything along):
//   host -> all    { t: "start", id, roster: [[name, hl, bot]] }   a new race
//   host -> all    { t: "s", id, T, p, b, d, e, ov, res }          snapshot
//   player -> host { t: "in", id, x, y, z, yw, pt, rl, sp, u }     my drone + item presses
//   player -> host { t: "hi" }                                     (re)joined: send me the race
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;
  const SNAP_EVERY = 1 / 12, SEND_EVERY = 1 / 15, DELAY = 0.12, ADOPT_AFTER = 2;
  const NP = 21;   // numbers per racer in a snapshot

  const N = {
    ctx: null, role: "solo",   // solo (opened on its own) | host | client
    match: null,                // { id, roster } of the current race
    S: null, snapT: 0, sendT: 0, outbox: [], buf: [], lastHi: 0,
    uses: 0, pendingUse: false, fresh: false, disagreeT: 0,
    on: {}                      // start(match) | promoted() | left(name)
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
    // Messages sent while the relay is down are lost: say hello each time it opens.
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

  // The lobby's humans, host first, with their HopLobby names.
  N.humans = function () {
    if (!N.online()) return [{ name: (HopLobby.me && HopLobby.me.name) || "You", hl: myId() }];
    return HopLobby.players.slice().sort(function (a, b) { return (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0); })
      .map(function (p) { return { name: String(p.name || "Player").slice(0, 24), hl: p.id }; });
  };

  // ------------------------------------------------------------------ host side
  N.hostStart = function (S, roster) {
    N.S = S;
    N.match = { id: Math.random().toString(36).slice(2, 10), roster: roster };
    N.snapT = 0; N.outbox.length = 0;
    S.racers.forEach(function (r) { r.remote = !r.bot && r.hl !== myId(); r.rb = []; r.seenU = null; });
    if (N.isHost()) sendStart();
  };
  function sendStart(to) {
    HopLobby.send({ t: "start", id: N.match.id, roster: N.match.roster.map(function (r) { return [r.name, r.hl || "", r.bot ? 1 : 0]; }) }, to);
  }

  // After each host step: pass on its events, and every 1/12 s a snapshot.
  N.hostStep = function (S, dt) {
    if (!N.isHost() || !N.match || S !== N.S) return;
    for (let i = 0; i < S.events.length; i++) N.outbox.push(S.events[i]);
    interpolate(S, function (r) { return r.remote ? r.rb : null; });
    N.snapT += dt;
    if (N.snapT >= SNAP_EVERY) {
      N.snapT = 0;
      const s = snap(S);
      if (JSON.stringify(s).length > 15000) s.e = s.e.filter(function (e) { return e.k === "fin" || e.k === "over"; });
      HopLobby.send(s);
      N.outbox.length = 0;
    }
  };

  function snap(S) {
    const p = S.racers.map(function (r) {
      const flags = (r.bot ? 1 : 0) | (r.finished ? 2 : 0) | (r.left ? 4 : 0);
      return [U.r2(r.x), U.r2(r.y), U.r2(r.z), U.r3(r.yaw), U.r3(r.pitch), U.r3(r.roll), U.r1(r.speed),
        r.gate, r.lap, r.passed, r.place, flags, r.item, r.hc, r.ec,
        U.r2(r.spinT), U.r2(r.slowT), U.r2(r.turboT), U.r2(r.smokeT), U.r2(r.shieldT), U.r2(r.finishT)];
    });
    let b = 0;
    S.boxes.forEach(function (x, i) { if (x.on) b |= 1 << i; });
    const d = S.darts.map(function (x) {
      return [x.id, x.owner, x.target, U.r2(x.x), U.r2(x.y), U.r2(x.z), U.r1(x.vx), U.r1(x.vy), U.r1(x.vz), U.r2(x.life)];
    });
    const s = { t: "s", id: N.match.id, T: U.r3(S.t), p: p, b: b, d: d, e: N.outbox.slice(0, 40) };
    if (S.over) { s.ov = 1; s.res = S.results.map(function (r) { return [r.id, r.t]; }); }
    return s;
  }

  function racerOf(from) {
    if (!N.S) return null;
    for (let i = 0; i < N.S.racers.length; i++) { const r = N.S.racers[i]; if (r.hl === from && !r.bot && !r.left) return r; }
    return null;
  }

  function hostInput(d, from) {
    const S = N.S, r = racerOf(from);
    if (!r || !r.remote || d.id !== N.match.id) return;
    if (![d.x, d.y, d.z].every(function (v) { return U.num(v, 2000); })) return;
    if (!U.num(d.yw, 10) || !U.num(d.pt, 3) || !U.num(d.rl, 3) || !U.num(d.sp, 100)) return;
    const t = now();
    // A jump further than the drone could fly (a reload, a lag spike, a cheat)
    // moves it but can't count as flying through a gate.
    const last = r.rb.length ? r.rb[r.rb.length - 1] : null;
    const far = !last || Math.hypot(d.x - r.x, d.z - r.z) > DR.CFG.turbo * Math.max(0.1, t - last.at) * 1.5 + 6;
    r.px = far ? d.x : r.x; r.py = far ? d.y : r.y; r.pz = far ? d.z : r.z;
    r.x = d.x; r.y = d.y; r.z = d.z; r.yaw = U.wrap(d.yw); r.pitch = d.pt; r.roll = d.rl; r.speed = d.sp;
    if (S.phase() === "race") DR.Sim.passGates(S, r);
    r.rb.push({ at: t, x: d.x, y: d.y, z: d.z, yaw: r.yaw, pitch: d.pt, roll: d.rl, speed: d.sp });
    if (r.rb.length > 10) r.rb.shift();
    // Item presses arrive as a running count, so a lost message never loses one.
    if (U.num(d.u, 1e6)) {
      if (r.seenU === null || d.u < r.seenU) r.seenU = d.u;   // first report, or their game restarted
      else if (d.u > r.seenU) { r.seenU = d.u; if (r.item) r.useReq = true; }
    }
  }

  // ------------------------------------------------------------------ player side
  function clientStart(d) {
    if (typeof d.id !== "string" || !Array.isArray(d.roster) || d.roster.length < 1 || d.roster.length > 16) return;
    const roster = [];
    for (let i = 0; i < d.roster.length; i++) {
      const r = d.roster[i];
      if (!Array.isArray(r) || typeof r[0] !== "string" || typeof r[1] !== "string") return;
      roster.push({ name: r[0].slice(0, 24), hl: r[1] || null, bot: !!r[2] });
    }
    if (N.match && N.match.id === d.id && N.S) return;   // already racing it
    N.match = { id: d.id.slice(0, 16), roster: roster };
    N.buf.length = 0;
    if (N.on.start) N.on.start(N.match);
  }

  // main.js built this player's copy of the race; snapshots fill it in from now on.
  N.clientAttach = function (S) {
    N.S = S;
    S.client = true;
    N.buf.length = 0;
    N.sendT = 0; N.pendingUse = false; N.fresh = true; N.disagreeT = 0;
    S.racers.forEach(function (r) { r.remote = false; r.rb = []; });
  };

  function clientSnap(d) {
    const S = N.S;
    if (!N.match || d.id !== N.match.id) { hello(false); return; }
    if (!S || !Array.isArray(d.p) || d.p.length !== S.racers.length || !U.num(d.T, 1e6)) return;
    if (!d.p.every(function (a) { return Array.isArray(a) && a.length >= NP && a.slice(0, NP).every(function (v) { return U.num(v, 1e5); }); })) return;
    d.at = now();
    N.buf.push(d);
    if (N.buf.length > 8) N.buf.shift();
    applySnap(S, d);
  }

  function applySnap(S, d) {
    // Race clock: follow the host's, smoothly unless far off.
    if (Math.abs(S.t - d.T) > 0.3) S.t = d.T; else S.t += (d.T - S.t) * 0.1;
    const me = S.me();
    d.p.forEach(function (a, i) {
      const r = S.racers[i];
      r.place = a[10] | 0;
      r.bot = !!(a[11] & 1); r.left = !!(a[11] & 4);
      r.shieldT = a[19]; r.smokeT = a[18];
      if (r === me) {
        // Hits and EMPs: counters, so a lost snapshot still lands them once.
        if (a[13] > r.hc && !N.fresh) { r.spinT = DR.CFG.spinT; S.events.push({ k: "ouch", p: r.id }); }
        if (a[14] > r.ec && !N.fresh) { r.slowT = DR.CFG.slowT; }
        r.hc = a[13]; r.ec = a[14];
        if (N.pendingUse) { if (!a[12]) N.pendingUse = false; } else r.item = a[12] | 0;
        // Our own position, laps and gates are ours, unless we just (re)joined or
        // the host has disagreed for a while (e.g. our report of a gate got lost).
        const differs = a[7] !== r.gate || a[8] !== r.lap || (!!(a[11] & 2)) !== r.finished;
        N.disagreeT = differs ? N.disagreeT + (d.at - (N.lastSnapAt || d.at)) : 0;
        if (N.fresh) { r.x = r.px = a[0]; r.y = r.py = a[1]; r.z = r.pz = a[2]; r.yaw = a[3]; r.speed = a[6]; r.hc = a[13]; r.ec = a[14]; }
        if (N.fresh || N.disagreeT > ADOPT_AFTER || (a[11] & 2 && !r.finished)) {
          r.gate = a[7] | 0; r.lap = a[8] | 0; r.passed = a[9] | 0; r.finished = !!(a[11] & 2); r.finishT = a[20]; N.disagreeT = 0;
        }
        if (r.finished) r.finishT = a[20];
        return;
      }
      r.x = a[0]; r.y = a[1]; r.z = a[2]; r.yaw = a[3]; r.pitch = a[4]; r.roll = a[5]; r.speed = a[6];
      r.gate = a[7] | 0; r.lap = a[8] | 0; r.passed = a[9] | 0; r.finished = !!(a[11] & 2);
      r.item = a[12] | 0; r.hc = a[13]; r.ec = a[14];
      r.spinT = a[15]; r.slowT = a[16]; r.turboT = a[17]; r.finishT = a[20];
    });
    N.lastSnapAt = d.at;
    N.fresh = false;
    // Pickup boxes and darts as the host has them.
    if (U.num(d.b, 1e9)) S.boxes.forEach(function (b, i) { b.on = !!(d.b & (1 << i)); });
    if (Array.isArray(d.d)) {
      S.darts = d.d.filter(function (x) { return Array.isArray(x) && x.length >= 10 && x.every(function (v) { return U.num(v, 1e6); }); })
        .slice(0, 64).map(function (x) {
          return { id: x[0], owner: x[1], target: x[2], x: x[3], y: x[4], z: x[5], vx: x[6], vy: x[7], vz: x[8], life: x[9] };
        });
    }
    // Events for sounds, effects and the HUD. Our own gates and laps we counted ourselves.
    if (Array.isArray(d.e)) d.e.slice(0, 40).forEach(function (e) {
      if (!e || typeof e.k !== "string" || !U.num(e.p, 64) || !S.racers[e.p]) return;
      if (me && e.p === me.id && (e.k === "gate" || e.k === "lap" || e.k === "fin" || e.k === "bonk")) return;
      if (e.by !== undefined && !(U.num(e.by, 64) && S.racers[e.by])) return;
      S.events.push(e);
    });
    if (d.ov && !S.over && Array.isArray(d.res)) {
      S.over = true;
      S.results = d.res.filter(function (x) { return Array.isArray(x) && U.num(x[0], 64) && S.racers[x[0]] && U.num(x[1], 1e5); })
        .map(function (x) { return { id: x[0], t: x[1] }; });
      S.events.push({ k: "over" });
    }
  }

  // One step on a player's machine: our drone (sim.js), everyone else between
  // the two snapshots around (now - DELAY), then our report to the host.
  N.clientStep = function (S, dt) {
    const me = S.me();
    // Item press: count it, and turbo straight away (it only moves us).
    if (S.input.use && me && me.item && !N.pendingUse && S.phase() === "race" && !me.finished) {
      N.uses++; N.pendingUse = true; N.sendT = SEND_EVERY;
      if (DR.ITEMS[me.item] === "turbo") me.turboT = DR.CFG.turboT;
      S.events.push({ k: "use", p: me.id, it: me.item, local: true });
      me.item = 0;
    }
    S.input.use = false;
    DR.Sim.step(S, dt);
    // Darts keep flying between snapshots.
    S.darts.forEach(function (x) { x.x += x.vx * dt; x.y += x.vy * dt; x.z += x.vz * dt; });
    interpolate(S, function (r) { return r === me ? null : "snap"; });
    N.sendT += dt;
    if (me && N.sendT >= SEND_EVERY) {
      N.sendT = 0;
      HopLobby.send({
        t: "in", id: N.match.id, x: U.r2(me.x), y: U.r2(me.y), z: U.r2(me.z), yw: U.r3(me.yaw),
        pt: U.r3(me.pitch), rl: U.r3(me.roll), sp: U.r1(me.speed), u: N.uses
      }, hostId());
    }
  };

  // Smooth drawing positions for drones moved by messages, about DELAY behind.
  function interpolate(S, source) {
    const rt = now() - DELAY;
    S.racers.forEach(function (r, i) {
      const src = source(r);
      if (!src) return;
      let a = null, b = null;
      if (src === "snap") {
        for (let k = N.buf.length - 1; k >= 0; k--) { if (N.buf[k].at <= rt) { a = N.buf[k]; b = N.buf[k + 1] || null; break; } }
        if (!a && N.buf.length) a = N.buf[0];
        if (!a) return;
        const pa = a.p[i], pb = b ? b.p[i] : null;
        place(r.disp, a.at, pb ? b.at : 0, pa[0], pa[1], pa[2], pa[3], pa[4], pa[5], pa[6],
          pb && pb[0], pb && pb[1], pb && pb[2], pb && pb[3], pb && pb[4], pb && pb[5], rt);
      } else {
        for (let k = src.length - 1; k >= 0; k--) { if (src[k].at <= rt) { a = src[k]; b = src[k + 1] || null; break; } }
        if (!a && src.length) a = src[0];
        if (!a) return;
        place(r.disp, a.at, b ? b.at : 0, a.x, a.y, a.z, a.yaw, a.pitch, a.roll, a.speed,
          b && b.x, b && b.y, b && b.z, b && b.yaw, b && b.pitch, b && b.roll, rt);
      }
    });
  }
  function place(D, at, bt, x, y, z, yaw, pitch, roll, speed, x2, y2, z2, yaw2, pitch2, roll2, rt) {
    if (bt) {
      const u = U.clamp((rt - at) / Math.max(1e-3, bt - at), 0, 1);
      D.x = x + (x2 - x) * u; D.y = y + (y2 - y) * u; D.z = z + (z2 - z) * u;
      D.yaw = yaw + U.wrap(yaw2 - yaw) * u; D.pitch = pitch + (pitch2 - pitch) * u; D.roll = roll + (roll2 - roll) * u;
    } else {
      // No newer message yet: carry on along the last heading for a moment.
      const e = U.clamp(rt - at, 0, 0.25);
      D.x = x + U.fwdX(yaw) * speed * e; D.y = y; D.z = z + U.fwdZ(yaw) * speed * e;
      D.yaw = yaw; D.pitch = pitch; D.roll = roll;
    }
    D.speed = speed;
  }

  // ------------------------------------------------------------------ the lobby
  function onMessage(d, from) {
    if (!d || typeof d !== "object" || typeof d.t !== "string") return;
    if (N.isHost()) {
      if (d.t === "in" && N.match) hostInput(d, from);
      else if (d.t === "hi" && N.match) sendStart(from);
      return;
    }
    // Everything else only counts from the current host.
    if (from !== hostId()) return;
    if (d.t === "start") clientStart(d);
    else if (d.t === "s") clientSnap(d);
  }

  function onPlayers(players, newHost) {
    const ids = new Set(players.map(function (p) { return p.id; }));
    const S = N.S;
    if (newHost === myId() && !N.isHost()) {
      // The host left and HopLobby made us host: carry the race on from our copy.
      N.role = "host";
      if (S && N.match) {
        S.client = false;
        S.racers.forEach(function (r) {
          r.rb = [];
          if (r.bot || r.left) { r.remote = false; return; }
          if (r.hl === myId()) { r.remote = false; return; }
          if (!ids.has(r.hl)) { r.left = true; r.remote = false; }
          else { r.remote = true; r.seenU = null; }
        });
        N.snapT = 0;
        sendStart();
      }
      if (N.on.promoted) N.on.promoted();
      return;
    }
    if (N.isHost() && S && N.match) {
      // Players who left: their drone flies on by itself and won't be placed.
      S.racers.forEach(function (r) {
        if (!r.bot && !r.left && r.hl && r.hl !== myId() && !ids.has(r.hl)) {
          r.left = true; r.remote = false;
          if (N.on.left) N.on.left(r.name);
        }
      });
    }
  }

  DR.Net = N;
})(globalThis.DR);
