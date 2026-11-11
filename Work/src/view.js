// Rendering and the camera director: the intro on your pilot (eyes on the remote),
// the "goggles on" cut to your drone's FPV camera, the hunt (targets, tracer fire,
// explosions), the chase camera while you're shot down, and the cut back to the
// stand for the results.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U, CFG = DR.CFG;
  const V = { mode: "fpv", drones: [], pilots: [], quality: 1, targets: {}, shake: 0 };

  V.init = function (canvas) {
    const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    V.pr = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(V.pr);
    r.setSize(innerWidth, innerHeight, false);
    V.renderer = r;
    V.scene = new THREE.Scene();
    V.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 1500);
    V.camera.rotation.order = "YXZ";
    V.scene.add(V.camera);
    DR.World.init(V.scene);
    V.fx = new THREE.Group(); V.scene.add(V.fx);
    buildPools();
    addEventListener("resize", resize);
    resize();
  };
  function resize() {
    V.renderer.setSize(innerWidth, innerHeight, false);
    V.camera.aspect = innerWidth / innerHeight;
    V.camera.updateProjectionMatrix();
  }
  // Before the first round: show a course behind the menu.
  V.preview = function (T) { DR.World.show(T); V.T = T; };

  V.setRace = function (S) {
    V.S = S; V.T = S.T;
    DR.World.show(S.T);
    V.drones.forEach(function (d) { V.scene.remove(d.root); V.scene.remove(d.blob); });
    V.pilots.forEach(function (p) { if (p && p.root.parent) p.root.parent.remove(p.root); });
    V.drones = S.racers.map(function (r) {
      const d = DR.Drone.make(r, r.id === S.humanId);
      d.blob = new THREE.Mesh(V.blobGeo, V.blobMat.clone());
      d.blob.rotation.x = -Math.PI / 2;
      V.scene.add(d.root); V.scene.add(d.blob);
      return d;
    });
    V.pilots = S.racers.map(function (r, i) {
      const p = DR.Pilot.make(r, DR.World.stand.slots[i % 8]);
      DR.World.stand.root.add(p.root);
      return p;
    });
    Object.keys(V.targets).forEach(function (id) { V.fx.remove(V.targets[id].root); });
    V.targets = {};
    V.booms.forEach(function (b) { b.visible = false; b.userData.t = 9; });
    V.bits.forEach(function (b) { b.visible = false; b.userData.t = 9; });
    V.camSnap = true;
    V.overT = 0;
  };

  // ------------------------------------------------------------------ effect pools
  function softTex(inner, outer) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function buildPools() {
    V.blobGeo = new THREE.CircleGeometry(1.2, 16);
    V.blobMat = new THREE.MeshBasicMaterial({ map: softTex("rgba(20,24,34,0.55)", "rgba(20,24,34,0)"), transparent: true, depthWrite: false });
    // Tracers: yours lime, theirs red. Stretched boxes along their flight, plus a glow.
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const shotGeo = new THREE.BoxGeometry(0.12, 0.12, 4.5);
    const boltGeo = new THREE.SphereGeometry(0.35, 8, 6); boltGeo.scale(1, 1, 3.2);
    V.shotMat = new THREE.MeshBasicMaterial({ color: 0xd8ff7a });
    V.boltMat = new THREE.MeshBasicMaterial({ color: 0xff3b55 });
    const shotGlow = new THREE.SpriteMaterial(Object.assign({ map: softTex("rgba(196,243,91,1)", "rgba(196,243,91,0)") }, add));
    const boltGlow = new THREE.SpriteMaterial(Object.assign({ map: softTex("rgba(255,60,90,1)", "rgba(255,60,90,0)") }, add));
    V.shots = []; V.bolts = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(shotGeo, V.shotMat); const g = new THREE.Sprite(shotGlow); g.scale.set(1.4, 1.4, 1); m.add(g);
      m.visible = false; V.fx.add(m); V.shots.push(m);
    }
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(boltGeo, V.boltMat); const g = new THREE.Sprite(boltGlow); g.scale.set(2.6, 2.6, 1); m.add(g);
      m.visible = false; V.fx.add(m); V.bolts.push(m);
    }
    // Explosions: a fireball sprite, a shock ring and tumbling debris.
    const fire = softTex("rgba(255,235,170,1)", "rgba(255,90,30,0)");
    V.booms = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: fire, color: 0xffffff }, add)));
      s.visible = false; s.userData = { t: 9, size: 1 }; V.fx.add(s); V.booms.push(s);
    }
    const bitGeo = new THREE.TetrahedronGeometry(0.35, 0);
    const bitMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a, flatShading: true });
    V.bits = [];
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(bitGeo, bitMat); m.visible = false; m.userData = { t: 9, v: new THREE.Vector3() };
      V.fx.add(m); V.bits.push(m);
    }
  }

  // Effects asked for by main.js from the round's events.
  V.boom = function (x, y, z, big) {
    const s = V.booms.find(function (b) { return b.userData.t > 0.7; }) || V.booms[0];
    s.position.set(x, y, z); s.userData.t = 0; s.userData.size = big ? 13 : 8; s.visible = true;
    let n = big ? 14 : 9;
    V.bits.forEach(function (b) {
      if (n <= 0 || b.userData.t < 1.4) return;
      n--;
      b.position.set(x, y, z); b.userData.t = 0; b.visible = true;
      b.userData.v.set((Math.random() - 0.5) * 22, Math.random() * 12 + 2, (Math.random() - 0.5) * 22);
    });
  };
  V.spark = function (x, y, z) {
    const s = V.booms.find(function (b) { return b.userData.t > 0.7; });
    if (!s) return;
    s.position.set(x, y, z); s.userData.t = 0.35; s.userData.size = 2.2; s.visible = true;
  };

  function updateFx(S, dt) {
    // Tracers.
    V.shots.forEach(function (m, i) {
      const sh = S.shots[i];
      m.visible = !!sh;
      if (!sh) return;
      m.position.set(sh.x, sh.y, sh.z);
      m.lookAt(sh.x + sh.vx, sh.y + sh.vy, sh.z + sh.vz);
    });
    V.bolts.forEach(function (m, i) {
      const b = S.bolts[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x, b.y, b.z);
      m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    });
    V.booms.forEach(function (s) {
      if (!s.visible) return;
      s.userData.t += dt;
      const k = s.userData.t / 0.7;
      if (k >= 1) { s.visible = false; return; }
      s.scale.setScalar(s.userData.size * (0.4 + U.ease(k) * 0.9));
      s.material.opacity = 1 - k;
    });
    V.bits.forEach(function (b) {
      if (!b.visible) return;
      const u = b.userData;
      u.t += dt;
      if (u.t > 1.5) { b.visible = false; return; }
      u.v.y -= 22 * dt;
      b.position.addScaledVector(u.v, dt);
      b.rotation.x += dt * 9; b.rotation.y += dt * 7;
    });
    // Target drones: one mesh per live target.
    const seen = {};
    S.targets.forEach(function (tg) {
      seen[tg.id] = true;
      let m = V.targets[tg.id];
      if (!m) { m = DR.Drone.makeTarget(tg.spec.ace); V.fx.add(m.root); V.targets[tg.id] = m; }
      DR.Drone.updateTarget(m, tg, dt, performance.now() / 1000);
    });
    Object.keys(V.targets).forEach(function (id) { if (!seen[id]) { V.fx.remove(V.targets[id].root); delete V.targets[id]; } });
  }

  // ------------------------------------------------------------------ the camera director
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function lookFrom(pos, at, k) {
    if (V.camSnap || k >= 1) V.camera.position.copy(pos);
    else V.camera.position.lerp(pos, k);
    _look.copy(at);
    _q.setFromRotationMatrix(_m.lookAt(V.camera.position, _look, UP));
    if (V.camSnap || k >= 1) V.camera.quaternion.copy(_q); else V.camera.quaternion.slerp(_q, k);
    V.camSnap = false;
  }

  function pilotShot(p, t, wide) {
    const root = p.root;
    root.updateMatrixWorld(true);
    const head = p.head();
    const fwd = _v.set(0, 0, -1).transformDirection(root.matrixWorld).clone();
    const right = _w.set(1, 0, 0).transformDirection(root.matrixWorld).clone();
    const remote = p.remote.root.getWorldPosition(new THREE.Vector3());
    const d = wide ? 3.2 : 1.9 - Math.min(1, t / 3) * 0.5;
    const pos = head.clone().addScaledVector(fwd, d).addScaledVector(right, d * 0.55).add(new THREE.Vector3(0, wide ? 0.3 : -0.12, 0));
    return { pos: pos, at: head.clone().lerp(remote, 0.45) };
  }

  function overShoulder(p, drone, t) {
    const root = p.root;
    root.updateMatrixWorld(true);
    const head = p.head();
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(root.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);
    const remote = p.remote.root.getWorldPosition(new THREE.Vector3());
    const pos = head.clone().addScaledVector(fwd, -0.7).addScaledVector(right, 0.75).add(new THREE.Vector3(0, 0.45, 0));
    const dronePos = new THREE.Vector3(drone.disp.x, drone.disp.y + 0.4, drone.disp.z);
    return { pos: pos, at: remote.clone().lerp(dronePos, U.ease((t - 0.4) / 1.6)) };
  }

  function fpv(r, dt) {
    const D = r.disp, cam = V.camera;
    V.shake = Math.max(0, V.shake - dt * 3);
    const sh = V.shake * 0.04;
    cam.rotation.set(D.pitch + CFG.camTilt + (Math.random() - 0.5) * sh, D.yaw + (Math.random() - 0.5) * sh, D.roll * 0.85, "YXZ");
    _v.set(0, 0.32, -0.55).applyEuler(cam.rotation);
    cam.position.set(D.x + _v.x, D.y + _v.y, D.z + _v.z);
  }

  function chase(r, dt, back, up) {
    const D = r.disp;
    back = back || 6; up = up || 2;
    const pos = _v.set(D.x - U.fwdX(D.yaw) * back, D.y + up, D.z - U.fwdZ(D.yaw) * back);
    const ground = V.T.terrain(pos.x, pos.z) + 0.8;
    if (pos.y < ground) pos.y = ground;
    lookFrom(pos.clone(), _w.set(D.x + U.fwdX(D.yaw) * 6, D.y + 0.6, D.z + U.fwdZ(D.yaw) * 6).clone(), Math.min(1, dt * 8));
  }

  function orbit(now) {
    const st = V.T.stand, g = V.T.at(V.T.startS);
    const cx = (st.x + g.x) / 2, cz = (st.z + g.z) / 2;
    const a = now * 0.06;
    lookFrom(new THREE.Vector3(cx + Math.cos(a) * 90, 45, cz + Math.sin(a) * 90), new THREE.Vector3(cx, 14, cz), 1);
  }

  function direct(S, dt, now) {
    const me = S ? S.me() : null;
    if (!S) { if (V.T) orbit(now); return "wait"; }
    const ph = S.phase();
    const pilot = me ? V.pilots[me.id] : null;
    if (S.over) {
      V.overT += dt;
      if (pilot && V.overT > 1.2) {
        const s = pilotShot(pilot, 3, true);
        lookFrom(s.pos, s.at, V.overT < 1.3 ? 1 : Math.min(1, dt * 2));
        return "results";
      }
      if (me) chase(me, dt); else orbit(now);
      return "over";
    }
    if (!me) {
      const lead = S.racers.find(function (r) { return !r.left && r.rb && r.rb.length; });
      if (lead && ph === "hunt") chase(lead, dt); else orbit(now);
      return "watch";
    }
    if (ph === "intro" && pilot) {
      const t = S.t;
      if (t < 3.0) { const s = pilotShot(pilot, t, false); lookFrom(s.pos, s.at, t < 0.05 ? 1 : Math.min(1, dt * 3)); return "pilot"; }
      if (t < CFG.intro - 0.55) { const s = overShoulder(pilot, me, t - 3.0); lookFrom(s.pos, s.at, Math.min(1, dt * (t < 3.05 ? 60 : 4))); return "shoulder"; }
      fpv(me, dt); return "goggles";
    }
    if (me.downT > 0) { chase(me, dt, 11, 5); return "down"; }
    if (V.mode === "chase") { chase(me, dt); return "chase"; }
    fpv(me, dt);
    return "fpv";
  }

  // ------------------------------------------------------------------ per frame
  V.frame = function (dt, now) {
    const S = V.S;
    const shot = direct(S, dt, now);
    V.shot = shot;
    if (S) {
      const me = S.me();
      const camPos = V.camera.position;
      V.drones.forEach(function (d) {
        DR.Drone.update(d, S, dt, now, camPos);
        const r = d.r;
        d.root.visible = !r.left && !(d.own && (shot === "fpv" || shot === "goggles")) && (d.own || !!(r.rb && r.rb.length) || S.phase() !== "hunt");
        const D = r.disp, gy = V.T.terrain(D.x, D.z);
        const hgt = D.y - gy;
        d.blob.position.set(D.x, gy + 0.06, D.z);
        d.blob.scale.setScalar(1 + hgt * 0.04);
        d.blob.material.opacity = U.clamp(1 - hgt / 30, 0, 1);
        d.blob.visible = d.root.visible && hgt < 30;
      });
      const st = V.T.stand;
      const near = Math.hypot(camPos.x - st.x, camPos.z - st.z) < 110;
      V.pilots.forEach(function (p, i) {
        if (!p) return;
        const r = S.racers[i];
        p.root.visible = !r.left && near;
        if (!p.root.visible) return;
        const top = S.over && S.results && S.results.findIndex(function (x) { return x.id === r.id; }) < 3;
        p.update(dt, now, S.over ? (top ? "wave" : "result") : "hold");
      });
      updateFx(S, dt);
      const fpvFov = 80 + (me ? U.clamp((me.disp.speed - 20) / 30, 0, 1) * 4 : 0);
      const goal = shot === "fpv" || shot === "goggles" ? fpvFov : shot === "chase" || shot === "down" ? 70 : 50;
      if (Math.abs(V.camera.fov - goal) > 0.05) {
        V.camera.fov = shot === "goggles" || shot === "pilot" ? goal : U.lerp(V.camera.fov, goal, Math.min(1, dt * 4));
        V.camera.updateProjectionMatrix();
      }
    }
    V.renderer.render(V.scene, V.camera);
    autoQuality(dt);
  };

  let qT = 0, qFrames = 0, qLow = 0;
  function autoQuality(dt) {
    const flying = V.shot === "fpv" || V.shot === "chase" || V.shot === "down";
    if (!flying || dt > 0.2) return;
    qT += dt; qFrames++;
    if (qT < 4) return;
    const fps = qFrames / qT;
    qT = 0; qFrames = 0;
    V.fps = fps;
    qLow = fps < 45 ? qLow + 1 : 0;
    if (qLow >= 2 && V.pr > 0.6) {
      qLow = 0;
      V.pr = Math.max(0.6, V.pr - 0.2);
      V.renderer.setPixelRatio(V.pr);
      resize();
    }
  }

  V.toggleCamera = function () { V.mode = V.mode === "fpv" ? "chase" : "fpv"; V.camSnap = true; };

  V.project = function (x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(V.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, behind: p.z > 1, ndcX: p.x, ndcY: p.y };
  };

  DR.View = V;
})(globalThis.DR);
