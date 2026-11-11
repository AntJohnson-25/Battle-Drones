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
    const armed = (ph === "hunt" || ph === "over" || (ph === "count" && S.t > DR.CFG.intro + 0.8)) && !(r.downT > 0);
    const rate = armed ? 60 + P.speed * 2 : ph === "count" ? 18 : 0;
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
  D.makeTarget = function (ace) {
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
    return { root: root, tilt: tilt, body: body, eyeMat: eyeMat, glow: glow, rotors: rotors, halo: halo, mats: [plate.material, eyeMat] };
  };
  D.updateTarget = function (m, tg, dt, now) {
    m.root.position.set(tg.x, tg.y + Math.sin(now * 5 + tg.id) * 0.08, tg.z);
    m.root.rotation.set(0, tg.yaw, 0);
    m.tilt.rotation.set(-0.15, 0, tg.bank, "YXZ");
    // Flash white when hit.
    m.body.material = tg.flash > 0 ? tShared.hit : tShared.dark;
    m.eyeMat.color.setHex(tg.fireT < 0.35 ? 0xffffff : m.glow);
    m.halo.material.opacity = 0.45 + Math.sin(now * 6 + tg.id) * 0.12;
  };
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
