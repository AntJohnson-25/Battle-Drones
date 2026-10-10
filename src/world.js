// The 3D course: sky, valley, gates, pickup boxes, trees, the start area and the
// pilots' stand. Built once from the track numbers (track.js). Low-poly and flat
// shaded, no real-time shadows, so a full lobby runs on integrated graphics.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;
  const W = {};

  const PAL = {
    skyTop: 0x4f9cff, skyHorizon: 0xffe2b8, fog: 0xf3dcc0,
    grass: 0x8fd16a, grassDark: 0x79bf58, hill: 0x6aa84f, olive: 0x9bb05a, rock: 0xc9a77c, peak: 0xe8dcc8, path: 0xd9c38e,
    gateA: 0xff7a45, gateB: 0x2ec4c4, pad: 0x2b3245, trunk: 0x8a5a3b, leaf: 0x4f9a45, leaf2: 0x6cb84e
  };
  W.PAL = PAL;

  function lambert(color, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra || {})); }

  W.build = function (scene, T) {
    W.T = T;
    scene.background = new THREE.Color(PAL.fog);
    scene.fog = new THREE.Fog(PAL.fog, 160, 620);
    scene.add(sky());
    const hemi = new THREE.HemisphereLight(0xdcefff, 0x6b8f4e, 1.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
    sun.position.set(-160, 260, 120);
    scene.add(sun);
    scene.add(terrain(T));
    scene.add(chevrons(T));
    W.gates = T.gates.map(function (g) { const m = gate(T, g); scene.add(m.root); return m; });
    W.boxes = T.boxes.map(function (b) { const m = itemBox(); m.position.set(b.x, b.y, b.z); scene.add(m); return m; });
    scene.add(scenery(T));
    scene.add(pads(T));
    W.stand = stand(T);
    scene.add(W.stand.root);
    scene.add(clouds());
  };

  // ------------------------------------------------------------------ sky
  function sky() {
    const geo = new THREE.SphereGeometry(900, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(PAL.skyTop) }, bottom: { value: new THREE.Color(PAL.skyHorizon) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }"
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    W.skyMesh = m;
    return m;
  }

  // ------------------------------------------------------------------ ground
  function terrain(T) {
    const G = T.terrainGrid, n = G.n, N1 = n + 1;
    const pos = new Float32Array(N1 * N1 * 3), col = new Float32Array(N1 * N1 * 3);
    const c = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
    const rng = U.rng(7);
    for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) {
      const k = iz * N1 + ix, h = G.H[k], d = G.near[k];
      pos[k * 3] = G.x0 + ix * G.cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = G.z0 + iz * G.cell;
      // Colour: mown valley floor, then grassy hills, olive slopes, rock and pale peaks.
      const hx = G.H[iz * N1 + Math.min(n, ix + 1)] - G.H[iz * N1 + Math.max(0, ix - 1)];
      const hz = G.H[Math.min(n, iz + 1) * N1 + ix] - G.H[Math.max(0, iz - 1) * N1 + ix];
      const slope = Math.hypot(hx, hz) / (G.cell * 2);
      if (d < 26) c.setHex(((ix + iz) & 1) ? PAL.grass : PAL.grassDark);
      else {
        cA.setHex(PAL.hill); cB.setHex(PAL.olive);
        c.copy(cA).lerp(cB, U.clamp((h - 10) / 40, 0, 1));
        if (slope > 0.55) c.lerp(cB.setHex(PAL.rock), U.clamp((slope - 0.55) * 2.5, 0, 1));
        if (h > 52) c.lerp(cB.setHex(PAL.peak), U.clamp((h - 52) / 18, 0, 1));
      }
      const j = 0.94 + rng() * 0.1;
      col[k * 3] = c.r * j; col[k * 3 + 1] = c.g * j; col[k * 3 + 2] = c.b * j;
    }
    const idx = [];
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const a = iz * N1 + ix, b = a + 1, cc = a + N1, dd = cc + 1;
      idx.push(a, cc, b, b, cc, dd);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, lambert(0xffffff, { vertexColors: true }));
    m.matrixAutoUpdate = false;
    return m;
  }

  // Arrows on the ground along the line, so you can always find the course.
  function chevrons(T) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -0.6); shape.lineTo(0, 0.9); shape.lineTo(1.6, -0.6); shape.lineTo(1.6, -1.4); shape.lineTo(0, 0.1); shape.lineTo(-1.6, -1.4);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);   // lies flat, pointing -Z
    const count = Math.floor(T.len / 14);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, depthWrite: false }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = T.at(i * 14 + 5);
      p.set(a.x, T.terrain(a.x, a.z) + 0.08, a.z);
      e.set(0, U.yawTo(a.tx, a.tz), 0);
      im.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s));
    }
    im.renderOrder = 1;
    return im;
  }

  // ------------------------------------------------------------------ gates
  // A padded square frame on posts, with an LED strip inside that lights up for
  // the next gate you need (view.js sets which).
  function gate(T, g) {
    const root = new THREE.Group();
    root.position.set(g.x, g.y, g.z);
    root.rotation.y = U.yawTo(g.nx, g.nz);
    const start = g.i === 0;
    const base = start ? 0xffffff : (g.i % 2 ? PAL.gateA : PAL.gateB);
    const pad = lambert(base);
    const th = start ? 0.9 : 0.7, w = g.w, h = g.h;
    const bar = function (bw, bh, x, y, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, th), mat); m.position.set(x, y, 0); root.add(m); return m; };
    if (start) {
      // Chequered start/finish arch.
      const tex = checker();
      const chk = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
      bar(w + th * 2, th * 1.6, 0, h / 2 + th * 0.8, chk);
    } else bar(w + th * 2, th, 0, h / 2 + th / 2, pad);
    bar(w + th * 2, th, 0, -h / 2 - th / 2, pad);
    bar(th, h, -w / 2 - th / 2, 0, pad);
    bar(th, h, w / 2 + th / 2, 0, pad);
    // LED strip just inside the frame.
    const led = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lt = 0.16;
    [[w, lt, 0, h / 2 - lt / 2], [w, lt, 0, -h / 2 + lt / 2], [lt, h, -w / 2 + lt / 2, 0], [lt, h, w / 2 - lt / 2, 0]].forEach(function (b) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], th + 0.06), led);
      m.position.set(b[2], b[3], 0); root.add(m);
    });
    // Posts down to the ground.
    const ground = T.terrain(g.x, g.z) - g.y;
    const postH = -h / 2 - th - ground;
    if (postH > 0.2) {
      const postMat = lambert(0x3a4256);
      [-1, 1].forEach(function (sd) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, postH, 6), postMat);
        p.position.set(sd * (w / 2 + th / 2), -h / 2 - th - postH / 2, 0);
        root.add(p);
      });
    }
    // Gate number on top, so "missed gate 7" means something.
    if (!start) {
      const num = label(String(g.i), "#ffffff", base);
      num.position.set(0, h / 2 + th + 0.9, 0);
      num.scale.set(1.6, 1.6, 1);
      root.add(num);
    }
    return { root: root, led: led, g: g, glow: 0 };
  }

  function checker() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 16;
    const x = c.getContext("2d");
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? "#1d2230" : "#ffffff"; x.fillRect(i * 4, j * 4, 4, 4); }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // A small round badge with text, as a sprite (always faces the camera).
  function label(text, fg, bg) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#" + new THREE.Color(bg).getHexString();
    x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = fg; x.font = "bold 34px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 32, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  }
  W.label = label;

  // ------------------------------------------------------------------ pickup boxes
  let boxGeo = null, boxMat = null, boxEdge = null;
  function itemBox() {
    if (!boxGeo) {
      boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d");
      const gr = x.createLinearGradient(0, 0, 64, 64);
      gr.addColorStop(0, "#ffd23f"); gr.addColorStop(0.5, "#ff7ad9"); gr.addColorStop(1, "#58c4ff");
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      x.fillStyle = "rgba(255,255,255,0.95)"; x.font = "bold 44px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("?", 32, 35);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      boxMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.88 });
      boxEdge = new THREE.LineBasicMaterial({ color: 0xffffff });
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(boxGeo, boxMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), boxEdge));
    return g;
  }

  // ------------------------------------------------------------------ scenery
  function scenery(T) {
    const group = new THREE.Group();
    const rng = U.rng(42);
    const trees = [], rocks = [];
    for (let i = 0; i < 2600 && trees.length < 520; i++) {
      const x = -330 + rng() * 840, z = -360 + rng() * 840;
      const nb = T.nearest(x, z);
      if (nb.d < 28 || nb.d > 230) continue;
      const st = T.stand;
      if (Math.hypot(x - st.x, z - st.z) < 18) continue;
      const h = T.terrain(x, z);
      if (h > 58) continue;
      if (rng() < 0.12) rocks.push([x, h, z, 0.8 + rng() * 2.2, rng() * 6]);
      else trees.push([x, h, z, 0.8 + rng() * 0.8, rng()]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 5); trunkGeo.translate(0, 1.5, 0);
    const leafGeo = new THREE.ConeGeometry(2.6, 7, 6); leafGeo.translate(0, 6, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(PAL.trunk), trees.length);
    const leaf = new THREE.InstancedMesh(leafGeo, lambert(0xffffff), trees.length);
    const c = new THREE.Color();
    trees.forEach(function (t, i) {
      p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * (0.9 + t[4] * 0.4), t[3]); q.setFromEuler(e.set(0, t[4] * 6, 0));
      m4.compose(p, q, s);
      trunk.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4);
      leaf.setColorAt(i, c.setHex(t[4] < 0.5 ? PAL.leaf : PAL.leaf2));
    });
    group.add(trunk, leaf);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rock = new THREE.InstancedMesh(rockGeo, lambert(PAL.rock), rocks.length);
    rocks.forEach(function (r, i) {
      p.set(r[0], r[1] + r[3] * 0.3, r[2]); s.set(r[3] * 1.3, r[3], r[3]); q.setFromEuler(e.set(r[4], r[4] * 2, 0));
      rock.setMatrixAt(i, m4.compose(p, q, s));
    });
    group.add(rock);
    [trunk, leaf, rock].forEach(function (m) { m.frustumCulled = false; });
    return group;
  }

  function clouds() {
    const group = new THREE.Group();
    const rng = U.rng(9);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x9aa8b8, fog: false });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const cl = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set((k - n / 2) * 14 + rng() * 6, rng() * 5, rng() * 10);
        m.scale.set(14 + rng() * 10, 7 + rng() * 5, 10 + rng() * 6);
        cl.add(m);
      }
      const a = rng() * Math.PI * 2, r = 380 + rng() * 300;
      cl.position.set(90 + Math.cos(a) * r, 150 + rng() * 90, 60 + Math.sin(a) * r);
      cl.rotation.y = rng() * 6;
      group.add(cl);
    }
    return group;
  }

  // Launch pads on the starting grid.
  function pads(T) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(2.4, 0.2, 2.4);
    const mat = lambert(PAL.pad);
    const ring = new THREE.RingGeometry(0.75, 0.95, 20); ring.rotateX(-Math.PI / 2);
    T.grid.forEach(function (g, i) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(g.x, g.y - 0.15, g.z);
      m.rotation.y = g.yaw;
      group.add(m);
      const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: DR.COLOURS[i % DR.COLOURS.length] }));
      r.position.set(g.x, g.y - 0.03, g.z);
      group.add(r);
    });
    return group;
  }

  // The pilots' stand: a deck with a canopy beside the start straight. Pilot i
  // stands at slot i (front row first), facing the track.
  function stand(T) {
    const st = T.stand, root = new THREE.Group();
    root.position.set(st.x, st.y, st.z);
    root.rotation.y = st.yaw;   // local -Z faces the track
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 7), lambert(0x6b7690));
    deck.position.set(0, 0.4, 0); root.add(deck);
    const step = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 3), lambert(0x7b86a0));
    step.position.set(0, 1.05, 2); root.add(step);
    const rail = lambert(0xffd23f);
    const top = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.12), rail);
    top.position.set(0, 1.85, -3.3); root.add(top);
    for (let i = -4; i <= 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), rail); p.position.set(i * 2.2, 1.3, -3.3); root.add(p); }
    const roofMat = lambert(0xff7a45);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.3, 8), roofMat);
    roof.position.set(0, 5.2, 0.3); roof.rotation.x = -0.08; root.add(roof);
    [-9, 9].forEach(function (x) { [-3.2, 3.6].forEach(function (z) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.6, 6), lambert(0x3a4256));
      p.position.set(x, 3, z); root.add(p);
    }); });
    const slots = [];
    for (let i = 0; i < 16; i++) {
      const row = i < 8 ? 0 : 1, col = i % 8;
      slots.push({ x: (col - 3.5) * 2.1 + (row ? 1.05 : 0), y: row ? 1.3 : 0.8, z: row ? 2 : -1.6 });
    }
    return { root: root, slots: slots };
  }

  W.update = function (now, me) {
    // Pickup boxes spin and bob; a taken box pops back in when it respawns.
    if (W.boxes && me) {
      const S = me.S;
      W.boxes.forEach(function (b, i) {
        const on = S.boxes[i].on;
        b.userData.k = U.approach(b.userData.k === undefined ? 1 : b.userData.k, on ? 1 : 0, on ? 0.05 : 0.25);
        b.visible = b.userData.k > 0.02;
        b.scale.setScalar(U.ease(b.userData.k));
        b.rotation.set(now * 0.7 + i, now * 1.1 + i * 0.7, 0);
        b.position.y = S.boxes[i].y + Math.sin(now * 2 + i) * 0.25;
      });
    }
  };

  DR.World = W;
})(globalThis.DR);
