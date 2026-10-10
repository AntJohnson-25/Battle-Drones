// The race: flight, gates and laps, bots, pickup boxes and the five pickups.
// Pure JavaScript (no three.js), so tools/net-test.js can run whole races in Node.
//
// Who runs what: the lobby host (or a player on their own) runs everything here.
// Every other player flies only their own drone with this code and draws the rest
// from the host's snapshots (net.js). The host decides laps, places, pickups and
// hits: the relay passes along anything, so players never decide those themselves.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;

  const CFG = DR.CFG = {
    cruise: 30, brake: 17, turbo: 47, spinSpeed: 8, slowMul: 0.55, finishedCruise: 0.75,
    turn: 1.75, brakeTurn: 1.35, climb: 13, accel: 22, decel: 34,
    clearance: 1.2, ceiling: 85, boundary: 70,
    intro: 6.5, count: 3, liftoff: 1.2, finishWait: 30, overWait: 2.5, maxRace: 480,
    spinT: 1.3, slowT: 2.6, turboT: 2.2, shieldT: 10, smokeT: 5,
    empR: 20, dartSpeed: 62, dartLife: 4, dartR: 2.4, dartTurn: 4.5,
    boxR: 2.6, boxRespawn: 4, minField: 6, maxField: 16
  };
  // Item ids travel as numbers: 0 = none.
  const ITEMS = DR.ITEMS = [null, "turbo", "dart", "shield", "emp", "smoke"];
  const COLOURS = DR.COLOURS = [0xff6b5a, 0x58c4ff, 0xffd23f, 0x8affa0, 0xc792ff, 0xff9f43, 0x4dffe0, 0xff7ad9,
    0xb8f05a, 0x7aa7ff, 0xffb3a1, 0x9cffd8, 0xe8e46a, 0xd49bff, 0x6ae0ff, 0xffc46a];
  const BOT_NAMES = ["Zippy", "Rotor", "Bzzt", "Hover", "Quadzilla", "Propsy", "Whirly", "Nimbus", "Volt", "Kestrel",
    "Dash", "Pixel", "Gusty", "Comet", "Swoop", "Echo"];

  // A new race. roster: [{ name, hl (lobby player id, or null for a bot), bot }].
  function create(T, roster, opts) {
    opts = opts || {};
    const S = {
      T: T, t: 0, laps: T.laps, client: !!opts.client, humanId: -1,
      racers: [], boxes: T.boxes.map(function (b) { return { x: b.x, y: b.y, z: b.z, on: true, respawn: 0 }; }),
      darts: [], nextDart: 1, events: [], over: false, overAt: 0, firstFinishT: -1, results: null,
      input: { steer: 0, climb: 0, brake: false, use: false },
      rand: opts.rand || Math.random
    };
    roster.forEach(function (r, i) {
      const g = T.grid[i % T.grid.length];
      S.racers.push({
        id: i, name: r.name, hl: r.hl || null, bot: !!r.bot, left: false, colour: COLOURS[i % COLOURS.length],
        x: g.x, y: g.y, z: g.z, px: g.x, py: g.y, pz: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0, vy: 0,
        steerS: 0, gate: 0, lap: 0, passed: 0, finished: false, finishT: 0, place: i + 1, prog: 0,
        item: 0, itemT: 0, useDelay: 1, hc: 0, ec: 0, spinT: 0, slowT: 0, turboT: 0, smokeT: 0, shieldT: 0,
        sync: 0, near: -1, s: 0, bonkT: 0, missT: 0, wrongT: 0,
        skill: 0.9 + ((i * 37) % 10) / 100, botOff: ((i * 53) % 7 - 3) * 0.9,
        disp: { x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0 }
      });
    });
    S.phase = function () { return S.t < CFG.intro ? "intro" : S.t < CFG.intro + CFG.count ? "count" : "race"; };
    S.raceT = function () { return S.t - CFG.intro - CFG.count; };
    S.me = function () { return S.humanId >= 0 ? S.racers[S.humanId] : null; };
    return S;
  }

  // The lobby's humans plus bots up to the minimum field.
  function roster(humans) {
    const out = humans.slice(0, CFG.maxField).map(function (h) { return { name: h.name, hl: h.hl, bot: false }; });
    for (let k = 0; out.length < CFG.minField; k++) out.push({ name: BOT_NAMES[k % BOT_NAMES.length], hl: null, bot: true });
    return out;
  }

  // ------------------------------------------------------------------ flight
  // Arcade flight: the drone always flies forward; steer turns, climb rises or
  // dives, and with no climb input it holds its height (altitude assist).
  function fly(S, r, inp, dt) {
    const T = S.T;
    r.px = r.x; r.py = r.y; r.pz = r.z;
    const ph = S.phase();
    if (ph !== "race") { r.speed = 0; r.vy = 0; setDisp(r); return; }
    const rt = S.raceT();
    const ctl = r.spinT > 0 ? { steer: 0, climb: 0, brake: false } : inp;
    let target = CFG.cruise * (r.bot ? r.skill * (r.rubber || 1) : 1);
    if (r.finished) target = CFG.cruise * CFG.finishedCruise;
    if (ctl.brake) target = CFG.brake;
    if (r.turboT > 0) target = CFG.turbo;
    if (r.slowT > 0) target *= CFG.slowMul;
    if (r.spinT > 0) target = CFG.spinSpeed;
    // Lift-off: a short climb off the pad so nobody clips the start arch.
    if (rt < CFG.liftoff) target *= U.ease(rt / CFG.liftoff);
    r.speed = U.approach(r.speed, target, (target > r.speed ? CFG.accel * (r.turboT > 0 ? 2 : 1) : CFG.decel) * dt);
    r.steerS = U.approach(r.steerS, U.clamp(ctl.steer, -1, 1), 6 * dt);
    r.yaw = U.wrap(r.yaw + CFG.turn * r.steerS * (ctl.brake ? CFG.brakeTurn : 1) * dt);
    let climb = U.clamp(ctl.climb, -1, 1);
    const ground0 = T.terrain(r.x, r.z);
    if (rt < CFG.liftoff + 0.4 && r.y < ground0 + 5) climb = Math.max(climb, 0.8);
    r.vy = U.approach(r.vy, climb * CFG.climb, 30 * dt);
    let nx = r.x + U.fwdX(r.yaw) * r.speed * dt, nz = r.z + U.fwdZ(r.yaw) * r.speed * dt, ny = r.y + r.vy * dt;
    const ground = T.terrain(nx, nz);
    if (ground + CFG.clearance > ny) {
      if (ground - ground0 > 1.8 && ground + CFG.clearance - ny > 1.5) {
        // Flew into a hillside: bounce off it instead of climbing the wall.
        nx = r.x; nz = r.z; r.speed *= 0.35; r.bonkT = 0.5;
        S.events.push({ k: "bonk", p: r.id });
      }
      ny = Math.max(ny, T.terrain(nx, nz) + CFG.clearance);
      if (r.vy < 0) r.vy = 0;
    }
    if (ny > CFG.ceiling) { ny = CFG.ceiling; if (r.vy > 0) r.vy = 0; }
    // Invisible fence well outside the course.
    const nb = T.nearest(nx, nz, r.near);
    r.near = nb.i; r.s = nb.s;
    if (nb.d > CFG.boundary) {
      const lx = T.pts[nb.i * 3], lz = T.pts[nb.i * 3 + 2], k = CFG.boundary / nb.d;
      nx = lx + (nx - lx) * k; nz = lz + (nz - lz) * k;
    }
    r.x = nx; r.y = ny; r.z = nz;
    r.roll = r.steerS * 0.6;
    r.pitch = -0.28 * (r.speed / CFG.cruise) + (r.vy / CFG.climb) * 0.3;
    if (r.bonkT > 0) r.bonkT -= dt;
    setDisp(r);
  }
  function setDisp(r) {
    const d = r.disp;
    d.x = r.x; d.y = r.y; d.z = r.z; d.yaw = r.yaw; d.pitch = r.pitch; d.roll = r.roll; d.speed = r.speed;
  }

  // Did the move from (px,py,pz) to (x,y,z) fly through the racer's next gate?
  function crossesGate(g, r) {
    const d0 = (r.px - g.x) * g.nx + (r.pz - g.z) * g.nz;
    const d1 = (r.x - g.x) * g.nx + (r.z - g.z) * g.nz;
    if (!(d0 < 0 && d1 >= 0)) return false;
    const u = -d0 / Math.max(1e-6, d1 - d0);
    const ix = r.px + (r.x - r.px) * u, iy = r.py + (r.y - r.py) * u, iz = r.pz + (r.z - r.pz) * u;
    const side = (ix - g.x) * g.sx + (iz - g.z) * g.sz;
    return Math.abs(side) <= g.w / 2 + 0.6 && Math.abs(iy - g.y) <= g.h / 2 + 0.6;
  }

  // Gates in order; gate 0 starts each lap, and the last lap ends there.
  function passGates(S, r) {
    if (r.finished || r.left || S.phase() !== "race") return;
    const T = S.T, g = T.gates[r.gate];
    if (!crossesGate(g, r)) return;
    r.passed++;
    r.missT = 0;
    if (r.gate === 0) {
      if (r.lap >= S.laps) {
        r.finished = true;
        r.finishT = S.raceT();
        if (S.firstFinishT < 0 && !r.bot) S.firstFinishT = S.t;
        S.events.push({ k: "fin", p: r.id, t: U.r2(r.finishT) });
        return;
      }
      r.lap++;
      if (r.lap > 1) S.events.push({ k: "lap", p: r.id, l: r.lap });
    }
    S.events.push({ k: "gate", p: r.id, g: r.gate });
    r.gate = (r.gate + 1) % T.gates.length;
  }

  // How far round the race a racer is, for places.
  function progress(S, r) {
    const T = S.T, g = T.gates[r.gate], pg = T.gates[(r.gate - 1 + T.gates.length) % T.gates.length];
    const seg = Math.hypot(g.x - pg.x, g.y - pg.y, g.z - pg.z) || 1;
    const d = Math.hypot(r.x - g.x, r.y - g.y, r.z - g.z);
    return r.passed + U.clamp(1 - d / seg, 0, 0.99);
  }

  function rankPlaces(S) {
    S.racers.forEach(function (r) { r.prog = progress(S, r); });
    // Players who left go last; their drone flies on by itself but isn't placed.
    const order = S.racers.slice().sort(function (a, b) {
      if (a.left !== b.left) return a.left ? 1 : -1;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishT - b.finishT;
      return b.prog - a.prog;
    });
    order.forEach(function (r, i) { r.place = i + 1; });
    return order;
  }

  // ------------------------------------------------------------------ bots
  function botInput(S, r, dt) {
    const T = S.T, g = T.gates[r.gate], g2 = T.gates[(r.gate + 1) % T.gates.length];
    let ax = g.x + g.sx * r.botOff, ay = g.y, az = g.z + g.sz * r.botOff;
    const dg = Math.hypot(ax - r.x, az - r.z);
    // Nearly through: start turning for the one after, as long as we're lined up.
    const along = (r.x - g.x) * g.nx + (r.z - g.z) * g.nz;
    if (dg < 14 && along > -6) {
      const k = U.clamp((14 - dg) / 14, 0, 0.6);
      ax = U.lerp(ax, g2.x, k); ay = U.lerp(ay, g2.y, k); az = U.lerp(az, g2.z, k);
    }
    const diff = U.wrap(U.yawTo(ax - r.x, az - r.z) - r.yaw);
    const inp = {
      steer: U.clamp(diff * 2.2, -1, 1),
      climb: U.clamp((ay - r.y) * 0.4 - r.vy * 0.06, -1, 1),
      brake: Math.abs(diff) > 1.0 && r.speed > 20
    };
    if (r.item && !r.finished) {
      r.itemT += dt;
      if (r.itemT > r.useDelay) {
        // Darts only with someone to aim at.
        if (ITEMS[r.item] !== "dart" || r.place > 1) r.useReq = true;
      }
    }
    return inp;
  }

  // Bots well ahead of every human ease off a little, bots far behind catch up a
  // little; humans are never slowed.
  function rubberBand(S) {
    let best = -1;
    S.racers.forEach(function (r) { if (!r.bot && !r.left && !r.finished) best = Math.max(best, r.prog); });
    if (best < 0) { S.racers.forEach(function (r) { r.rubber = 1; }); return; }
    S.racers.forEach(function (r) {
      if (!r.bot) return;
      const gap = r.prog - best;
      r.rubber = gap > 3 ? 0.93 : gap < -4 ? 1.06 : 1;
    });
  }

  // ------------------------------------------------------------------ pickups
  function rollItem(S, r) {
    const n = S.racers.length, f = n > 1 ? (r.place - 1) / (n - 1) : 0.5;
    // weights: turbo, dart, shield, emp, smoke
    const w = f < 0.34 ? [10, 20, 35, 5, 30] : f < 0.67 ? [25, 30, 15, 20, 10] : [40, 25, 10, 25, 0];
    let x = S.rand() * w.reduce(function (a, b) { return a + b; }, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i + 1; }
    return 1;
  }

  function pickups(S, dt) {
    S.boxes.forEach(function (b, bi) {
      if (!b.on) { b.respawn -= dt; if (b.respawn <= 0) b.on = true; return; }
      for (let i = 0; i < S.racers.length; i++) {
        const r = S.racers[i];
        if (r.finished || r.left) continue;
        if (Math.abs(r.x - b.x) > CFG.boxR || Math.abs(r.z - b.z) > CFG.boxR || Math.abs(r.y - b.y) > CFG.boxR) continue;
        b.on = false; b.respawn = CFG.boxRespawn;
        if (!r.item) {
          r.item = rollItem(S, r); r.itemT = 0; r.useDelay = 0.8 + S.rand() * 2.5;
          S.events.push({ k: "pick", p: r.id, it: r.item, b: bi });
        } else S.events.push({ k: "box", p: r.id, b: bi });
        break;
      }
    });
  }

  function racerAhead(S, r) {
    for (let i = 0; i < S.racers.length; i++) {
      const o = S.racers[i];
      if (o !== r && o.place === r.place - 1 && !o.finished && !o.left) return o;
    }
    return null;
  }

  function useItem(S, r) {
    const it = ITEMS[r.item];
    r.useReq = false;
    if (!it || r.finished) return;
    r.item = 0;
    S.events.push({ k: "use", p: r.id, it: ITEMS.indexOf(it) });
    if (it === "turbo") r.turboT = CFG.turboT;
    else if (it === "shield") r.shieldT = CFG.shieldT;
    else if (it === "smoke") r.smokeT = CFG.smokeT;
    else if (it === "emp") {
      S.events.push({ k: "emp", p: r.id, x: U.r1(r.x), y: U.r1(r.y), z: U.r1(r.z) });
      S.racers.forEach(function (o) {
        if (o === r || o.finished || o.left) return;
        if (Math.hypot(o.x - r.x, o.y - r.y, o.z - r.z) > CFG.empR) return;
        if (o.shieldT > 0) { o.shieldT = 0; S.events.push({ k: "block", p: o.id, by: r.id }); }
        else { o.slowT = CFG.slowT; o.ec++; S.events.push({ k: "zap", p: o.id, by: r.id }); }
      });
    } else if (it === "dart") {
      const tgt = racerAhead(S, r);
      const fx = U.fwdX(r.yaw), fz = U.fwdZ(r.yaw);
      S.darts.push({
        id: S.nextDart++, owner: r.id, target: tgt ? tgt.id : -1, life: CFG.dartLife,
        x: r.x + fx * 2, y: r.y, z: r.z + fz * 2, vx: fx * CFG.dartSpeed, vy: 0, vz: fz * CFG.dartSpeed
      });
    }
  }

  function stepDarts(S, dt) {
    S.darts = S.darts.filter(function (d) {
      d.life -= dt;
      const tgt = d.target >= 0 ? S.racers[d.target] : null;
      if (tgt && !tgt.finished && !tgt.left) {
        // Home in: turn the velocity toward the target.
        let tx = tgt.x - d.x, ty = tgt.y - d.y, tz = tgt.z - d.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        const k = Math.min(1, CFG.dartTurn * dt);
        let vx = U.lerp(d.vx / CFG.dartSpeed, tx, k), vy = U.lerp(d.vy / CFG.dartSpeed, ty, k), vz = U.lerp(d.vz / CFG.dartSpeed, tz, k);
        const vl = Math.hypot(vx, vy, vz) || 1;
        d.vx = vx / vl * CFG.dartSpeed; d.vy = vy / vl * CFG.dartSpeed; d.vz = vz / vl * CFG.dartSpeed;
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.life <= 0 || d.y < S.T.terrain(d.x, d.z)) return false;
      for (let i = 0; i < S.racers.length; i++) {
        const o = S.racers[i];
        if (o.id === d.owner || o.finished || o.left) continue;
        if (Math.hypot(o.x - d.x, o.y - d.y, o.z - d.z) > CFG.dartR) continue;
        if (o.shieldT > 0) { o.shieldT = 0; S.events.push({ k: "block", p: o.id, by: d.owner }); }
        else { o.spinT = CFG.spinT; o.hc++; S.events.push({ k: "hit", p: o.id, by: d.owner }); }
        return false;
      }
      return true;
    });
  }

  function timers(r, dt) {
    if (r.spinT > 0) r.spinT = Math.max(0, r.spinT - dt);
    if (r.slowT > 0) r.slowT = Math.max(0, r.slowT - dt);
    if (r.turboT > 0) r.turboT = Math.max(0, r.turboT - dt);
    if (r.smokeT > 0) r.smokeT = Math.max(0, r.smokeT - dt);
    if (r.shieldT > 0) r.shieldT = Math.max(0, r.shieldT - dt);
  }

  // Missed-gate and wrong-way warnings for the HUD (own drone only).
  function warnings(S, r, dt) {
    const T = S.T, g = T.gates[r.gate];
    let ahead = r.s - g.s;
    ahead = ((ahead % T.len) + T.len * 1.5) % T.len - T.len / 2;   // -len/2..len/2
    r.missT = ahead > 20 && !r.finished && S.phase() === "race" ? r.missT + dt : 0;
    const ti = Math.max(0, r.near);
    const dot = U.fwdX(r.yaw) * T.tan[ti * 3] + U.fwdZ(r.yaw) * T.tan[ti * 3 + 2];
    r.wrongT = dot < -0.3 && r.missT === 0 && S.phase() === "race" && !r.finished ? r.wrongT + dt : 0;
  }

  // ------------------------------------------------------------------ one step
  // Host / solo: everything. Player (S.client): own drone and HUD warnings only;
  // net.js fills in everyone else.
  function step(S, dt) {
    S.t += dt;
    const me = S.me();
    if (S.client) {
      if (me) {
        fly(S, me, S.input, dt);
        passGates(S, me);
        timers(me, dt);
        warnings(S, me, dt);
      }
      return;
    }
    rubberBand(S);
    S.racers.forEach(function (r) {
      if (r.remote) return;   // another player's drone: moved by their reports (net.js)
      const inp = r.id === S.humanId && !r.finished ? S.input : botInput(S, r, dt);
      fly(S, r, inp, dt);
      passGates(S, r);
    });
    if (me) warnings(S, me, dt);
    rankPlaces(S);
    if (S.phase() === "race") {
      if (me && S.input.use) { me.useReq = true; }
      S.input.use = false;
      pickups(S, dt);
      S.racers.forEach(function (r) { if (r.useReq) useItem(S, r); });
      stepDarts(S, dt);
    } else S.input.use = false;
    S.racers.forEach(function (r) { timers(r, dt); });
    checkOver(S);
  }

  function checkOver(S) {
    if (S.over || S.phase() !== "race") return;
    const humans = S.racers.filter(function (r) { return !r.bot && !r.left; });
    const allIn = humans.length > 0 && humans.every(function (r) { return r.finished; });
    const everyone = S.racers.every(function (r) { return r.finished || r.left; });
    if ((allIn || everyone) && !S.overAt) S.overAt = S.t + CFG.overWait;
    const late = S.firstFinishT >= 0 && S.t - S.firstFinishT > CFG.finishWait;
    if ((S.overAt && S.t >= S.overAt) || late || S.raceT() > CFG.maxRace || (humans.length === 0 && !S.solo)) finish(S);
  }

  function finish(S) {
    const order = rankPlaces(S);
    S.over = true;
    S.results = order.map(function (r) { return { id: r.id, t: r.finished ? U.r2(r.finishT) : -1 }; });
    S.events.push({ k: "over" });
  }

  DR.Sim = {
    create: create, roster: roster, step: step, fly: fly, passGates: passGates, crossesGate: crossesGate,
    rankPlaces: rankPlaces, useItem: useItem, botInput: botInput, finish: finish
  };
})(globalThis.DR);
