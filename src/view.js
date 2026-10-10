// Rendering and the camera director: the intro on your pilot (looking at the
// remote), the "goggles on" cut to your drone's FPV camera, the race, and the
// cut back to the stand for the results.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U, CFG = DR.CFG;
  const V = { mode: "fpv", drones: [], pilots: [], quality: 1 };
  const UPTILT = 0.3;            // FPV camera tilted up, like a real racer's

  V.init = function (canvas, T) {
    const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    V.pr = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(V.pr);
    r.setSize(innerWidth, innerHeight, false);
    V.renderer = r;
    V.scene = new THREE.Scene();
    V.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 1400);
    V.camera.rotation.order = "YXZ";
    V.scene.add(V.camera);
    V.T = T;
    DR.World.build(V.scene, T);
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

  // A race was created (or rejoined): drones for everyone, pilots on the stand.
  V.setRace = function (S) {
    V.S = S;
    V.drones.forEach(function (d) { V.scene.remove(d.root); V.scene.remove(d.blob); });
    V.pilots.forEach(function (p) { if (p) DR.World.stand.root.remove(p.root); });
    V.drones = S.racers.map(function (r) {
      const d = DR.Drone.make(r, r.id === S.humanId);
      d.blob = new THREE.Mesh(V.blobGeo, V.blobMat.clone());
      d.blob.rotation.x = -Math.PI / 2;
      V.scene.add(d.root); V.scene.add(d.blob);
      return d;
    });
    V.pilots = S.racers.map(function (r, i) {
      const p = DR.Pilot.make(r, DR.World.stand.slots[i % 16]);
      DR.World.stand.root.add(p.root);
      return p;
    });
    V.puffs.forEach(function (p) { p.visible = false; p.userData.life = 0; });
    V.lastPuff = {};
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
    const puffTex = softTex("rgba(235,235,240,1)", "rgba(235,235,240,0)");
    V.puffs = [];
    for (let i = 0; i < 140; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xb9bcc6, transparent: true, depthWrite: false }));
      s.visible = false; s.userData = { life: 0 };
      V.fx.add(s); V.puffs.push(s);
    }
    V.dartGeo = new THREE.ConeGeometry(0.22, 1.3, 6); V.dartGeo.rotateX(-Math.PI / 2);
    V.dartMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    V.dartGlow = new THREE.SpriteMaterial({ map: softTex("rgba(255,90,150,1)", "rgba(255,90,150,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    V.darts = {};
    V.rings = [];
    V.ringMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: true });
  }

  V.empAt = function (x, y, z) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), V.ringMat.clone());
    m.position.set(x, y, z);
    m.userData.t = 0;
    V.fx.add(m); V.rings.push(m);
  };

  function updateFx(S, dt, now) {
    // Smoke trails behind anyone with smoke out.
    S.racers.forEach(function (r, i) {
      if (r.smokeT <= 0) return;
      const last = V.lastPuff[i] || 0;
      if (now - last < 0.06) return;
      V.lastPuff[i] = now;
      const p = V.puffs.find(function (q) { return q.userData.life <= 0; });
      if (!p) return;
      const D = r.disp;
      p.position.set(D.x - U.fwdX(D.yaw) * 1.6 + (Math.random() - 0.5), D.y + (Math.random() - 0.5) * 0.6, D.z - U.fwdZ(D.yaw) * 1.6 + (Math.random() - 0.5));
      p.userData.life = 1; p.userData.max = 3.5; p.visible = true;
    });
    V.smokeOnMe = 0;
    const me = S.me();
    V.puffs.forEach(function (p) {
      if (p.userData.life <= 0) return;
      p.userData.life -= dt / p.userData.max;
      if (p.userData.life <= 0) { p.visible = false; return; }
      const age = 1 - p.userData.life;
      const size = 2 + age * 7;
      p.scale.set(size, size, 1);
      p.material.opacity = Math.min(1, p.userData.life * 1.6) * 0.85;
      if (me) {
        const d = Math.hypot(me.disp.x - p.position.x, me.disp.y - p.position.y, me.disp.z - p.position.z);
        if (d < size * 0.6) V.smokeOnMe = Math.max(V.smokeOnMe, (1 - d / (size * 0.6)) * p.material.opacity);
      }
    });
    // Darts.
    const seen = {};
    S.darts.forEach(function (d) {
      seen[d.id] = true;
      let m = V.darts[d.id];
      if (!m) {
        m = new THREE.Mesh(V.dartGeo, V.dartMat);
        const glow = new THREE.Sprite(V.dartGlow); glow.scale.set(2.2, 2.2, 1); m.add(glow);
        V.fx.add(m); V.darts[d.id] = m;
      }
      m.position.set(d.x, d.y, d.z);
      m.rotation.set(Math.atan2(d.vy, Math.hypot(d.vx, d.vz)), U.yawTo(d.vx, d.vz), now * 12, "YXZ");
    });
    Object.keys(V.darts).forEach(function (id) { if (!seen[id]) { V.fx.remove(V.darts[id]); delete V.darts[id]; } });
    // EMP shells expanding.
    V.rings = V.rings.filter(function (m) {
      m.userData.t += dt;
      const k = m.userData.t / 0.6;
      m.scale.setScalar(1 + k * CFG.empR);
      m.material.opacity = 0.6 * (1 - k);
      if (k >= 1) { V.fx.remove(m); m.geometry.dispose(); return false; }
      return true;
    });
  }

  // ------------------------------------------------------------------ the camera director
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3();
  function lookFrom(pos, at, k) {
    if (V.camSnap || k >= 1) V.camera.position.copy(pos);
    else V.camera.position.lerp(pos, k);
    _look.copy(at);
    const m = new THREE.Matrix4().lookAt(V.camera.position, _look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (V.camSnap || k >= 1) V.camera.quaternion.copy(q); else V.camera.quaternion.slerp(q, k);
    V.camSnap = false;
  }

  function pilotShot(p, t, wide) {
    // Your pilot, three-quarters from the front, slowly closing in.
    const root = p.root;
    root.updateMatrixWorld(true);
    const head = p.head();
    const fwd = _v.set(0, 0, -1).transformDirection(root.matrixWorld).clone();
    const right = _w.set(1, 0, 0).transformDirection(root.matrixWorld).clone();
    const remote = p.remote.root.getWorldPosition(new THREE.Vector3());
    const d = wide ? 3.2 : 1.9 - Math.min(1, t / 3) * 0.5;
    const pos = head.clone().addScaledVector(fwd, d).addScaledVector(right, d * 0.55).add(new THREE.Vector3(0, wide ? 0.3 : -0.12, 0));
    const at = head.clone().lerp(remote, 0.45);
    return { pos: pos, at: at };
  }

  function overShoulder(p, drone, t) {
    // Over the pilot's shoulder: the remote in the hands, the grid beyond.
    const root = p.root;
    root.updateMatrixWorld(true);
    const head = p.head();
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(root.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);
    const remote = p.remote.root.getWorldPosition(new THREE.Vector3());
    const pos = head.clone().addScaledVector(fwd, -0.7).addScaledVector(right, 0.75).add(new THREE.Vector3(0, 0.45, 0));
    const dronePos = new THREE.Vector3(drone.disp.x, drone.disp.y + 0.4, drone.disp.z);
    const at = remote.clone().lerp(dronePos, U.ease((t - 0.4) / 1.6));
    return { pos: pos, at: at };
  }

  function fpv(r) {
    const D = r.disp;
    const cam = V.camera;
    const yaw = D.yaw + (r.spinT > 0 ? Math.sin(performance.now() / 40) * 0.12 : 0);
    cam.rotation.set(D.pitch + UPTILT, yaw, D.roll * 0.85, "YXZ");
    _v.set(0, 0.32, -0.55).applyEuler(cam.rotation);
    cam.position.set(D.x + _v.x, D.y + _v.y, D.z + _v.z);
  }

  function chase(r, dt) {
    const D = r.disp;
    const back = 6, up = 2;
    const pos = _v.set(D.x - U.fwdX(D.yaw) * back, D.y + up, D.z - U.fwdZ(D.yaw) * back);
    const ground = V.T.terrain(pos.x, pos.z) + 0.8;
    if (pos.y < ground) pos.y = ground;
    lookFrom(pos.clone(), _w.set(D.x + U.fwdX(D.yaw) * 6, D.y + 0.6, D.z + U.fwdZ(D.yaw) * 6).clone(), Math.min(1, dt * 8));
  }

  function orbit(now) {
    // Before the host's race arrives: a slow look round the start.
    const st = V.T.stand, g = V.T.gates[0];
    const cx = (st.x + g.x) / 2, cz = (st.z + g.z) / 2;
    const a = now * 0.08;
    lookFrom(new THREE.Vector3(cx + Math.cos(a) * 60, 26, cz + Math.sin(a) * 60), new THREE.Vector3(cx, 6, cz), 1);
  }

  // What the camera does right now. Also tells the HUD which "shot" we're in.
  function direct(S, dt, now) {
    const me = S ? S.me() : null;
    if (!S) { orbit(now); return "wait"; }
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
      // Watching (no seat): follow the leader.
      const lead = S.racers.find(function (r) { return r.place === 1; }) || S.racers[0];
      if (ph === "race") chase(lead, dt); else orbit(now);
      return "watch";
    }
    if (ph === "intro" && pilot) {
      const t = S.t;
      if (t < 3.0) { const s = pilotShot(pilot, t, false); lookFrom(s.pos, s.at, t < 0.05 ? 1 : Math.min(1, dt * 3)); return "pilot"; }
      if (t < CFG.intro - 0.55) { const s = overShoulder(pilot, me, t - 3.0); lookFrom(s.pos, s.at, Math.min(1, dt * (t < 3.05 ? 60 : 4))); return "shoulder"; }
      fpv(me); return "goggles";
    }
    if (me.finished && V.mode === "fpv" && S.raceT() - me.finishT > 2.5) { chase(me, dt); return "lap"; }
    if (V.mode === "chase") { chase(me, dt); return "chase"; }
    fpv(me);
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
        // Our own drone is hidden while we look through its camera.
        d.root.visible = !(d.own && (shot === "fpv" || shot === "goggles"));
        const D = d.r.disp, gy = V.T.terrain(D.x, D.z);
        const hgt = D.y - gy;
        d.blob.position.set(D.x, gy + 0.06, D.z);
        d.blob.scale.setScalar(1 + hgt * 0.04);
        d.blob.material.opacity = U.clamp(1 - hgt / 30, 0, 1);
        d.blob.visible = hgt < 30;
      });
      // Pilots: animate only when the stand is on screen-ish (close, or in a cut-scene).
      const st = V.T.stand;
      const near = Math.hypot(camPos.x - st.x, camPos.z - st.z) < 110;
      const mood = S.over ? "result" : "hold";
      V.pilots.forEach(function (p, i) {
        if (!p) return;
        const r = S.racers[i];
        p.root.visible = !r.left && near;
        if (!p.root.visible) return;
        p.update(dt, now, S.over && r.place <= 3 ? "wave" : mood);
      });
      // Gate lights: your next gate glows lime, the one after it white.
      if (me) DR.World.gates.forEach(function (g) {
        const i = g.g.i, N = DR.World.gates.length;
        const next = me.gate, after = (me.gate + 1) % N;
        let c;
        if (me.finished) c = 0x9aa3b5;
        else if (i === next) c = (Math.sin(now * 8) > -0.2) ? 0xc4f35b : 0x7fae2e;
        else if (i === after) c = 0xffffff;
        else c = 0x8a93a8;
        g.led.color.setHex(c);
      });
      updateFx(S, dt, now);
      DR.World.update(now, { S: S });
      // Wider view at speed, wider still on turbo.
      const fpvFov = 78 + (me ? (me.turboT > 0 ? 12 : 0) + U.clamp((me.disp.speed - 20) / 30, 0, 1) * 4 : 0);
      const goal = shot === "fpv" || shot === "goggles" ? fpvFov : shot === "chase" || shot === "lap" ? 70 : 50;
      if (Math.abs(V.camera.fov - goal) > 0.05) {
        V.camera.fov = shot === "goggles" || shot === "pilot" ? goal : U.lerp(V.camera.fov, goal, Math.min(1, dt * 4));
        V.camera.updateProjectionMatrix();
      }
    }
    V.renderer.render(V.scene, V.camera);
    autoQuality(dt);
  };

  // Drop the resolution if the frame rate sags (old integrated graphics).
  // Measured only while flying (not during loading or cut-scenes), over 4 s;
  // one hitch (a tab switch, a slow frame) doesn't count.
  let qT = 0, qFrames = 0, qLow = 0;
  function autoQuality(dt) {
    const flying = V.shot === "fpv" || V.shot === "chase" || V.shot === "lap";
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

  // Screen position of a world point, for HUD markers (null when behind us).
  V.project = function (x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(V.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, behind: p.z > 1, ndcX: p.x, ndcY: p.y };
  };

  DR.View = V;
})(globalThis.DR);
