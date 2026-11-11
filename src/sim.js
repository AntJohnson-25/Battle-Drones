// The hunt: your drone, your own pack of target drones fleeing along the course,
// your shots, their return fire, getting shot down and respawning.
// Pure JavaScript (no three.js), so tools/sim-test.js can run whole rounds in Node.
//
// Who runs what: every player runs their OWN round here. Everyone gets the same
// pack of targets (same seed, same order, same toughness), so it's fair, and
// nothing that has to be quick goes over the network: your shots, their shots
// and the hits all happen on your machine. Only positions (for the ghost drones
// of the other pilots) and scores are shared (net.js).
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;

  const CFG = DR.CFG = {
    // flight
    cruise: 30, brake: 16, turn: 1.75, brakeTurn: 1.45, climb: 14, accel: 22, decel: 34, clearance: 1.2,
    camTilt: 0.28,                      // the FPV camera and the guns point this far above the nose
    // round
    intro: 6.5, count: 3, round: 180, liftoff: 1.2, maxPilots: 8,
    // you
    hp: 100, downT: 3, invulnT: 2.5, bonkDmg: 6,
    fireEvery: 1 / 7, shotSpeed: 170, shotLife: 1.05, assist: 0.11, assistRange: 175,
    // them
    pool: 60, alive: 5, spawnAhead: 85, tHp: 3, aceHp: 7, tR: 2.1, aceR: 2.7,
    boltSpeed: 64, boltLife: 2.4, boltDmg: 11, aceDmg: 16, fireRange: 85, boltR: 1.5,
    evadeR: 34, escapeAfter: 6, escapeBehind: 130
  };
  const COLOURS = DR.COLOURS = [0x58c4ff, 0xffd23f, 0x8affa0, 0xc792ff, 0xff9f43, 0x4dffe0, 0xff7ad9, 0xb8f05a];

  // The pack: the same 60 targets, in the same order, for every pilot this round.
  // Every 10th is an "ace": tougher, hits harder, worth 3.
  function pack(seed) {
    const r = U.rng(seed >>> 0);
    const out = [];
    for (let k = 0; k < CFG.pool; k++) {
      const ace = k % 10 === 9;
      out.push({
        k: k, ace: ace, hp: ace ? CFG.aceHp : CFG.tHp, pts: ace ? 3 : 1,
        spd: (ace ? 25 : 20) + r() * 5, lat: 3 + r() * 6, latW: 0.45 + r() * 0.6, ph: r() * 6.28,
        alt: 1 + r() * 6, altA: 2 + r() * 3.5, altW: 0.35 + r() * 0.5, ph2: r() * 6.28,
        gap: r() * 55, fireI: (ace ? 1.3 : 1.9) + r() * 1.4
      });
    }
    return out;
  }

  // A new round. roster: [{ name, hl }]; t0: seconds already gone (a late joiner).
  function create(T, roster, opts) {
    opts = opts || {};
    const seed = opts.seed === undefined ? 1 : opts.seed;
    const S = {
      T: T, t: opts.t0 || 0, seed: seed, humanId: -1, racers: [],
      pack: pack(seed), next: 0, targets: [], shots: [], bolts: [], nextId: 1,
      events: [], over: false, results: null, kills: 0, escaped: 0,
      input: { steer: 0, climb: 0, brake: false, fire: false },
      rand: U.rng((seed * 7919 + 17) >>> 0)
    };
    roster.slice(0, CFG.maxPilots).forEach(function (r, i) {
      const g = T.grid[i % T.grid.length];
      S.racers.push({
        id: i, name: r.name, hl: r.hl || null, bot: false, left: false, colour: COLOURS[i % COLOURS.length],
        x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0, vy: 0, steerS: 0,
        near: -1, s: T.startS - 14, hp: CFG.hp, downT: 0, invulnT: 0, bonkT: 0, hurtT: 0, wrongT: 0,
        fireCd: 0, score: opts.score && i === opts.me ? opts.score : 0, lastKillT: 0, shotsFired: 0, shotsHit: 0, deaths: 0,
        disp: { x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0 }
      });
    });
    S.phase = function () {
      return S.t < CFG.intro ? "intro" : S.t < CFG.intro + CFG.count ? "count" : S.over ? "over" : "hunt";
    };
    S.huntT = function () { return S.t - CFG.intro - CFG.count; };
    S.left = function () { return Math.max(0, CFG.round - S.huntT()); };
    S.me = function () { return S.humanId >= 0 ? S.racers[S.humanId] : null; };
    // A late joiner is placed on the line rather than the pad.
    if (opts.t0 > CFG.intro + CFG.count && opts.me >= 0 && S.racers[opts.me]) respawnAt(S, S.racers[opts.me], T.startS + 20, false);
    return S;
  }

  function roster(humans) {
    return humans.slice(0, CFG.maxPilots).map(function (h) { return { name: h.name, hl: h.hl }; });
  }

  // ------------------------------------------------------------------ flight
  function fly(S, r, inp, dt) {
    const T = S.T;
    const ph = S.phase();
    if (ph === "intro" || ph === "count") { r.speed = 0; r.vy = 0; setDisp(r); return; }
    if (r.downT > 0) {
      // Shot down: tumble to the ground, then respawn on the line behind.
      r.downT -= dt;
      r.vy -= 22 * dt; r.speed = U.approach(r.speed, 0, 12 * dt);
      r.x += U.fwdX(r.yaw) * r.speed * dt; r.z += U.fwdZ(r.yaw) * r.speed * dt; r.y += r.vy * dt;
      const gnd = T.terrain(r.x, r.z) + 0.4;
      if (r.y < gnd) { r.y = gnd; r.vy = 0; r.speed = 0; }
      r.roll += dt * 9; r.pitch = -0.8;
      if (r.downT <= 0) { respawnAt(S, r, r.s - 18, true); S.events.push({ k: "respawn", p: r.id }); }
      setDisp(r);
      return;
    }
    const ht = S.huntT();
    let target = CFG.cruise;
    if (inp.brake) target = CFG.brake;
    if (ht < CFG.liftoff && !r.late) target *= U.ease(ht / CFG.liftoff);
    r.speed = U.approach(r.speed, target, (target > r.speed ? CFG.accel : CFG.decel) * dt);
    r.steerS = U.approach(r.steerS, U.clamp(inp.steer, -1, 1), 6 * dt);
    r.yaw = U.wrap(r.yaw + CFG.turn * r.steerS * (inp.brake ? CFG.brakeTurn : 1) * dt);
    let climb = U.clamp(inp.climb, -1, 1);
    const ground0 = T.terrain(r.x, r.z);
    if (ht < CFG.liftoff + 0.4 && r.y < ground0 + 5) climb = Math.max(climb, 0.8);
    r.vy = U.approach(r.vy, climb * CFG.climb, 30 * dt);
    let nx = r.x + U.fwdX(r.yaw) * r.speed * dt, nz = r.z + U.fwdZ(r.yaw) * r.speed * dt, ny = r.y + r.vy * dt;
    const ground = T.terrain(nx, nz);
    if (ground + CFG.clearance > ny) {
      if (ground - ground0 > 1.8 && ground + CFG.clearance - ny > 1.5) {
        // Flew into a wall or a hillside: bounce off it (and it stings).
        nx = r.x; nz = r.z; r.speed *= 0.35;
        if (r.bonkT <= 0) { r.bonkT = 0.5; damage(S, r, CFG.bonkDmg, -1); S.events.push({ k: "bonk", p: r.id }); }
      }
      ny = Math.max(ny, T.terrain(nx, nz) + CFG.clearance);
      if (r.vy < 0) r.vy = 0;
    }
    if (ny > T.ceiling) { ny = T.ceiling; if (r.vy > 0) r.vy = 0; }
    const nb = T.nearest(nx, nz, r.near);
    r.near = nb.i; r.s = nb.s;
    if (nb.d > T.boundary) {
      const lx = T.pts[nb.i * 3], lz = T.pts[nb.i * 3 + 2], k = T.boundary / nb.d;
      nx = lx + (nx - lx) * k; nz = lz + (nz - lz) * k;
    }
    r.x = nx; r.y = ny; r.z = nz;
    r.roll = r.steerS * 0.6;
    r.pitch = -0.28 * (r.speed / CFG.cruise) + (r.vy / CFG.climb) * 0.3;
    if (r.bonkT > 0) r.bonkT -= dt;
    // Wrong way: flying against the line for a while.
    const dot = U.fwdX(r.yaw) * T.tan[r.near * 3] + U.fwdZ(r.yaw) * T.tan[r.near * 3 + 2];
    r.wrongT = dot < -0.4 ? r.wrongT + dt : 0;
    setDisp(r);
  }
  function setDisp(r) {
    const d = r.disp;
    d.x = r.x; d.y = r.y; d.z = r.z; d.yaw = r.yaw; d.pitch = r.pitch; d.roll = r.roll; d.speed = r.speed;
  }
  function respawnAt(S, r, s, shield) {
    const p = S.T.at(s);
    const nb = S.T.nearest(p.x, p.z);
    r.x = p.x; r.z = p.z; r.y = Math.max(p.y + 2, S.T.terrain(p.x, p.z) + 3);
    r.yaw = U.yawTo(p.tx, p.tz); r.pitch = 0; r.roll = 0; r.vy = 0; r.speed = 14; r.steerS = 0;
    r.near = nb.i; r.s = nb.s; r.hp = CFG.hp; r.downT = 0; r.invulnT = shield ? CFG.invulnT : 0; r.late = true;
    setDisp(r);
  }

  function damage(S, r, n, by) {
    if (r.downT > 0 || r.invulnT > 0 || S.phase() !== "hunt") return;
    r.hp = Math.max(0, r.hp - n);
    r.hurtT = 0.5;
    if (r.hp <= 0) {
      r.downT = CFG.downT; r.deaths++; r.vy = 2;
      S.events.push({ k: "down", p: r.id, by: by });
    }
  }

  // Aim: where the nose (plus the camera tilt) points.
  function aimDir(r) {
    const p = r.pitch + CFG.camTilt, c = Math.cos(p);
    return { x: U.fwdX(r.yaw) * c, y: Math.sin(p), z: U.fwdZ(r.yaw) * c };
  }
  DR.aimDir = aimDir;

  // ------------------------------------------------------------------ targets
  function targetPos(S, tg, s) {
    const T = S.T, P = tg.spec, p = T.at(s);
    const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
    const wide = T.course === "city" ? 9 : 14;
    const evade = tg.evadeT > 0 ? 1.7 : 1;
    const lat = U.clamp(P.lat * evade * Math.sin(tg.age * P.latW * evade + P.ph), -wide, wide);
    let y = p.y + P.alt + P.altA * Math.sin(tg.age * P.altW + P.ph2) * evade;
    const x = p.x + sx * lat, z = p.z + sz * lat;
    y = U.clamp(y, S.T.terrain(x, z) + 3, S.T.ceiling - 4);
    return { x: x, y: y, z: z, yaw: U.yawTo(p.tx, p.tz) };
  }

  function spawn(S, s) {
    if (S.next >= S.pack.length) return;
    const P = S.pack[S.next++];
    const tg = { id: S.nextId++, spec: P, s: s + P.gap, hp: P.hp, age: 0, evadeT: 0, behindT: 0, flash: 0,
      fireT: 1.2 + P.fireI * S.rand(), x: 0, y: 0, z: 0, yaw: 0, px: 0, py: 0, pz: 0, bank: 0 };
    const q = targetPos(S, tg, tg.s);
    tg.x = tg.px = q.x; tg.y = tg.py = q.y; tg.z = tg.pz = q.z; tg.yaw = q.yaw;
    S.targets.push(tg);
  }

  function stepTargets(S, me, dt) {
    const T = S.T, hunt = S.phase() === "hunt";
    // Keep the pack topped up, spread out ahead of you.
    while (S.targets.length < CFG.alive && S.next < S.pack.length) {
      let far = me.s + CFG.spawnAhead;
      S.targets.forEach(function (t) { const a = T.ahead(me.s, t.s); if (a > 0 && a + 30 > far - me.s) far = me.s + a + 30; });
      spawn(S, far);
    }
    if (!hunt) return;
    const alive = me.downT <= 0;
    S.targets = S.targets.filter(function (tg) {
      const P = tg.spec;
      tg.age += dt;
      tg.flash = Math.max(0, tg.flash - dt);
      const d = Math.hypot(tg.x - me.x, tg.y - me.y, tg.z - me.z);
      if (alive && d < CFG.evadeR) tg.evadeT = 1.4;
      tg.evadeT = Math.max(0, tg.evadeT - dt);
      // How far ahead of you along the line: too far and it waits, overtaken and it gives up.
      const lead = T.ahead(me.s, tg.s);
      let spd = P.spd * (tg.evadeT > 0 ? 1.3 : 1);
      if (lead > 200) spd *= 0.5; else if (lead > 140) spd *= 0.8;
      tg.s += spd * dt;
      tg.behindT = lead < -CFG.escapeBehind ? tg.behindT + dt : 0;
      if (tg.behindT > CFG.escapeAfter) { S.escaped++; S.events.push({ k: "esc", id: tg.id }); return false; }
      tg.px = tg.x; tg.py = tg.y; tg.pz = tg.z;
      const q = targetPos(S, tg, tg.s);
      tg.bank = U.clamp((U.wrap(q.yaw - tg.yaw) / Math.max(dt, 1e-3)) * 0.3, -0.7, 0.7);
      tg.x = q.x; tg.y = q.y; tg.z = q.z; tg.yaw = q.yaw;
      // Fire back at you: aimed a little ahead of where you're going, with some spread.
      tg.fireT -= dt;
      if (tg.fireT <= 0) {
        tg.fireT = P.fireI * (0.8 + S.rand() * 0.4);
        if (alive && d < CFG.fireRange && d > 6) {
          const lt = d / CFG.boltSpeed * 0.75;
          const ax = me.x + U.fwdX(me.yaw) * me.speed * lt + (S.rand() - 0.5) * 4;
          const ay = me.y + me.vy * lt + (S.rand() - 0.5) * 2.5;
          const az = me.z + U.fwdZ(me.yaw) * me.speed * lt + (S.rand() - 0.5) * 4;
          const dx = ax - tg.x, dy = ay - tg.y, dz = az - tg.z, l = Math.hypot(dx, dy, dz) || 1;
          S.bolts.push({ id: S.nextId++, x: tg.x, y: tg.y, z: tg.z, px: tg.x, py: tg.y, pz: tg.z,
            vx: dx / l * CFG.boltSpeed, vy: dy / l * CFG.boltSpeed, vz: dz / l * CFG.boltSpeed,
            life: CFG.boltLife, dmg: P.ace ? CFG.aceDmg : CFG.boltDmg });
          S.events.push({ k: "efire", id: tg.id, x: tg.x, y: tg.y, z: tg.z });
        }
      }
      return true;
    });
  }

  // Closest approach of segment a->b to point p, squared.
  function segDist2(ax, ay, az, bx, by, bz, px, py, pz) {
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    const l2 = vx * vx + vy * vy + vz * vz || 1e-9;
    const u = U.clamp(((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / l2, 0, 1);
    const dx = ax + vx * u - px, dy = ay + vy * u - py, dz = az + vz * u - pz;
    return dx * dx + dy * dy + dz * dz;
  }

  // ------------------------------------------------------------------ your guns
  function shoot(S, me, dt) {
    me.fireCd = Math.max(0, me.fireCd - dt);
    if (!S.input.fire || me.fireCd > 0 || me.downT > 0 || S.phase() !== "hunt") return;
    me.fireCd = CFG.fireEvery;
    const a = aimDir(me);
    // Aim assist: a target close to the crosshair pulls the shot onto where it'll be.
    let best = null, bestAng = CFG.assist;
    S.targets.forEach(function (tg) {
      const dx = tg.x - me.x, dy = tg.y - me.y, dz = tg.z - me.z, d = Math.hypot(dx, dy, dz);
      if (d > CFG.assistRange || d < 1) return;
      const ang = Math.acos(U.clamp((dx * a.x + dy * a.y + dz * a.z) / d, -1, 1));
      if (ang < bestAng) { bestAng = ang; best = tg; }
    });
    let dx = a.x, dy = a.y, dz = a.z;
    if (best) {
      const d = Math.hypot(best.x - me.x, best.y - me.y, best.z - me.z), lt = d / CFG.shotSpeed;
      const vx = (best.x - best.px) / Math.max(dt, 1e-3), vy = (best.y - best.py) / Math.max(dt, 1e-3), vz = (best.z - best.pz) / Math.max(dt, 1e-3);
      dx = best.x + vx * lt - me.x; dy = best.y + vy * lt - me.y; dz = best.z + vz * lt - me.z;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    }
    const side = (me.shotsFired % 2 ? 1 : -1) * 0.35;
    const ox = me.x + U.fwdZ(me.yaw) * -side, oz = me.z - U.fwdX(me.yaw) * -side;
    S.shots.push({ id: S.nextId++, x: ox, y: me.y - 0.1, z: oz, px: ox, py: me.y - 0.1, pz: oz,
      vx: dx * CFG.shotSpeed + U.fwdX(me.yaw) * me.speed, vy: dy * CFG.shotSpeed, vz: dz * CFG.shotSpeed + U.fwdZ(me.yaw) * me.speed,
      life: CFG.shotLife });
    me.shotsFired++;
    S.events.push({ k: "fire", p: me.id });
  }

  function stepShots(S, me, dt) {
    const T = S.T;
    S.shots = S.shots.filter(function (sh) {
      sh.life -= dt;
      sh.px = sh.x; sh.py = sh.y; sh.pz = sh.z;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.z += sh.vz * dt;
      if (sh.life <= 0) return false;
      if (sh.y < T.terrain(sh.x, sh.z)) { S.events.push({ k: "spark", x: sh.x, y: sh.y, z: sh.z }); return false; }
      for (let i = 0; i < S.targets.length; i++) {
        const tg = S.targets[i], R = tg.spec.ace ? CFG.aceR : CFG.tR;
        if (segDist2(sh.px, sh.py, sh.pz, sh.x, sh.y, sh.z, tg.x, tg.y, tg.z) > R * R) continue;
        me.shotsHit++;
        tg.hp--; tg.flash = 0.12; tg.evadeT = 1.4;
        if (tg.hp <= 0) {
          S.targets.splice(i, 1);
          me.score += tg.spec.pts; me.lastKillT = S.huntT(); S.kills++;
          S.events.push({ k: "kill", p: me.id, id: tg.id, pts: tg.spec.pts, ace: tg.spec.ace, x: tg.x, y: tg.y, z: tg.z });
        } else S.events.push({ k: "thit", id: tg.id, x: sh.x, y: sh.y, z: sh.z });
        return false;
      }
      return true;
    });
    S.bolts = S.bolts.filter(function (b) {
      b.life -= dt;
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.life <= 0 || b.y < T.terrain(b.x, b.z)) return false;
      if (me.downT <= 0 && segDist2(b.px, b.py, b.pz, b.x, b.y, b.z, me.x, me.y, me.z) < CFG.boltR * CFG.boltR) {
        if (me.invulnT > 0) return false;
        S.events.push({ k: "ouch", p: me.id, dmg: b.dmg });
        damage(S, me, b.dmg, 0);
        return false;
      }
      return true;
    });
  }

  // ------------------------------------------------------------------ autopilot
  // Flies a drone at the nearest target ahead and shoots when lined up. Used by
  // ?autopilot=1 and the headless tests.
  function botInput(S, r) {
    const T = S.T;
    let tg = null, bd = Infinity;
    S.targets.forEach(function (t) {
      const a = T.ahead(r.s, t.s);
      const d = Math.hypot(t.x - r.x, t.y - r.y, t.z - r.z) + (a < -10 ? 400 : 0);
      if (d < bd) { bd = d; tg = t; }
    });
    let ax, ay, az;
    if (tg) { ax = tg.x; ay = tg.y; az = tg.z; }
    else { const p = T.at(r.s + 30); ax = p.x; ay = p.y + 3; az = p.z; }
    // Too far off the line (a corner in the city): head for the line a bit ahead instead.
    const nb = T.nearest(r.x, r.z, r.near);
    if (nb.d > 10) { const p = T.at(r.s + 22), k = U.clamp((nb.d - 10) / 10, 0, 0.85); ax = U.lerp(ax, p.x, k); az = U.lerp(az, p.z, k); }
    const diff = U.wrap(U.yawTo(ax - r.x, az - r.z) - r.yaw);
    const a = aimDir(r);
    let fire = false;
    if (tg) {
      const dx = tg.x - r.x, dy = tg.y - r.y, dz = tg.z - r.z, d = Math.hypot(dx, dy, dz);
      fire = d < 160 && (dx * a.x + dy * a.y + dz * a.z) / d > Math.cos(0.1);
    }
    return {
      steer: U.clamp(diff * 2.4, -1, 1),
      climb: U.clamp((ay - r.y) * 0.35 - r.vy * 0.06, -1, 1),
      brake: Math.abs(diff) > 0.9 || (tg && bd < 14),
      fire: fire
    };
  }

  // ------------------------------------------------------------------ one step
  function step(S, dt) {
    S.t += dt;
    const me = S.me();
    if (!me || S.over) return;
    fly(S, me, S.input, dt);
    if (me.invulnT > 0) me.invulnT = Math.max(0, me.invulnT - dt);
    if (me.hurtT > 0) me.hurtT = Math.max(0, me.hurtT - dt);
    stepTargets(S, me, dt);
    shoot(S, me, dt);
    stepShots(S, me, dt);
    if (S.phase() === "hunt" && S.huntT() >= CFG.round) finish(S);
  }

  function finish(S) {
    S.over = true;
    S.shots.length = 0; S.bolts.length = 0;
    S.events.push({ k: "over" });
    rank(S);
  }

  // Most points first; a tie goes to whoever got there first.
  function rank(S) {
    S.results = S.racers.slice().sort(function (a, b) {
      if (a.left !== b.left) return a.left ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.lastKillT - b.lastKillT;
    }).map(function (r) { return { id: r.id, score: r.score }; });
    return S.results;
  }

  DR.Sim = { create: create, roster: roster, step: step, botInput: botInput, finish: finish, rank: rank, pack: pack };
})(globalThis.DR);
