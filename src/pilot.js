// Pilots on the stand, each holding an FPV remote. Human players appear as their
// HopLobby avatar (platform rule): a rigged glTF from HopLobby.avatar(id,
// { format: "glb" }) with idle / walk / run / jump / wave clips, facing -Z, feet at
// y = 0, about 1.6 m tall. We ask once per player, keep it in memory for the
// visit and never save or send it anywhere. The rig has no "hold a remote" clip,
// so the arms reach the remote's grips by inverse kinematics on top of the idle
// clip, and the head tilts down to look at it.
// Bone names aren't documented, so the rig is read from the skeleton's shape
// (same approach as Bladed): the chain up to the highest bone is spine / neck /
// head, other chains off it are the arms (right = +X when facing -Z).
// Bots, and players whose avatar can't load (or the game opened on its own),
// get a simple figure instead: robots for bots, a plain pilot for people.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;
  const P = {};
  const AV = {};          // hl -> { state: "loading" | "ready" | "failed", gltf, rig, scale, clips, info }
  const HEIGHT = 1.7;

  P.requestAvatar = function (hl) {
    if (!hl || AV[hl] || typeof HopLobby === "undefined" || !HopLobby.context || HopLobby.context.standalone) return Promise.resolve();
    if (!THREE.GLTFLoader) return Promise.resolve();
    const e = AV[hl] = { state: "loading" };
    e.promise = HopLobby.avatar(hl, { format: "glb" }).then(function (buf) {
      return new THREE.GLTFLoader().parseAsync(buf, "");
    }).then(function (gltf) {
      prepare(e, gltf);
      e.state = e.rig ? "ready" : "failed";
    }).catch(function (err) { e.state = "failed"; e.info = String(err && err.message || err); });
    return e.promise;
  };
  P.avatarStates = function () {
    const out = {};
    Object.keys(AV).forEach(function (k) { out[k] = { state: AV[k].state, info: AV[k].info }; });
    return out;
  };

  function prepare(e, gltf) {
    const scene = gltf.scene;
    scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); scene.scale.set(1, 1, 1);
    scene.updateMatrixWorld(true);
    const bones = [];
    scene.traverse(function (o) {
      if (o.isBone) bones.push(o);
      if (o.isMesh) o.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - Math.min(0, box.min.y);
    e.scale = h > 0.5 && h < 4 ? HEIGHT / h : 1.06;
    e.gltf = gltf;
    e.clips = {};
    gltf.animations.forEach(function (a) { e.clips[a.name.toLowerCase().replace(/^.*\|/, "")] = a; });
    e.rest = bones.map(function (b) { return b.quaternion.clone(); });
    e.bones = bones;
    e.rig = readRig(bones);
    e.info = e.rig ? bones.length + " bones, clips " + Object.keys(e.clips).join("/") : "rig not recognised (" + bones.length + " bones)";
  }

  function readRig(bones) {
    if (bones.length < 10) return null;
    const isBone = function (o) { return o && o.isBone; };
    const kids = function (b) { return b.children.filter(isBone); };
    const wp = new Map();
    bones.forEach(function (b) { wp.set(b, b.getWorldPosition(new THREE.Vector3())); });
    const count = function (b) { let n = 1; kids(b).forEach(function (k) { n += count(k); }); return n; };
    const roots = bones.filter(function (b) { return !isBone(b.parent); }).sort(function (a, b) { return count(b) - count(a); });
    const hips = roots[0];
    if (!hips) return null;
    const under = []; (function walk(b) { under.push(b); kids(b).forEach(walk); })(hips);
    const head = under.slice().sort(function (a, b) { return wp.get(b).y - wp.get(a).y; })[0];
    const path = [];
    for (let b = head; b; b = isBone(b.parent) ? b.parent : null) { path.push(b); if (b === hips) break; }
    if (path[path.length - 1] !== hips) return null;
    const onPath = new Set(path);
    const chain = function (b) { const c = [b]; let k = kids(b); while (k.length) { k.sort(function (x, y) { return count(y) - count(x); }); c.push(k[0]); k = kids(k[0]); } return c; };
    const arms = [];
    path.forEach(function (b) {
      if (b === hips) return;
      kids(b).forEach(function (k) { if (!onPath.has(k)) arms.push(chain(k)); });
    });
    if (arms.length < 2) return null;
    arms.sort(function (a, b) { return wp.get(b[b.length - 1]).x - wp.get(a[a.length - 1]).x; });
    const armR = arms[0], armL = arms[arms.length - 1];
    const limb = function (c) { const n = c.length; return { upper: c[Math.max(0, n - 3)], fore: c[Math.max(0, n - 2)], hand: c[n - 1] }; };
    const R = limb(armR), L = limb(armL);
    if (R.hand === R.fore || L.hand === L.fore || wp.get(R.hand).x <= 0) return null;
    const chest = armR[0].parent;
    const neck = path.length > 2 ? path[1] : null;
    return { hips: hips, chest: chest, neck: neck, head: head, armR: R, armL: L };
  }

  // ------------------------------------------------------------------ the remote
  // An FPV radio: face up (+Y), top edge away (-Z), grips at the two bottom corners.
  let remoteParts = null;
  function makeRemote(colour) {
    if (!remoteParts) {
      remoteParts = {
        body: new THREE.MeshLambertMaterial({ color: 0x2b2f3a, flatShading: true }),
        stick: new THREE.MeshLambertMaterial({ color: 0x9aa3b5, flatShading: true }),
        screen: new THREE.MeshBasicMaterial({ color: 0x7fd8ff })
      };
    }
    const M = remoteParts;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.12), M.body); g.add(body);
    [-1, 1].forEach(function (s) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.09, 6), M.body);
      grip.rotation.x = Math.PI / 2 - 0.5; grip.position.set(s * 0.085, -0.02, 0.06); g.add(grip);
    });
    const sticks = [-1, 1].map(function (s) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.055, 0.025, 0.005);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 5), M.stick); st.position.y = 0.017; pivot.add(st);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 8), M.stick); cap.position.y = 0.035; pivot.add(cap);
      g.add(pivot); return pivot;
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.035), M.screen);
    screen.position.set(0, 0.024, -0.03); g.add(screen);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.02), new THREE.MeshLambertMaterial({ color: colour, flatShading: true }));
    trim.position.set(0, 0.01, -0.06); g.add(trim);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), M.body);
    ant.position.set(0.07, 0.04, -0.1); ant.rotation.x = -0.9; g.add(ant);
    return { root: g, sticks: sticks, screen: screen };
  }

  // ------------------------------------------------------------------ inverse kinematics
  const _bp = new THREE.Vector3(), _hp = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _id = new THREE.Quaternion();
  // Turn a bone by a world-space rotation q.
  function rotateWorld(bone, q) {
    bone.parent.getWorldQuaternion(_pq);
    bone.getWorldQuaternion(_bq);
    _bq.premultiply(q);
    bone.quaternion.copy(_pq.invert().multiply(_bq));
    bone.updateMatrixWorld(true);
  }
  // Two-bone reach (cyclic coordinate descent), then swing the elbow toward `pole`.
  function reach(arm, target, pole) {
    for (let it = 0; it < 8; it++) {
      [arm.fore, arm.upper].forEach(function (bone) {
        bone.getWorldPosition(_bp); arm.hand.getWorldPosition(_hp);
        _v1.subVectors(_hp, _bp); _v2.subVectors(target, _bp);
        if (_v1.lengthSq() < 1e-8 || _v2.lengthSq() < 1e-8) return;
        _q.setFromUnitVectors(_v1.normalize(), _v2.normalize());
        _q.slerp(_id, 0.35);
        rotateWorld(bone, _q);
      });
    }
    const sh = arm.upper.getWorldPosition(new THREE.Vector3());
    const hand = arm.hand.getWorldPosition(new THREE.Vector3());
    const elbow = arm.fore.getWorldPosition(new THREE.Vector3());
    const axis = hand.sub(sh).normalize();
    const e = elbow.sub(sh); e.addScaledVector(axis, -e.dot(axis));
    const p = pole.clone(); p.addScaledVector(axis, -p.dot(axis));
    if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) {
      e.normalize(); p.normalize();
      const ang = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(e, p)), e.dot(p));
      rotateWorld(arm.upper, _q.setFromAxisAngle(axis, ang));
    }
  }

  // Rotate a bone about an axis given in the avatar's own space (+X right, +Y up, -Z forward).
  const _aq = new THREE.Quaternion(), _sq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _av = new THREE.Vector3();
  function avTurn(scene, bone, ax, ay, az, angle) {
    if (!bone || !angle) return;
    const par = bone.parent;
    par.updateWorldMatrix(true, false);
    scene.getWorldQuaternion(_sq);
    par.getWorldQuaternion(_aq);
    _aq.premultiply(_sq.invert());
    _rq.setFromAxisAngle(_av.set(ax, ay, az), angle);
    bone.quaternion.premultiply(_aq).premultiply(_rq).premultiply(_aq.invert());
  }

  // ------------------------------------------------------------------ pilots
  // A pilot for racer r at a stand slot. Returns { root, update(dt, now, mood), head() }.
  P.make = function (r, slot) {
    const e = r.hl ? AV[r.hl] : null;
    const pilot = e && e.state === "ready" ? avatarPilot(r, e) : figurePilot(r);
    pilot.root.position.set(slot.x, slot.y, slot.z);
    return pilot;
  };

  function avatarPilot(r, e) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    body.scale.setScalar(e.scale);
    const scene = e.gltf.scene;
    if (scene.parent) scene.parent.remove(scene);
    e.bones.forEach(function (b, i) { b.quaternion.copy(e.rest[i]); });
    body.add(scene);
    const mixer = new THREE.AnimationMixer(scene);
    const act = {};
    ["idle", "walk", "wave"].forEach(function (n) {
      if (!e.clips[n]) return;
      const a = mixer.clipAction(e.clips[n]);
      a.play(); a.setEffectiveWeight(n === "idle" ? 1 : 0);
      act[n] = a;
    });
    const remote = makeRemote(r.colour);
    root.add(remote.root);
    const rig = e.rig;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28),
      new THREE.MeshBasicMaterial({ color: r.colour, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; root.add(ring);
    const tmp = { c: new THREE.Vector3(), h: new THREE.Vector3(), n: new THREE.Vector3(), t: new THREE.Vector3(), x: new THREE.Vector3(),
      f: new THREE.Vector3(), m: new THREE.Matrix4(), gl: new THREE.Vector3(), gr: new THREE.Vector3(), up: new THREE.Vector3() };
    let waveW = 0, walkW = 0;
    const handOut = new THREE.Vector3();
    return {
      root: root, kind: "avatar", remote: remote,
      head: function () { return rig.head.getWorldPosition(new THREE.Vector3()); },
      hand: function () { return handOut.clone(); },
      update: function (dt, now, mood, L) {
        // Clips first (idle / walk, or a wave when celebrating), then the pose on top.
        waveW = U.approach(waveW, mood === "wave" && act.wave ? 1 : 0, dt * 3);
        walkW = U.approach(walkW, L && L.walk && act.walk ? 1 : 0, dt * 5);
        e.bones.forEach(function (b, i) { b.quaternion.copy(e.rest[i]); });
        if (act.idle) act.idle.setEffectiveWeight(Math.max(0, 1 - waveW - walkW));
        if (act.walk) act.walk.setEffectiveWeight(walkW);
        if (act.wave) act.wave.setEffectiveWeight(waveW);
        mixer.update(dt);
        root.updateMatrixWorld(true);
        rig.armR.hand.getWorldPosition(handOut);
        // The launch: carrying the drone, winding up, throwing it skyward.
        if (L && !L.remote) {
          remote.root.visible = false;
          const C = tmp.c, H = tmp.h, F = tmp.f, R = tmp.x, UP = tmp.up.set(0, 1, 0);
          rig.chest.getWorldPosition(C); rig.head.getWorldPosition(H);
          F.set(0, 0, -1).transformDirection(root.matrixWorld);
          R.set(1, 0, 0).transformDirection(root.matrixWorld);
          const sc = e.scale * (HEIGHT / 1.7);
          const a = armPose(L.a, C, H, F, R, UP, sc), b = armPose(L.b, C, H, F, R, UP, sc);
          tmp.gr.copy(a).lerp(b, U.ease(L.k));
          const pole = new THREE.Vector3(0.7, L.b === "throw" ? -0.2 : -1, L.b === "throw" ? 0.5 : 0.2).transformDirection(root.matrixWorld);
          reach(rig.armR, tmp.gr, pole);
          rig.armR.hand.getWorldPosition(handOut);
          // Eyes follow the drone up as it goes.
          avTurn(scene, rig.head, 1, 0, 0, L.b === "throw" || L.look ? 0.35 : 0);
          return;
        }
        root.updateMatrixWorld(true);
        const look = 1 - waveW;
        avTurn(scene, rig.chest, 1, 0, 0, -0.12 * look);
        avTurn(scene, rig.neck, 1, 0, 0, -0.25 * look);
        avTurn(scene, rig.head, 1, 0, 0, -0.35 * look);
        root.updateMatrixWorld(true);
        // The remote sits in front of the chest, face tipped toward the eyes.
        const C = tmp.c, H = tmp.h, N = tmp.n, Tt = tmp.t, X = tmp.x, F = tmp.f;
        rig.chest.getWorldPosition(C); rig.head.getWorldPosition(H);
        F.set(0, 0, -1).transformDirection(root.matrixWorld);
        tmp.up.set(0, 1, 0);
        const sc = e.scale * (HEIGHT / 1.7);
        C.addScaledVector(F, 0.32 * sc).addScaledVector(tmp.up, -0.08 * sc);
        N.subVectors(H, C).normalize();
        Tt.copy(F).addScaledVector(N, -F.dot(N)).normalize();
        X.crossVectors(Tt, N).normalize();
        tmp.m.makeBasis(X, N, Tt.clone().negate());
        root.worldToLocal(remote.root.position.copy(C));
        remote.root.quaternion.setFromRotationMatrix(tmp.m).premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert());
        // Thumbs on the sticks: a little fidget.
        remote.sticks[0].rotation.set(Math.sin(now * 3.1) * 0.25, 0, Math.sin(now * 2.3) * 0.2);
        remote.sticks[1].rotation.set(Math.sin(now * 2.6 + 1) * 0.25, 0, Math.sin(now * 3.7) * 0.2);
        if (look < 0.02) { remote.root.visible = false; return; }
        remote.root.visible = true;
        // Wrists just behind and below the grips; elbows down and out.
        tmp.gr.copy(C).addScaledVector(X, 0.1 * sc).addScaledVector(Tt, -0.07 * sc).addScaledVector(N, -0.04 * sc);
        tmp.gl.copy(C).addScaledVector(X, -0.1 * sc).addScaledVector(Tt, -0.07 * sc).addScaledVector(N, -0.04 * sc);
        const poleR = new THREE.Vector3(0.6, -1, 0.3).transformDirection(root.matrixWorld);
        const poleL = new THREE.Vector3(-0.6, -1, 0.3).transformDirection(root.matrixWorld);
        reach(rig.armR, tmp.gr, poleR);
        reach(rig.armL, tmp.gl, poleL);
      }
    };
  }

  // Where the right hand goes for each launch stage, in the pilot's own frame.
  function armPose(stage, C, H, F, R, UP, sc) {
    const p = new THREE.Vector3();
    if (stage === "windup") p.copy(C).addScaledVector(F, -0.12 * sc).addScaledVector(R, 0.34 * sc).addScaledVector(UP, -0.4 * sc);
    else if (stage === "throw") p.copy(H).addScaledVector(F, 0.34 * sc).addScaledVector(R, 0.14 * sc).addScaledVector(UP, 0.42 * sc);
    else p.copy(C).addScaledVector(F, 0.4 * sc).addScaledVector(R, 0.16 * sc).addScaledVector(UP, -0.02 * sc);   // carry
    return p;
  }

  // A plain figure, posed holding the remote: a robot for bots, a pilot in a
  // hoodie for people whose avatar isn't available.
  function figurePilot(r) {
    const root = new THREE.Group();
    const lam = function (c) { return new THREE.MeshLambertMaterial({ color: c, flatShading: true }); };
    const robot = r.bot;
    const cloth = lam(robot ? 0xb8c0d0 : r.colour), dark = lam(robot ? 0x5a6478 : 0x2b3245), skin = lam(robot ? 0xd8dde8 : 0xe0b08a);
    const add = function (geo, mat, x, y, z, rx) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; root.add(m); return m; };
    // Legs on hip pivots, so they can swing when walking.
    const legs = [-0.11, 0.11].map(function (x) {
      const piv = new THREE.Group(); piv.position.set(x, 0.82, 0); root.add(piv);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.82, 0.17), dark); m.position.y = -0.41; piv.add(m);
      return piv;
    });
    add(new THREE.BoxGeometry(0.42, 0.56, 0.24), cloth, 0, 1.1, 0);
    // Straight arms on shoulder pivots, for the launch (the bent "remote" arms hide meanwhile).
    const straight = [-1, 1].map(function (s) {
      const piv = new THREE.Group(); piv.position.set(s * 0.27, 1.34, 0); root.add(piv);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.12), cloth); m.position.y = -0.31; piv.add(m);
      const hand = new THREE.Object3D(); hand.position.y = -0.64; piv.add(hand);
      piv.visible = false; piv.userData.hand = hand;
      return piv;
    });
    const bent = [];
    const head = new THREE.Group(); head.position.set(0, 1.5, 0); root.add(head);
    head.rotation.x = -0.45;
    const hm = new THREE.Mesh(robot ? new THREE.BoxGeometry(0.26, 0.24, 0.26) : new THREE.IcosahedronGeometry(0.15, 1), skin);
    hm.position.y = 0.1; head.add(hm);
    if (robot) {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: r.colour }));
      visor.position.set(0, 0.12, -0.135); head.add(visor);
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), lam(r.colour));
      cap.position.y = 0.2; head.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), lam(r.colour));
      brim.position.set(0, 0.17, -0.14); head.add(brim);
    }
    // Arms bent forward to the remote.
    [-1, 1].forEach(function (s) {
      bent.push(add(new THREE.BoxGeometry(0.11, 0.34, 0.12), cloth, s * 0.27, 1.18, -0.05, 0.5));
      bent.push(add(new THREE.BoxGeometry(0.1, 0.3, 0.1), cloth, s * 0.2, 1.0, -0.24, 1.35));
    });
    const remote = makeRemote(r.colour);
    remote.root.position.set(0, 1.0, -0.4);
    remote.root.rotation.x = 0.75;
    root.add(remote.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28),
      new THREE.MeshBasicMaterial({ color: r.colour, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; root.add(ring);
    let hop = 0;
    // Arm angle forward from hanging (radians) for each launch stage.
    const ANG = { carry: 1.35, windup: -0.7, throw: 2.85 };
    return {
      root: root, kind: "figure", remote: remote,
      head: function () { return head.getWorldPosition(new THREE.Vector3()); },
      hand: function () { root.updateMatrixWorld(true); return straight[1].userData.hand.getWorldPosition(new THREE.Vector3()); },
      update: function (dt, now, mood, L) {
        remote.sticks[0].rotation.set(Math.sin(now * 3.1) * 0.25, 0, Math.sin(now * 2.3) * 0.2);
        remote.sticks[1].rotation.set(Math.sin(now * 2.6 + 1) * 0.25, 0, Math.sin(now * 3.7) * 0.2);
        const launching = !!(L && !L.remote);
        remote.root.visible = !launching;
        bent.forEach(function (m) { m.visible = !launching; });
        straight.forEach(function (p) { p.visible = launching; });
        const sw = L && L.walk ? Math.sin(now * 9) * 0.5 : 0;
        legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
        if (launching) {
          straight[1].rotation.x = U.lerp(ANG[L.a] || 0, ANG[L.b] || 0, U.ease(L.k));
          straight[1].rotation.z = 0.1;
          straight[0].rotation.x = -sw * 0.8;
          head.rotation.x = L.b === "throw" || L.look ? 0.35 : -0.1;
          return;
        }
        hop = mood === "wave" ? Math.abs(Math.sin(now * 6)) * 0.12 : 0;
        root.children.forEach(function (c) { if (c.userData.y0 === undefined) c.userData.y0 = c.position.y; c.position.y = c.userData.y0 + hop; });
        head.rotation.x = mood === "wave" ? -0.05 : -0.45;
      }
    };
  }

  DR.Pilot = P;
})(globalThis.DR);
