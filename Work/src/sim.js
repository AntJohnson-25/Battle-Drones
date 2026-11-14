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
    // round: the intro is the walk-out and hand launch (view.js times its shots to these)
    intro: 7.5, count: 3, round: 180, liftoff: 1.2, maxPilots: 8, hover: 3.2,
    // you
    hp: 100, downT: 3, invulnT: 2.5,
    // crashes: a hit costs crashBase + crashPerMs x speed; a hard landing costs per m/s of descent
    crashBase: 8, crashPerMs: 0.55, landHard: 6, landPerMs: 1.4, droneR: 0.7,
    // tricks: barrel roll (Q / E) sidesteps, flip (X) pops up; both dodge fire while they last
    rollT: 0.5, rollSide: 20, flipT: 0.65, flipUp: 19, trickCd: 1.3,
    // obstacle sensor: looks this far ahead
    sensor: 16,
    fireEvery: 1 / 7, shotSpeed: 170, shotLife: 1.05, assist: 0.11, assistRange: 175,
    // them
    pool: 60, alive: 6, spawnAhead: 70, tHp: 3, aceHp: 7, tR: 2.1, aceR: 2.7,
    boltSpeed: 64, boltLife: 2.4, boltDmg: 11, aceDmg: 16, fireRange: 85, boltR: 1.5,
    evadeR: 34, escapeAfter: 6, escapeBehind: 130,
    // targets barrel-roll out of the way of a shot that's about to land
    tRollT: 0.45, tRollSide: 7.5, tRollCd: 2.8, tRollAceCd: 1.9, tRollChance: 0.6, tRollSee: 48,
    // the boss: arrives this far into the round, comes back this long after going down
    bossAt: 40, bossBack: 40, bossHp: 80, bossPts: 15, bossR: 4.6, bossLead: 62, bossDmg: 13, bossFire: 2.5,
    miniEvery: 6.5, miniBatch: 3, miniMax: 6, miniR: 1.6, miniDmg: 5
  };
  // Who runs each course. Every one of them has red eyes.
  const BOSS = DR.BOSS = {
    city: { id: "ceo", name: "BIG TECH CEO" },
    mountain: { id: "santa", name: "EVIL SANTA" },
    dunes: { id: "pharaoh", name: "MUMMY PHARAOH" }
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
        spd: (ace ? 28 : 23.5) + r() * 5, lat: 3 + r() * 6, latW: 0.45 + r() * 0.6, ph: r() * 6.28,
        alt: 1 + r() * 6, altA: 2 + r() * 3.5, altW: 0.35 + r() * 0.5, ph2: r() * 6.28,
        gap: r() * 45, fireI: (ace ? 1.15 : 1.6) + r() * 1.3
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
      boss: null, bossT: CFG.bossAt, bossKills: 0, bossSeen: 0, minis: 0,
      input: { steer: 0, climb: 0, brake: false, fire: false, trick: null },
      rand: U.rng((seed * 7919 + 17) >>> 0)
    };
    roster.slice(0, CFG.maxPilots).forEach(function (r, i) {
      const g = T.grid[i % T.grid.length];
      const hy = g.y + CFG.hover;   // released from the hand, it hovers here until GO
      S.racers.push({
        id: i, name: r.name, hl: r.hl || null, bot: false, left: false, colour: COLOURS[i % COLOURS.length],
        x: g.x, y: hy, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0, vy: 0, steerS: 0,
        near: -1, s: T.startS - 14, hp: CFG.hp, downT: 0, invulnT: 0, bonkT: 0, hurtT: 0, wrongT: 0,
        trick: null, trickT: 0, trickCd: 0, sideV: 0, spinR: 0, spinP: 0, warn: Infinity, warnKind: "", lastCrash: "",
        fireCd: 0, score: opts.score && i === opts.me ? opts.score : 0, lastKillT: 0, shotsFired: 0, shotsHit: 0, deaths: 0,
        disp: { x: g.x, y: hy, z: g.z, yaw: g.yaw, pitch: 0, roll: 0, speed: 0 }
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
    // Tricks: a barrel roll throws you sideways, a flip pops you up; both spin the drone.
    r.trickCd = Math.max(0, r.trickCd - dt);
    if (inp.trick && !r.trick && r.trickCd <= 0) startTrick(S, r, inp.trick);
    inp.trick = null;
    if (r.trick) {
      r.trickT += dt;
      const flip = r.trick === "flip", u = Math.min(1, r.trickT / (flip ? CFG.flipT : CFG.rollT));
      if (flip) r.spinP = Math.PI * 2 * U.ease(u);
      else r.spinR = (r.trick === "rollL" ? 1 : -1) * Math.PI * 2 * U.ease(u);
      if (u >= 1) { r.trick = null; r.spinR = 0; r.spinP = 0; }
    }
    r.sideV = U.approach(r.sideV, 0, 45 * dt);
    let climb = U.clamp(inp.climb, -1, 1);
    const ground0 = T.terrain(r.x, r.z);
    r.vy = U.approach(r.vy, climb * CFG.climb, (r.trick === "flip" ? 24 : 30) * dt);
    const rx = -U.fwdZ(r.yaw), rz = U.fwdX(r.yaw);   // to the drone's right
    let nx = r.x + U.fwdX(r.yaw) * r.speed * dt + rx * r.sideV * dt;
    let nz = r.z + U.fwdZ(r.yaw) * r.speed * dt + rz * r.sideV * dt;
    let ny = r.y + r.vy * dt;
    const ground = T.terrain(nx, nz);
    if (ground + CFG.clearance > ny) {
      if (ground - ground0 > 1.8 && ground + CFG.clearance - ny > 1.5) {
        // Flew into a wall or a hillside: bounce off it, and it hurts more the faster you were going.
        crash(S, r, T.wall, r.speed + Math.abs(r.sideV), false);
        nx = r.x; nz = r.z; r.speed *= 0.35; r.sideV = 0;
      } else if (r.vy < -CFG.landHard && ht > 0.5) crash(S, r, "ground", -r.vy, true);
      ny = Math.max(ny, T.terrain(nx, nz) + CFG.clearance);
      if (r.vy < 0) r.vy = 0;
    }
    // Lampposts, billboards, rooftop kit, trees, rocks.
    const ob = T.hit(nx, ny, nz, CFG.droneR);
    if (ob) {
      crash(S, r, ob.kind, r.speed + Math.abs(r.sideV) + Math.abs(r.vy) * 0.5, false);
      const dx = r.x - ob.x, dz = r.z - ob.z, l = Math.hypot(dx, dz) || 1;
      nx = r.x + dx / l * 0.5; nz = r.z + dz / l * 0.5; ny = r.y;
      r.speed *= 0.3; r.sideV = 0; r.vy = Math.min(r.vy, 0);
    }
    if (ny > T.ceiling) { ny = T.ceiling; if (r.vy > 0) r.vy = 0; }
    // Obstacle sensor: probe ahead along the flight path; the HUD warns and beeps.
    r.warn = Infinity; r.warnKind = "";
    const sp = Math.max(r.speed, 6);
    for (let d = 3; d <= CFG.sensor; d += 3.25) {
      const px = nx + U.fwdX(r.yaw) * d + rx * r.sideV * d / sp, pz = nz + U.fwdZ(r.yaw) * d + rz * r.sideV * d / sp;
      const py = ny + r.vy * d / sp;
      const o = T.hit(px, py, pz, 1.0);
      if (o) { r.warn = d; r.warnKind = o.kind; break; }
      const tg = T.terrain(px, pz);
      if (tg > py - 0.6) { r.warn = d; r.warnKind = tg - T.ground(px, pz) > 2 ? "building" : T.course === "city" ? "ground" : T.wall; break; }
    }
    const nb = T.nearest(nx, nz, r.near);
    r.near = nb.i; r.s = nb.s;
    if (nb.d > T.boundary) {
      const lx = T.pts[nb.i * 3], lz = T.pts[nb.i * 3 + 2], k = T.boundary / nb.d;
      nx = lx + (nx - lx) * k; nz = lz + (nz - lz) * k;
    }
    r.x = nx; r.y = ny; r.z = nz;
    r.roll = r.steerS * 0.6 + r.spinR;
    r.pitch = -0.28 * (r.speed / CFG.cruise) + U.clamp(r.vy / CFG.climb, -1, 1) * 0.3 + r.spinP;
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

  function startTrick(S, r, k) {
    if (S.phase() !== "hunt" || r.downT > 0 || ["rollL", "rollR", "flip"].indexOf(k) < 0) return;
    r.trick = k; r.trickT = 0; r.trickCd = CFG.trickCd;
    if (k === "flip") r.vy = CFG.flipUp; else r.sideV = (k === "rollL" ? -1 : 1) * CFG.rollSide;
    S.events.push({ k: "trick", p: r.id, t: k });
  }

  // Hit something: damage by impact speed (or, for a landing, by how fast you came down).
  function crash(S, r, kind, impact, landing) {
    if (r.bonkT > 0 || S.phase() !== "hunt") return;
    r.bonkT = 0.6;
    const dmg = Math.round(landing ? 4 + (impact - CFG.landHard) * CFG.landPerMs : CFG.crashBase + CFG.crashPerMs * impact);
    r.lastCrash = kind;
    S.events.push({ k: "crash", p: r.id, kind: kind, dmg: dmg });
    damage(S, r, dmg, -1);
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
    const lat = U.clamp(P.lat * evade * Math.sin(tg.age * P.latW * evade + P.ph) + tg.off, -wide, wide);
    let y = p.y + P.alt + P.altA * Math.sin(tg.age * P.altW + P.ph2) * evade;
    const x = p.x + sx * lat, z = p.z + sz * lat;
    y = U.clamp(y, S.T.terrain(x, z) + 3, S.T.ceiling - 4);
    return { x: x, y: y, z: z, yaw: U.yawTo(p.tx, p.tz) };
  }

  function add(S, P, s, fireT) {
    const tg = { id: S.nextId++, spec: P, s: s, hp: P.hp, age: 0, evadeT: 0, behindT: 0, flash: 0,
      fireT: fireT, x: 0, y: 0, z: 0, yaw: 0, px: 0, py: 0, pz: 0, bank: 0,
      off: 0, rollT: 0, rollDir: 0, rollCd: 0, spin: 0, miniT: 3, burst: 0 };
    const q = targetPos(S, tg, tg.s);
    tg.x = tg.px = q.x; tg.y = tg.py = q.y; tg.z = tg.pz = q.z; tg.yaw = q.yaw;
    S.targets.push(tg);
    return tg;
  }
  function spawn(S, s) {
    if (S.next >= S.pack.length) return;
    const P = S.pack[S.next++];
    add(S, P, s + P.gap, 0.5 + P.fireI * S.rand());
  }
  function targetR(P) { return P.boss ? CFG.bossR : P.mini ? CFG.miniR : P.ace ? CFG.aceR : CFG.tR; }
  DR.targetR = targetR;

  // The boss turns up ahead of you with a pack of pests in tow.
  function spawnBoss(S, me) {
    const B = BOSS[S.T.course] || BOSS.city;
    const P = { boss: true, who: B.id, name: B.name, hp: CFG.bossHp, pts: CFG.bossPts, spd: CFG.cruise,
      lat: 6, latW: 0.55, ph: S.rand() * 6.28, alt: 7, altA: 3, altW: 0.5, ph2: S.rand() * 6.28, gap: 0, fireI: CFG.bossFire };
    S.boss = add(S, P, me.s + 110, 2);
    S.bossSeen++;
    S.events.push({ k: "boss", name: B.name, who: B.id });
  }
  function spawnMini(S, boss, n) {
    const r = S.rand;
    const P = { mini: true, who: boss.spec.who, hp: 1, pts: 1, spd: CFG.cruise, lead: 26 + n * 9 + r() * 6,
      lat: 5 + r() * 5, latW: 1.1 + r() * 0.9, ph: r() * 6.28, alt: 2 + r() * 5, altA: 2.2, altW: 0.9 + r() * 0.8, ph2: r() * 6.28,
      gap: 0, fireI: 2.1 + r() * 1.2 };
    const m = add(S, P, boss.s - 4, 1 + r());
    S.minis++;
    S.events.push({ k: "mini", id: m.id, x: boss.x, y: boss.y, z: boss.z });
  }

  // One bolt from a target at where you'll be, with some spread.
  function fireBolt(S, tg, me, d, dmg, spread) {
    const lt = d / CFG.boltSpeed * 0.75;
    const ax = me.x + U.fwdX(me.yaw) * me.speed * lt + (S.rand() - 0.5) * 4 * spread;
    const ay = me.y + me.vy * lt + (S.rand() - 0.5) * 2.5 * spread;
    const az = me.z + U.fwdZ(me.yaw) * me.speed * lt + (S.rand() - 0.5) * 4 * spread;
    const dx = ax - tg.x, dy = ay - tg.y, dz = az - tg.z, l = Math.hypot(dx, dy, dz) || 1;
    S.bolts.push({ id: S.nextId++, x: tg.x, y: tg.y, z: tg.z, px: tg.x, py: tg.y, pz: tg.z,
      vx: dx / l * CFG.boltSpeed, vy: dy / l * CFG.boltSpeed, vz: dz / l * CFG.boltSpeed,
      life: CFG.boltLife, dmg: dmg });
    S.events.push({ k: "efire", id: tg.id, x: tg.x, y: tg.y, z: tg.z });
  }

  // Is one of your shots about to land on this target? (Then it rolls away.)
  function threatened(S, tg) {
    for (let i = 0; i < S.shots.length; i++) {
      const sh = S.shots[i];
      const dx = tg.x - sh.x, dy = tg.y - sh.y, dz = tg.z - sh.z, d = Math.hypot(dx, dy, dz);
      if (d > CFG.tRollSee || d < 1) continue;
      const v = Math.hypot(sh.vx, sh.vy, sh.vz) || 1;
      if ((dx * sh.vx + dy * sh.vy + dz * sh.vz) / (d * v) > 0.985) return sh;
    }
    return null;
  }

  function stepTargets(S, me, dt) {
    const T = S.T, hunt = S.phase() === "hunt";
    // Keep the pack topped up, spread out ahead of you (the boss and his pests don't count).
    let pack = 0;
    S.targets.forEach(function (t) { if (!t.spec.boss && !t.spec.mini) pack++; });
    while (pack < CFG.alive && S.next < S.pack.length) {
      let far = me.s + CFG.spawnAhead;
      S.targets.forEach(function (t) { const a = T.ahead(me.s, t.s); if (a > 0 && a + 26 > far - me.s) far = me.s + a + 26; });
      spawn(S, far);
      pack++;
    }
    if (!hunt) return;
    const alive = me.downT <= 0;
    if (!S.boss && S.huntT() >= S.bossT && S.left() > 12) spawnBoss(S, me);
    const born = [];
    S.targets = S.targets.filter(function (tg) {
      const P = tg.spec;
      tg.age += dt;
      tg.flash = Math.max(0, tg.flash - dt);
      const d = Math.hypot(tg.x - me.x, tg.y - me.y, tg.z - me.z);
      if (alive && d < CFG.evadeR) tg.evadeT = 1.4;
      tg.evadeT = Math.max(0, tg.evadeT - dt);
      // How far ahead of you along the line: too far and it waits, overtaken and it gives up.
      const lead = T.ahead(me.s, tg.s);
      let spd;
      if (P.boss || P.mini) {
        // The boss and his pests hold station ahead of you instead of running.
        spd = U.clamp(me.speed + ((P.boss ? CFG.bossLead : P.lead) - lead) * 0.6, 8, 46);
      } else {
        spd = P.spd * (tg.evadeT > 0 ? 1.2 : 1);
        if (lead > 200) spd *= 0.5; else if (lead > 140) spd *= 0.8;
      }
      tg.s += spd * dt;
      tg.behindT = lead < -CFG.escapeBehind ? tg.behindT + dt : 0;
      if (!P.boss && tg.behindT > CFG.escapeAfter) { if (!P.mini) S.escaped++; S.events.push({ k: "esc", id: tg.id }); return false; }
      // Barrel roll: thrown sideways out of the line of fire, then drifting back.
      tg.rollCd = Math.max(0, tg.rollCd - dt);
      if (tg.rollT > 0) {
        tg.rollT = Math.max(0, tg.rollT - dt);
        const u = 1 - tg.rollT / CFG.tRollT;
        tg.spin = tg.rollDir * Math.PI * 2 * U.ease(u);
        tg.off = U.approach(tg.off, tg.rollDir * CFG.tRollSide, CFG.tRollSide / CFG.tRollT * 1.25 * dt);
        if (tg.rollT <= 0) tg.spin = 0;
      } else {
        tg.off = U.approach(tg.off, 0, 2.2 * dt);
        if (!P.boss && !P.mini && tg.rollCd <= 0) {
          const sh = threatened(S, tg);
          if (sh) {
            if (S.rand() < CFG.tRollChance) {
              // Away from the side the shot is coming in on.
              const hl = Math.hypot(sh.vx, sh.vz) || 1, side = (tg.x - sh.x) * (-sh.vz / hl) + (tg.z - sh.z) * (sh.vx / hl);
              const p = T.at(tg.s), tl = Math.hypot(p.tx, p.tz) || 1;
              const lineSide = (-p.tz / tl) * (-sh.vz / hl) + (p.tx / tl) * (sh.vx / hl);   // does +lateral mean the shot's right?
              tg.rollDir = (side >= 0 ? 1 : -1) * (lineSide >= 0 ? 1 : -1);
              tg.rollT = CFG.tRollT; tg.rollCd = P.ace ? CFG.tRollAceCd : CFG.tRollCd;
              S.events.push({ k: "troll", id: tg.id });
            } else tg.rollCd = 0.7;
          }
        }
      }
      tg.px = tg.x; tg.py = tg.y; tg.pz = tg.z;
      const q = targetPos(S, tg, tg.s);
      tg.bank = U.clamp((U.wrap(q.yaw - tg.yaw) / Math.max(dt, 1e-3)) * 0.3, -0.7, 0.7);
      tg.x = q.x; tg.y = q.y; tg.z = q.z; tg.yaw = q.yaw;
      // Fire back at you: aimed a little ahead of where you're going, with some spread.
      tg.fireT -= dt;
      if (tg.fireT <= 0) {
        const can = alive && d < CFG.fireRange + (P.boss ? 25 : 0) && d > 6;
        if (P.boss) {
          // A burst of three.
          tg.burst = tg.burst > 0 ? tg.burst - 1 : 2;
          tg.fireT = tg.burst > 0 ? 0.16 : P.fireI * (0.8 + S.rand() * 0.4);
          if (can) fireBolt(S, tg, me, d, CFG.bossDmg, 1.5);
        } else {
          tg.fireT = P.fireI * (0.8 + S.rand() * 0.4);
          if (can) fireBolt(S, tg, me, d, P.mini ? CFG.miniDmg : P.ace ? CFG.aceDmg : CFG.boltDmg, P.mini ? 1.6 : 1);
        }
      }
      // The boss lets his pests loose, a few at a time.
      if (P.boss) {
        tg.miniT -= dt;
        if (tg.miniT <= 0) { tg.miniT = CFG.miniEvery; born.push(tg); }
      }
      return true;
    });
    born.forEach(function (boss) {
      let have = 0;
      S.targets.forEach(function (t) { if (t.spec.mini) have++; });
      for (let n = 0; n < CFG.miniBatch && have < CFG.miniMax; n++, have++) spawnMini(S, boss, have);
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
      // A big target (the boss) is easier to line up on.
      const ang = Math.acos(U.clamp((dx * a.x + dy * a.y + dz * a.z) / d, -1, 1)) - (tg.spec.boss ? Math.min(0.06, 2.5 / d) : 0);
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
      if (sh.y < T.terrain(sh.x, sh.z) || T.hit(sh.x, sh.y, sh.z, 0.1)) { S.events.push({ k: "spark", x: sh.x, y: sh.y, z: sh.z }); return false; }
      for (let i = 0; i < S.targets.length; i++) {
        const tg = S.targets[i], R = targetR(tg.spec);
        if (segDist2(sh.px, sh.py, sh.pz, sh.x, sh.y, sh.z, tg.x, tg.y, tg.z) > R * R) continue;
        me.shotsHit++;
        tg.hp--; tg.flash = 0.12; tg.evadeT = 1.4;
        if (tg.hp <= 0) {
          S.targets.splice(i, 1);
          me.score += tg.spec.pts; me.lastKillT = S.huntT(); S.kills++;
          if (tg.spec.boss) { S.boss = null; S.bossKills++; S.bossT = S.huntT() + CFG.bossBack; }
          S.events.push({ k: "kill", p: me.id, id: tg.id, pts: tg.spec.pts, ace: tg.spec.ace, boss: !!tg.spec.boss, mini: !!tg.spec.mini, x: tg.x, y: tg.y, z: tg.z });
        } else S.events.push({ k: "thit", id: tg.id, x: sh.x, y: sh.y, z: sh.z });
        return false;
      }
      return true;
    });
    S.bolts = S.bolts.filter(function (b) {
      b.life -= dt;
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.life <= 0 || b.y < T.terrain(b.x, b.z) || T.hit(b.x, b.y, b.z, 0.1)) return false;
      if (me.downT <= 0 && segDist2(b.px, b.py, b.pz, b.x, b.y, b.z, me.x, me.y, me.z) < CFG.boltR * CFG.boltR) {
        // Mid-trick, fire slips past you.
        if (me.trick) { if (!b.dodged) { b.dodged = true; S.events.push({ k: "dodge", p: me.id }); } return true; }
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
    // Evade: a roll away from fire about to land, a flip over something close ahead.
    let trick = null;
    if (!r.trick && r.trickCd <= 0) {
      S.bolts.forEach(function (b) {
        const dx = r.x - b.x, dy = r.y - b.y, dz = r.z - b.z, d = Math.hypot(dx, dy, dz);
        if (!trick && d < 22 && (dx * b.vx + dy * b.vy + dz * b.vz) / (d * CFG.boltSpeed) > 0.95) trick = (b.x - r.x) * -U.fwdZ(r.yaw) + (b.z - r.z) * U.fwdX(r.yaw) > 0 ? "rollL" : "rollR";   // fire from the right: roll left
      });
      if (!trick && r.warn < 7 && r.warnKind !== "ground") trick = "flip";
    }
    return {
      steer: U.clamp(diff * 2.4, -1, 1),
      climb: U.clamp((ay - r.y) * 0.35 - r.vy * 0.06 + (r.warn < 12 ? 0.6 : 0), -1, 1),
      brake: Math.abs(diff) > 0.9 || (tg && bd < 14) || r.warn < 8,
      fire: fire,
      trick: trick
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
