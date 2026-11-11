// The 3D courses: sky, light, the City (streets and towers) and the Mountain
// (valley, slopes, snowy peaks, pines), the launch pads and the pilots' stand.
// Each course is built once, the first time it's flown, and kept. Low-poly, flat
// shaded, no real-time shadows, so a full lobby runs on integrated graphics.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;
  const W = { built: {} };

  const LOOK = {
    city: { skyTop: 0x3f6fd8, horizon: 0xffc8a0, fog: 0xe6c6b2, fogNear: 140, fogFar: 640, hemiG: 0x5b5f6e, sun: 0xffe2c0 },
    mountain: { skyTop: 0x4f9cff, horizon: 0xe8f1ff, fog: 0xdfe9f5, fogNear: 180, fogFar: 760, hemiG: 0x6b8f4e, sun: 0xfff1d6 }
  };
  W.LOOK = LOOK;
  function lambert(color, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra || {})); }

  // Shared once: sky dome, lights, clouds.
  W.init = function (scene) {
    W.scene = scene;
    W.sky = sky();
    scene.add(W.sky);
    W.hemi = new THREE.HemisphereLight(0xdcefff, 0x6b8f4e, 1.25);
    scene.add(W.hemi);
    W.sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
    W.sun.position.set(-160, 260, 120);
    scene.add(W.sun);
    scene.add(clouds());
  };

  // Show one course (building it the first time).
  W.show = function (T) {
    if (!W.built[T.course]) {
      const g = new THREE.Group();
      if (T.course === "city") city(g, T); else mountain(g, T);
      g.add(chevrons(T));
      g.add(pads(T));
      const st = stand(T);
      g.add(st.root);
      W.built[T.course] = { group: g, stand: st };
      W.scene.add(g);
    }
    Object.keys(W.built).forEach(function (k) { W.built[k].group.visible = k === T.course; });
    W.stand = W.built[T.course].stand;
    W.T = T;
    const L = LOOK[T.course];
    W.scene.background = new THREE.Color(L.fog);
    W.scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
    W.sky.material.uniforms.top.value.setHex(L.skyTop);
    W.sky.material.uniforms.bottom.value.setHex(L.horizon);
    W.hemi.groundColor.setHex(L.hemiG);
    W.sun.color.setHex(L.sun);
  };

  function sky() {
    const geo = new THREE.SphereGeometry(900, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x4f9cff) }, bottom: { value: new THREE.Color(0xffe2b8) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }"
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  // ------------------------------------------------------------------ city
  function windowTex() {
    // 2 x 2 windows per tile, some lit; the tile repeats every 8 m on the walls.
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#e9e6df"; x.fillRect(0, 0, 64, 64);
    const rng = U.rng(5);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const lit = rng() < 0.35;
      x.fillStyle = lit ? "#ffe6a8" : "#3b4a63";
      x.fillRect(6 + i * 32, 8 + j * 32, 20, 18);
      x.fillStyle = "rgba(255,255,255,0.25)"; x.fillRect(6 + i * 32, 8 + j * 32, 20, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function city(group, T) {
    // Street: one big asphalt slab, with a paler avenue under the flight line.
    const E = T.extent;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), lambert(0x545a68));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(E.x0 + E.size / 2, -0.02, E.z0 + E.size / 2);
    group.add(ground);
    group.add(ribbon(T, 19, 0x6a7182, 0.02));
    group.add(ribbon(T, 0.5, 0xf2e6b8, 0.04, 7.5));
    group.add(ribbon(T, 0.5, 0xf2e6b8, 0.04, -7.5));
    // Towers, merged into one mesh: walls carry the window tile scaled to their size,
    // roofs take the plain corner of it.
    const TINT = [0x9aa6bb, 0xc3cad6, 0x7d8ba8, 0xdcc9a8, 0xa8bccc, 0xc9a48f];
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const c = new THREE.Color();
    T.buildings.forEach(function (b) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
      c.setHex(TINT[Math.floor(b.tint * TINT.length) % TINT.length]);
      const base = pos.length / 3;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i) + b.x, p.getY(i) + b.h / 2, p.getZ(i) + b.z);
        const nx = n.getX(i), ny = n.getY(i);
        nor.push(nx, ny, n.getZ(i));
        if (Math.abs(ny) > 0.5) uv.push(0.02, 0.02);
        else uv.push(u.getX(i) * (Math.abs(nx) > 0.5 ? b.d : b.w) / 8, u.getY(i) * b.h / 8);
        const k = Math.abs(ny) > 0.5 ? 0.75 : 1;
        col.push(c.r * k, c.g * k, c.b * k);
      }
      const gi = geo.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + base);
      geo.dispose();
      // Roof clutter on some: an AC box or a mast with a red light.
      if (b.style === 1) roofBox(group, b);
      if (b.style === 2 && b.h > 60) mast(group, b);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const towers = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: windowTex(), vertexColors: true }));
    towers.matrixAutoUpdate = false;
    group.add(towers);
    // Streetlights along the avenue.
    const lampGeo = new THREE.CylinderGeometry(0.12, 0.18, 7, 5); lampGeo.translate(0, 3.5, 0);
    const headGeo = new THREE.BoxGeometry(1.4, 0.3, 0.5); headGeo.translate(0.5, 7, 0);
    const n = Math.floor(T.len / 30);
    const lamps = new THREE.InstancedMesh(lampGeo, lambert(0x2f3442), n * 2);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = T.at(i * 30 + 10), hl = Math.hypot(a.tx, a.tz) || 1;
      [-1, 1].forEach(function (sd) {
        v.set(a.x - a.tz / hl * 13 * sd, 0, a.z + a.tx / hl * 13 * sd);
        q.setFromEuler(e.set(0, U.yawTo(a.tx, a.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 0));
        m4.compose(v, q, s);
        lamps.setMatrixAt(k, m4); heads.setMatrixAt(k, m4); k++;
      });
    }
    group.add(lamps, heads);
  }
  function roofBox(group, b) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.35, 2.5, b.d * 0.3), lambert(0x8a8f9c));
    m.position.set(b.x + b.w * 0.15, b.h + 1.25, b.z - b.d * 0.15);
    group.add(m);
  }
  function mast(group, b) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 12, 5), lambert(0x3a4256));
    m.position.set(b.x, b.h + 6, b.z);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    l.position.y = 6.2; m.add(l);
    group.add(m);
  }

  // A flat strip along the line (avenue surface, lane lines).
  function ribbon(T, half, color, y, off) {
    off = off || 0;
    const n = Math.floor(T.len / 4), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = T.at(i * 4), hl = Math.hypot(a.tx, a.tz) || 1, sx = -a.tz / hl, sz = a.tx / hl;
      pos.push(a.x + sx * (off - half), y, a.z + sz * (off - half), a.x + sx * (off + half), y, a.z + sz * (off + half));
      if (i < n) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, fog: true }));
    m.matrixAutoUpdate = false;
    return m;
  }

  // ------------------------------------------------------------------ mountain
  const MPAL = { grass: 0x8fd16a, grassDark: 0x79bf58, hill: 0x5f9b48, olive: 0x8aa05a, rock: 0x9c8a78, snow: 0xf4f7fb, trunk: 0x7a4f35, pine: 0x2f6b3c, pine2: 0x3f8048 };
  function mountain(group, T) {
    const G = T.terrainGrid, n = G.n, N1 = n + 1;
    const pos = new Float32Array(N1 * N1 * 3), col = new Float32Array(N1 * N1 * 3);
    const c = new THREE.Color(), cB = new THREE.Color();
    const rng = U.rng(7);
    for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) {
      const k = iz * N1 + ix, h = G.H[k], d = G.near[k];
      pos[k * 3] = G.x0 + ix * G.cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = G.z0 + iz * G.cell;
      const hx = G.H[iz * N1 + Math.min(n, ix + 1)] - G.H[iz * N1 + Math.max(0, ix - 1)];
      const hz = G.H[Math.min(n, iz + 1) * N1 + ix] - G.H[Math.max(0, iz - 1) * N1 + ix];
      const slope = Math.hypot(hx, hz) / (G.cell * 2);
      if (d < 24 && h < 40) c.setHex(((ix + iz) & 1) ? MPAL.grass : MPAL.grassDark);
      else {
        c.setHex(MPAL.hill).lerp(cB.setHex(MPAL.olive), U.clamp((h - 15) / 45, 0, 1));
        if (slope > 0.5) c.lerp(cB.setHex(MPAL.rock), U.clamp((slope - 0.5) * 2.2, 0, 1));
        if (h > 95) c.lerp(cB.setHex(MPAL.snow), U.clamp((h - 95) / 25, 0, 1));
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
    group.add(m);
    // Pines on the lower slopes, rocks higher up.
    const trees = [], rocks = [];
    for (let i = 0; i < 4000 && trees.length < 700; i++) {
      const x = G.x0 + 20 + rng() * (G.size - 40), z = G.z0 + 20 + rng() * (G.size - 40);
      const nb = T.nearest(x, z);
      if (nb.d < 26 || nb.d > 260) continue;
      if (Math.hypot(x - T.stand.x, z - T.stand.z) < 18) continue;
      const h = T.terrain(x, z);
      if (h > 92) { if (rng() < 0.15) rocks.push([x, h, z, 1.5 + rng() * 3, rng() * 6]); continue; }
      if (rng() < 0.1) rocks.push([x, h, z, 0.8 + rng() * 2.2, rng() * 6]);
      else trees.push([x, h, z, 0.9 + rng() * 0.9, rng()]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 5); trunkGeo.translate(0, 1.5, 0);
    const leafGeo = new THREE.ConeGeometry(2.4, 9, 6); leafGeo.translate(0, 7, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(MPAL.trunk), trees.length);
    const leaf = new THREE.InstancedMesh(leafGeo, lambert(0xffffff), trees.length);
    trees.forEach(function (t, i) {
      p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * (0.9 + t[4] * 0.4), t[3]); q.setFromEuler(e.set(0, t[4] * 6, 0));
      m4.compose(p, q, s);
      trunk.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4);
      leaf.setColorAt(i, c.setHex(t[4] < 0.5 ? MPAL.pine : MPAL.pine2));
    });
    const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(MPAL.rock), rocks.length);
    rocks.forEach(function (r, i) {
      p.set(r[0], r[1] + r[3] * 0.3, r[2]); s.set(r[3] * 1.3, r[3], r[3]); q.setFromEuler(e.set(r[4], r[4] * 2, 0));
      rock.setMatrixAt(i, m4.compose(p, q, s));
    });
    [trunk, leaf, rock].forEach(function (x) { x.frustumCulled = false; group.add(x); });
  }

  // ------------------------------------------------------------------ shared bits
  function chevrons(T) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -0.6); shape.lineTo(0, 0.9); shape.lineTo(1.6, -0.6); shape.lineTo(1.6, -1.4); shape.lineTo(0, 0.1); shape.lineTo(-1.6, -1.4);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const count = Math.floor(T.len / 14);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, depthWrite: false }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = T.at(i * 14 + 5);
      p.set(a.x, T.ground(a.x, a.z) + 0.08, a.z);
      e.set(0, U.yawTo(a.tx, a.tz), 0);
      im.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s));
    }
    im.renderOrder = 1;
    return im;
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
      const a = rng() * Math.PI * 2, r = 420 + rng() * 300;
      cl.position.set(90 + Math.cos(a) * r, 210 + rng() * 90, 60 + Math.sin(a) * r);
      cl.rotation.y = rng() * 6;
      group.add(cl);
    }
    return group;
  }

  function pads(T) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(2.4, 0.2, 2.4);
    const mat = lambert(0x2b3245);
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

  // The pilots' stand: a deck with a canopy beside the start. Pilot i stands at slot i.
  function stand(T) {
    const st = T.stand, root = new THREE.Group();
    root.position.set(st.x, st.y, st.z);
    root.rotation.y = st.yaw;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 7), lambert(0x6b7690));
    deck.position.set(0, 0.4, 0); root.add(deck);
    const step = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 3), lambert(0x7b86a0));
    step.position.set(0, 1.05, 2); root.add(step);
    const rail = lambert(0xffd23f);
    const top = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.12), rail);
    top.position.set(0, 1.85, -3.3); root.add(top);
    for (let i = -4; i <= 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), rail); p.position.set(i * 2.2, 1.3, -3.3); root.add(p); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.3, 8), lambert(0xff5a3c));
    roof.position.set(0, 5.2, 0.3); roof.rotation.x = -0.08; root.add(roof);
    [-9, 9].forEach(function (x) { [-3.2, 3.6].forEach(function (z) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.6, 6), lambert(0x3a4256));
      p.position.set(x, 3, z); root.add(p);
    }); });
    const slots = [];
    for (let i = 0; i < 8; i++) slots.push({ x: (i - 3.5) * 2.1, y: 0.8, z: -1.6 });
    return { root: root, slots: slots };
  }

  DR.World = W;
})(globalThis.DR);
