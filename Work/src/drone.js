// Racing drones. A procedural low-poly quad by default; a custom model can replace
// it (DR.DRONE_MODEL below): a .glb facing -Z, about 0.6 m across, with its
// propellers as separate nodes named "prop..." (spun about their own Y axis) and
// any material named "accent..." tinted in the racer's colour.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const D = {};
  DR.DRONE_MODEL = "";          // e.g. "assets/drone.glb" once there is one
  const SCALE = 2.2;            // drones are drawn bigger than life so you can see them coming
  let custom = null;            // the loaded custom model, if any

  D.loadCustom = function () {
    if (!DR.DRONE_MODEL || !THREE.GLTFLoader) return Promise.resolve(null);
    return new THREE.GLTFLoader().loadAsync(DR.DRONE_MODEL).then(function (g) { custom = g.scene; return custom; })
      .catch(function () { custom = null; return null; });
  };

  function lam(c, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, extra || {})); }
  const shared = {};
  function mats() {
    if (shared.frame) return shared;
    shared.frame = lam(0x2b2f3a);
    shared.motor = lam(0x9aa3b5);
    shared.lens = new THREE.MeshBasicMaterial({ color: 0x0b0d12 });
    shared.glass = new THREE.MeshBasicMaterial({ color: 0x7fd8ff });
    shared.blade = lam(0x1d2230);
    return shared;
  }

  function procedural(colour) {
    const M = mats();
    const g = new THREE.Group();
    const accent = lam(colour);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.34), M.frame); g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.26), accent); lid.position.set(0, 0.06, 0.02); g.add(lid);
    // X-frame arms.
    [1, -1].forEach(function (s) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.62), M.frame);
      arm.rotation.y = s * Math.PI / 4; g.add(arm);
    });
    // FPV camera pod at the front, tilted up like a real racer's.
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.07), accent);
    pod.position.set(0, 0.02, -0.19); pod.rotation.x = 0.3; g.add(pod);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), M.lens);
    lens.rotation.x = Math.PI / 2 + 0.3; lens.position.set(0, 0.03, -0.235); g.add(lens);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), M.glass);
    glint.position.set(0.006, 0.037, -0.252); glint.rotation.x = -0.3; g.add(glint);
    // Antenna and a rear light in the racer's colour.
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), M.frame);
    ant.position.set(0, 0.1, 0.16); ant.rotation.x = -0.6; g.add(ant);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: colour }));
    tail.position.set(0, 0.01, 0.175); g.add(tail);
    // Motors and propellers: a spinning blade pair plus a blur disc that shows at speed.
    const props = [];
    const discMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (c, i) {
      const x = c[0] * 0.22, z = c[1] * 0.22;
      const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), M.motor);
      mot.position.set(x, 0.035, z); g.add(mot);
      const p = new THREE.Group();
      p.position.set(x, 0.065, z);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.03), M.blade);
      p.add(blade);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.135, 16), discMat);
      disc.rotation.x = -Math.PI / 2; p.add(disc);
      p.userData = { dir: i === 0 || i === 3 ? 1 : -1, blade: blade, disc: disc };
      g.add(p); props.push(p);
    });
    return { model: g, props: props, accent: accent };
  }

  function fromCustom(colour) {
    const g = custom.clone(true);
    const props = [];
    g.traverse(function (o) {
      if (/^prop/i.test(o.name)) { o.userData = { dir: props.length % 2 ? -1 : 1 }; props.push(o); }
      if (o.isMesh && o.material && /^accent/i.test(o.material.name || "")) { o.material = o.material.clone(); o.material.color.setHex(colour); }
    });
    return { model: g, props: props };
  }

  // One racer's drone: model, name tag, shield bubble, turbo flames, a blob shadow.
  D.make = function (r, ownDrone) {
    const root = new THREE.Group();
    const tilt = new THREE.Group();       // pitch / roll / spin-out wobble live here
    root.add(tilt);
    const built = custom ? fromCustom(r.colour) : procedural(r.colour);
    built.model.scale.setScalar(SCALE);
    tilt.add(built.model);
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({ color: 0x6ae0ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    shield.visible = false; root.add(shield);
    const flames = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    [-0.22, 0.22].forEach(function (x) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 7), flameMat);
      f.rotation.x = Math.PI / 2; f.position.set(x, 0.05, 0.85); flames.add(f);
    });
    flames.visible = false; tilt.add(flames);
    const zap = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 4, 16),
      new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    zap.rotation.x = Math.PI / 2; zap.visible = false; root.add(zap);
    let tag = null;
    if (!ownDrone) {
      tag = nameTag(r.name, r.colour);
      tag.position.y = 1.5;
      root.add(tag);
    }
    return { r: r, root: root, tilt: tilt, props: built.props, shield: shield, flames: flames, zap: zap, tag: tag, spin: 0, own: ownDrone };
  };

  function nameTag(name, colour) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const x = c.getContext("2d");
    x.font = "bold 30px system-ui, sans-serif";
    const w = Math.min(244, x.measureText(name).width + 34);
    x.fillStyle = "rgba(20,24,34,0.72)";
    roundRect(x, 128 - w / 2, 10, w, 44, 22); x.fill();
    x.fillStyle = "#" + new THREE.Color(colour).getHexString();
    x.beginPath(); x.arc(128 - w / 2 + 20, 32, 7, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#ffffff"; x.textAlign = "left"; x.textBaseline = "middle";
    x.fillText(name, 128 - w / 2 + 34, 33, w - 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, fog: false }));
    s.scale.set(4, 1, 1);
    s.renderOrder = 5;
    return s;
  }
  function roundRect(x, l, t, w, h, r) {
    x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }
  D.nameTag = nameTag;

  // Per frame: position from the pilot's drawing state, props, effects.
  D.update = function (d, S, dt, now, camPos) {
    const r = d.r, P = r.disp;
    d.root.position.set(P.x, P.y, P.z);
    d.root.rotation.set(0, P.yaw, 0);
    d.tilt.rotation.set(P.pitch, 0, P.roll, "YXZ");
    // Props: idle on the pad, full speed in the air, stopped when shot down.
    const ph = S.phase();
    const armed = (ph === "hunt" || ph === "over" || ph === "count" || d.launched) && !(r.downT > 0);
    const rate = armed ? 60 + P.speed * 2 : 0;
    d.props.forEach(function (p) {
      p.rotation.y += rate * dt * p.userData.dir;
      if (p.userData.disc) { p.userData.disc.visible = rate > 30; p.userData.blade.visible = rate <= 30; }
    });
    // Respawn shield bubble; smoke-black flicker while down.
    d.shield.visible = r.invulnT > 0;
    if (d.shield.visible) { d.shield.rotation.y += dt; d.shield.material.opacity = 0.16 + Math.sin(now * 10) * 0.06; }
    d.flames.visible = false;
    d.zap.visible = r.downT > 0;
    if (d.zap.visible) { d.zap.rotation.z = now * 9; d.zap.scale.setScalar(0.9 + Math.random() * 0.3); }
    if (d.tag) {
      // Name tags shrink away with distance but stay readable.
      const dist = camPos ? Math.hypot(P.x - camPos.x, P.y - camPos.y, P.z - camPos.z) : 20;
      const k = Math.max(1, dist / 25);
      d.tag.scale.set(4 * k, k, 1);
      d.tag.position.y = 1.3 + k * 0.4;
      d.tag.visible = dist < 220;
    }
  };

  // ------------------------------------------------------------------ target drones
  // Hostile: a dark angular body, red (or gold, for an ace) lights, a glowing eye
  // at the back facing you and a little gun pod. Bigger than yours so they read
  // at a distance.
  const tShared = {};
  D.makeTarget = function (spec) {
    if (spec.boss) return makeBoss(spec.who, spec.name);
    if (spec.mini) return makeMini(spec.who);
    const ace = spec.ace;
    if (!tShared.body) {
      tShared.body = new THREE.OctahedronGeometry(0.5, 0); tShared.body.scale(1.1, 0.45, 1.4);
      tShared.arm = new THREE.BoxGeometry(1.6, 0.06, 0.12);
      tShared.rotor = new THREE.CircleGeometry(0.32, 12); tShared.rotor.rotateX(-Math.PI / 2);
      tShared.eye = new THREE.SphereGeometry(0.17, 8, 6);
      tShared.gun = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5); tShared.gun.rotateX(Math.PI / 2);
      tShared.dark = lam(0x1d2129);
      tShared.metal = lam(0x50586a);
      tShared.hit = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    const glow = ace ? 0xffc23a : 0xff2d4a;
    const root = new THREE.Group(), tilt = new THREE.Group();
    root.add(tilt);
    const body = new THREE.Mesh(tShared.body, tShared.dark); tilt.add(body);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.7), lam(glow)); plate.position.y = 0.2; tilt.add(plate);
    [1, -1].forEach(function (s) { const a = new THREE.Mesh(tShared.arm, tShared.metal); a.rotation.y = s * 0.7; tilt.add(a); });
    const discMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const rotors = [];
    [[0.6, -0.5], [-0.6, -0.5], [0.6, 0.5], [-0.6, 0.5]].forEach(function (p) {
      const m = new THREE.Mesh(tShared.rotor, discMat); m.position.set(p[0], 0.1, p[1]); tilt.add(m); rotors.push(m);
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: glow });
    const eye = new THREE.Mesh(tShared.eye, eyeMat); eye.position.set(0, 0.02, 0.62); tilt.add(eye);
    const gun = new THREE.Mesh(tShared.gun, tShared.metal); gun.position.set(0, -0.2, 0.45); tilt.add(gun);
    // A soft halo so it can be spotted against towers and hills.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    halo.scale.set(3.2, 3.2, 1); root.add(halo);
    const sc = ace ? 2.6 : 2.0;
    tilt.scale.setScalar(sc);
    return { root: root, tilt: tilt, flash: [[body, tShared.dark]], eyeMat: eyeMat, glow: glow, rotors: rotors, halo: halo };
  };
  D.updateTarget = function (m, tg, dt, now) {
    m.root.position.set(tg.x, tg.y + Math.sin(now * 5 + tg.id) * (m.boss ? 0.3 : 0.08), tg.z);
    m.root.rotation.set(0, tg.yaw, 0);
    // A barrel roll spins it a full turn about its nose.
    m.tilt.rotation.set(m.boss ? -0.05 : -0.15, 0, tg.bank * (m.boss ? 0.5 : 1) + (tg.spin || 0), "YXZ");
    // Flash white when hit.
    const hit = tg.flash > 0;
    if (m.wasHit !== hit) { m.wasHit = hit; m.flash.forEach(function (f) { f[0].material = hit ? (tShared.hit || (tShared.hit = new THREE.MeshBasicMaterial({ color: 0xffffff }))) : f[1]; }); }
    // Eyes flare white just before it fires.
    m.eyeMat.color.setHex(tg.fireT < 0.35 ? 0xffffff : m.glow);
    m.halo.material.opacity = (m.boss ? 0.3 : 0.45) + Math.sin(now * 6 + tg.id) * 0.12;
    if (m.spinners) m.spinners.forEach(function (s, i) { s.rotation.y += dt * 30 * (i % 2 ? -1 : 1); });
    if (m.tag) m.tag.visible = true;
  };

  // ------------------------------------------------------------------ bosses and their pests
  // One villain per course, riding something that flies. They all have glowing
  // red eyes and they face backwards, at you. Built from simple shapes, about
  // 1 unit = 1 m before the 3x scale-up.
  const RED = 0xff1228;
  function mesh(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; }
  function bx(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  // Four rotors on outriggers, the thing that makes it a drone.
  function rotorRig(tilt, span, len, y, colour) {
    const metal = lam(0x50586a), discMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.CircleGeometry(0.42, 14); disc.rotateX(-Math.PI / 2);
    const blade = bx(0.8, 0.02, 0.07);
    const spinners = [];
    [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (c) {
      const arm = mesh(bx(span, 0.07, 0.1), metal, c[0] * span / 2, y, c[1] * len, tilt);
      arm.rotation.z = 0;
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), metal, c[0] * span, y + 0.08, c[1] * len, tilt);
      const g = new THREE.Group(); g.position.set(c[0] * span, y + 0.18, c[1] * len);
      g.add(new THREE.Mesh(disc, discMat)); g.add(new THREE.Mesh(blade, metal));
      tilt.add(g); spinners.push(g);
    });
    return spinners;
  }
  // Head with two glowing red eyes on its +Z face (looking back at the player).
  function redEyes(parent, y, z, gap, size, eyeMat) {
    const g = new THREE.SphereGeometry(size, 8, 6);
    mesh(g, eyeMat, -gap, y, z, parent); mesh(g, eyeMat, gap, y, z, parent);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    glow.scale.set(size * 9, size * 5, 1); glow.position.set(0, y, z + 0.05); parent.add(glow);
  }
  function bossShell(scale, name) {
    const root = new THREE.Group(), tilt = new THREE.Group();
    root.add(tilt);
    tilt.scale.setScalar(scale);
    const eyeMat = new THREE.MeshBasicMaterial({ color: RED });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
    halo.scale.set(scale * 4.4, scale * 4.4, 1); root.add(halo);
    const m = { root: root, tilt: tilt, flash: [], eyeMat: eyeMat, glow: RED, halo: halo, boss: true };
    if (name) { m.tag = nameTag(name, RED); m.tag.scale.set(13, 3.25, 1); m.tag.position.y = scale * 2.1 + 1.6; root.add(m.tag); }
    return m;
  }
  function flashable(m, obj, mat) { m.flash.push([obj, mat]); return obj; }

  function makeBoss(who, name) {
    const m = bossShell(3, name), t = m.tilt;
    if (who === "santa") santa(m, t); else if (who === "pharaoh") pharaoh(m, t); else ceo(m, t);
    return m;
  }

  // Evil Santa in his sleigh drone, sack of pests behind him.
  function santa(m, t) {
    const red = lam(0xc4161c), dark = lam(0x7a0d12), gold = lam(0xf2c14e), white = lam(0xf6f3ee), skin = lam(0xe8b89a), black = lam(0x1a1c22), sack = lam(0x6b4a2a);
    flashable(m, mesh(bx(1.3, 0.5, 2.3), red, 0, 0, 0, t), red);                     // sleigh tub
    flashable(m, mesh(bx(1.3, 0.9, 0.18), dark, 0, 0.45, -1.15, t), dark);           // high curled front
    mesh(bx(1.34, 0.1, 2.34), gold, 0, 0.27, 0, t);                                   // gold rail
    mesh(bx(1.1, 0.4, 0.18), dark, 0, 0.3, 1.1, t);                                   // low tail board
    [-0.6, 0.6].forEach(function (x) {                                                // runners
      mesh(bx(0.08, 0.08, 2.9), gold, x, -0.55, 0, t);
      mesh(bx(0.06, 0.3, 0.06), gold, x, -0.4, -0.8, t); mesh(bx(0.06, 0.3, 0.06), gold, x, -0.4, 0.8, t);
      const curl = mesh(bx(0.08, 0.45, 0.08), gold, x, -0.37, -1.52, t); curl.rotation.x = 0.7;
    });
    mesh(new THREE.SphereGeometry(0.55, 8, 6), sack, 0, 0.55, -0.6, t).scale.set(1, 1.1, 0.9);   // the sack, up front
    // Santa, at the back and turned to face you.
    const s = new THREE.Group(); s.position.set(0, 0.25, 0.45); t.add(s);
    mesh(new THREE.SphereGeometry(0.48, 10, 8), red, 0, 0.45, 0, s).scale.set(1, 1.05, 0.9);       // belly
    mesh(bx(0.99, 0.13, 0.9), black, 0, 0.35, 0, s); mesh(bx(0.2, 0.17, 0.05), gold, 0, 0.35, 0.45, s);   // belt, buckle
    mesh(bx(0.99, 0.1, 0.9), white, 0, 0.08, 0, s);                                   // fur trim
    const head = new THREE.Group(); head.position.set(0, 1.08, 0.05); s.add(head);
    mesh(new THREE.SphereGeometry(0.27, 10, 8), skin, 0, 0, 0, head);
    mesh(new THREE.SphereGeometry(0.27, 8, 6), white, 0, -0.19, 0.12, head).scale.set(1.05, 0.95, 0.75);   // beard
    mesh(bx(0.5, 0.06, 0.08), black, 0, 0.13, 0.24, head).rotation.z = 0;             // heavy brow
    const bl = mesh(bx(0.22, 0.05, 0.06), black, -0.13, 0.15, 0.26, head); bl.rotation.z = -0.45;
    const br = mesh(bx(0.22, 0.05, 0.06), black, 0.13, 0.15, 0.26, head); br.rotation.z = 0.45;
    redEyes(head, 0.06, 0.25, 0.1, 0.055, m.eyeMat);
    mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 10), white, 0, 0.24, 0, head);  // hat band
    const hat = mesh(new THREE.ConeGeometry(0.26, 0.6, 8), red, -0.08, 0.55, -0.05, head); hat.rotation.z = 0.5;
    mesh(new THREE.SphereGeometry(0.09, 6, 5), white, -0.3, 0.76, -0.05, head);       // pom
    [-1, 1].forEach(function (sd) {                                                   // arms out on the rail
      const a = mesh(bx(0.2, 0.2, 0.6), red, sd * 0.55, 0.6, 0.1, s); a.rotation.y = sd * 0.5;
      mesh(new THREE.SphereGeometry(0.12, 6, 5), black, sd * 0.68, 0.6, 0.38, s);
    });
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), black, 0, -0.1, 1.4, t).rotation.x = Math.PI / 2;   // tail gun
    m.spinners = rotorRig(t, 1.25, 1.0, 0.1, RED);
  }

  // The Big Tech CEO: suit, red tie, standing at a podium on a sleek executive drone.
  function ceo(m, t) {
    const hull = lam(0xeef1f6), dark = lam(0x14171f), suit = lam(0x1d2433), shirt = lam(0xf4f6fa), tie = lam(0xd0182a), skin = lam(0xe2b596), hair = lam(0x2a2018), glass = new THREE.MeshBasicMaterial({ color: 0x35d6ff });
    flashable(m, mesh(new THREE.CylinderGeometry(1.15, 0.85, 0.3, 14), hull, 0, 0, 0, t), hull);      // the platform
    mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.06, 14), dark, 0, 0.17, 0, t);
    mesh(new THREE.TorusGeometry(1.0, 0.04, 4, 20), glass, 0, -0.16, 0, t).rotation.x = Math.PI / 2;  // underglow ring
    flashable(m, mesh(bx(0.7, 0.75, 0.3), dark, 0, 0.55, 0.62, t), dark);                              // podium, facing you
    mesh(bx(0.5, 0.3, 0.02), glass, 0, 0.62, 0.78, t);                                                 // its logo screen
    // The man himself, turned to face you.
    const s = new THREE.Group(); s.position.set(0, 0.2, 0.05); t.add(s);
    [-0.14, 0.14].forEach(function (x) { mesh(bx(0.2, 0.75, 0.22), suit, x, 0.38, 0, s); mesh(bx(0.21, 0.08, 0.34), dark, x, 0.04, 0.05, s); });   // legs, shoes
    mesh(bx(0.66, 0.75, 0.34), suit, 0, 1.1, 0, s);                                   // jacket
    mesh(bx(0.2, 0.55, 0.02), shirt, 0, 1.2, 0.175, s);                               // shirt front
    mesh(bx(0.08, 0.5, 0.02), tie, 0, 1.17, 0.19, s);                                 // red tie
    const l1 = mesh(bx(0.16, 0.5, 0.02), suit, -0.13, 1.25, 0.185, s); l1.rotation.z = 0.28;          // lapels
    const l2 = mesh(bx(0.16, 0.5, 0.02), suit, 0.13, 1.25, 0.185, s); l2.rotation.z = -0.28;
    [-1, 1].forEach(function (sd) {                                                   // arms folded onto the podium
      mesh(bx(0.17, 0.5, 0.2), suit, sd * 0.42, 1.2, 0.04, s);
      const f = mesh(bx(0.16, 0.16, 0.5), suit, sd * 0.38, 0.95, 0.28, s); f.rotation.y = sd * -0.35;
      mesh(new THREE.SphereGeometry(0.09, 6, 5), skin, sd * 0.3, 0.95, 0.52, s);
    });
    const head = new THREE.Group(); head.position.set(0, 1.72, 0.02); s.add(head);
    mesh(bx(0.34, 0.4, 0.34), skin, 0, 0, 0, head);
    mesh(bx(0.37, 0.14, 0.37), hair, 0, 0.2, -0.01, head); mesh(bx(0.37, 0.3, 0.1), hair, 0, 0.05, -0.15, head);   // neat hair
    mesh(bx(0.2, 0.025, 0.02), dark, 0, -0.11, 0.175, head);                          // thin smile
    mesh(bx(0.04, 0.05, 0.3), dark, 0.2, 0.02, 0.02, head);                           // earpiece
    redEyes(head, 0.05, 0.175, 0.085, 0.045, m.eyeMat);
    [-0.5, 0.5].forEach(function (x) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), dark, x, -0.15, 1.0, t).rotation.x = Math.PI / 2; });   // twin guns
    m.spinners = rotorRig(t, 1.45, 0.95, 0.05, 0x35d6ff);
  }

  // The Mummy Pharaoh, sat up in his flying gold sarcophagus.
  function pharaoh(m, t) {
    const gold = lam(0xe9b93a), goldD = lam(0xb98522), blue = lam(0x1f4fb8), wrap = lam(0xd9d0b4), wrapD = lam(0xb3a784), teal = lam(0x1fb5a8), dark = lam(0x2a2218);
    flashable(m, mesh(bx(1.15, 0.5, 2.7), gold, 0, 0, 0, t), gold);                    // the coffin
    flashable(m, mesh(bx(0.85, 0.45, 0.5), goldD, 0, -0.02, -1.5, t), goldD);          // tapered foot
    for (let i = 0; i < 5; i++) mesh(bx(1.17, 0.52, 0.12), i % 2 ? blue : teal, 0, 0, -0.9 + i * 0.42, t);   // enamel bands
    const lid = mesh(bx(1.1, 0.1, 1.5), goldD, 0.75, 0.2, -0.5, t); lid.rotation.z = -1.1;   // lid thrown open
    // The mummy, sat up and turned to face you.
    const s = new THREE.Group(); s.position.set(0, 0.2, 0.55); t.add(s);
    mesh(bx(0.62, 0.85, 0.36), wrap, 0, 0.5, 0, s);
    for (let i = 0; i < 4; i++) { const b = mesh(bx(0.64, 0.05, 0.38), wrapD, 0, 0.2 + i * 0.2, 0, s); b.rotation.z = (i % 2 ? 1 : -1) * 0.12; }   // bandage lines
    [-1, 1].forEach(function (sd) {                                                    // arms reaching for you
      const a = mesh(bx(0.16, 0.16, 0.75), wrap, sd * 0.36, 0.72, 0.38, s); a.rotation.x = -0.15;
      mesh(bx(0.17, 0.05, 0.17), wrapD, sd * 0.36, 0.76, 0.5, s);
    });
    mesh(new THREE.TorusGeometry(0.3, 0.07, 5, 12, Math.PI), gold, 0, 0.9, 0.12, s).rotation.set(0.4, 0, Math.PI);   // collar
    const head = new THREE.Group(); head.position.set(0, 1.2, 0.02); s.add(head);
    mesh(bx(0.32, 0.38, 0.32), wrap, 0, 0, 0, head);
    mesh(bx(0.34, 0.05, 0.34), wrapD, 0, -0.08, 0, head).rotation.z = 0.15;
    mesh(bx(0.3, 0.1, 0.05), dark, 0, 0.05, 0.15, head);                               // the gap the eyes glow from
    redEyes(head, 0.05, 0.17, 0.08, 0.045, m.eyeMat);
    // Nemes headdress: striped cloth, flaps on the shoulders, a cobra on the brow.
    mesh(bx(0.5, 0.2, 0.42), gold, 0, 0.25, -0.02, head);
    [-1, 1].forEach(function (sd) {
      const f = mesh(bx(0.14, 0.62, 0.3), gold, sd * 0.27, -0.12, -0.02, head); f.rotation.z = sd * 0.16;
      for (let i = 0; i < 3; i++) mesh(bx(0.15, 0.06, 0.31), blue, sd * (0.25 + i * 0.025), 0.08 - i * 0.2, -0.02, head).rotation.z = sd * 0.16;
    });
    mesh(bx(0.51, 0.05, 0.43), blue, 0, 0.22, -0.02, head); mesh(bx(0.51, 0.05, 0.43), blue, 0, 0.31, -0.02, head);
    mesh(bx(0.06, 0.2, 0.06), teal, 0, 0.36, 0.2, head);
    mesh(bx(0.09, 0.45, 0.07), blue, 0, -0.38, 0.17, head);                            // the false beard
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), dark, 0, -0.15, 1.55, t).rotation.x = Math.PI / 2;   // tail gun
    m.spinners = rotorRig(t, 1.3, 1.05, 0.1, 0xffd45a);
  }

  // The pests each boss lets loose: gift boxes, phones, scarabs. Small, one hit.
  const miniShared = {};
  function makeMini(who) {
    const root = new THREE.Group(), tilt = new THREE.Group();
    root.add(tilt);
    tilt.scale.setScalar(1.7);
    const eyeMat = new THREE.MeshBasicMaterial({ color: RED });
    const m = { root: root, tilt: tilt, flash: [], eyeMat: eyeMat, glow: RED, mini: true };
    let colour = RED;
    if (who === "santa") {
      const paper = miniShared.paper || (miniShared.paper = lam(0x1f9d4d)), ribbon = miniShared.ribbon || (miniShared.ribbon = lam(0xf2c14e));
      flashable(m, mesh(bx(0.6, 0.5, 0.6), paper, 0, 0, 0, tilt), paper);
      mesh(bx(0.62, 0.52, 0.14), ribbon, 0, 0, 0, tilt); mesh(bx(0.14, 0.52, 0.62), ribbon, 0, 0, 0, tilt);
      [-1, 1].forEach(function (sd) { mesh(new THREE.SphereGeometry(0.12, 6, 4), ribbon, sd * 0.12, 0.32, 0, tilt).scale.set(1.4, 0.8, 0.6); });
    } else if (who === "pharaoh") {
      const shell = miniShared.shell || (miniShared.shell = lam(0x12a89a)), gold = miniShared.gold || (miniShared.gold = lam(0xe9b93a));
      flashable(m, mesh(new THREE.SphereGeometry(0.36, 8, 6), shell, 0, 0, 0, tilt), shell).scale.set(1, 0.55, 1.35);
      mesh(bx(0.03, 0.03, 0.9), gold, 0, 0.2, 0, tilt);
      mesh(new THREE.SphereGeometry(0.17, 6, 5), gold, 0, 0, -0.5, tilt);
      [-1, 1].forEach(function (sd) { for (let i = 0; i < 3; i++) { const l = mesh(bx(0.4, 0.03, 0.04), gold, sd * 0.45, -0.08, -0.25 + i * 0.25, tilt); l.rotation.z = sd * -0.4; } });
      colour = 0xffd45a;
    } else {
      const slab = miniShared.slab || (miniShared.slab = lam(0x14171f));
      flashable(m, mesh(bx(0.5, 0.06, 0.95), slab, 0, 0, 0, tilt), slab);
      mesh(bx(0.44, 0.02, 0.86), new THREE.MeshBasicMaterial({ color: 0x35d6ff }), 0, 0.04, 0, tilt);
      mesh(new THREE.CircleGeometry(0.11, 10), new THREE.MeshBasicMaterial({ color: RED }), 0.16, 0.055, -0.3, tilt).rotation.x = -Math.PI / 2;   // the notification dot
      colour = 0x35d6ff;
    }
    // Two red eyes on the back of every one of them, and four little rotors.
    const eg = miniShared.eye || (miniShared.eye = new THREE.SphereGeometry(0.07, 6, 5));
    mesh(eg, eyeMat, -0.12, 0.02, who === "pharaoh" ? 0.46 : who === "santa" ? 0.31 : 0.48, tilt);
    mesh(eg, eyeMat, 0.12, 0.02, who === "pharaoh" ? 0.46 : who === "santa" ? 0.31 : 0.48, tilt);
    const disc = miniShared.disc || (miniShared.disc = (function () { const g = new THREE.CircleGeometry(0.2, 10); g.rotateX(-Math.PI / 2); return g; })());
    const discMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (c) { mesh(disc, discMat, c[0] * 0.48, 0.3, c[1] * 0.4, tilt); });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
    halo.scale.set(2.4, 2.4, 1); root.add(halo);
    m.halo = halo;
    return m;
  }
  let haloT = null;
  function haloTex() {
    if (haloT) return haloT;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.35, "rgba(255,255,255,0.25)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    haloT = new THREE.CanvasTexture(c);
    return haloT;
  }
  D.haloTex = haloTex;

  DR.Drone = D;
})(globalThis.DR);
