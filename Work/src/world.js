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
    city: { skyTop: 0x3566d6, horizon: 0xffc8a0, fog: 0xe6c6b2, fogNear: 260, fogFar: 980, hemiG: 0x5b5f6e, sun: 0xffe2c0 },
    mountain: { skyTop: 0x5a86c8, horizon: 0xeef3fb, fog: 0xe6edf7, fogNear: 240, fogFar: 950, hemiG: 0xb4c4de, sun: 0xfff4e6 },
    dunes: { skyTop: 0x2f86e6, horizon: 0xffe3b0, fog: 0xf3dcae, fogNear: 300, fogFar: 1050, hemiG: 0xb98a4a, sun: 0xfff0cc }
  };
  W.LOOK = LOOK;
  function lambert(color, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra || {})); }

  // Shared once: sky dome, lights, clouds.
  W.init = function (scene) {
    W.scene = scene;
    W.sky = sky();
    scene.add(W.sky);
    // A strong sun over a softer sky light: faces read as clearly lit or clearly in shade.
    W.hemi = new THREE.HemisphereLight(0xdcefff, 0x6b8f4e, 1.0);
    scene.add(W.hemi);
    W.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    W.sun.position.set(-160, 260, 120);
    scene.add(W.sun);
    scene.add(clouds());
  };

  // Show one course (building it the first time).
  W.show = function (T) {
    if (!W.built[T.course]) {
      const g = new THREE.Group();
      if (T.course === "city") city(g, T); else if (T.course === "dunes") dunes(g, T); else mountain(g, T);
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
    if (!W.snow) { W.snow = snowfall(); W.scene.add(W.snow); }
    W.snow.visible = T.course === "mountain";
  };

  // Light snowfall on the mountain: a box of flakes that stays round the camera,
  // each one drifting down and wrapping back to the top.
  const SNOW = { n: 900, w: 90, h: 50 };
  function snowfall() {
    const pos = new Float32Array(SNOW.n * 3), r = U.rng(31);
    for (let i = 0; i < SNOW.n; i++) { pos[i * 3] = r() * SNOW.w; pos[i * 3 + 1] = r() * SNOW.h; pos[i * 3 + 2] = r() * SNOW.w; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.34, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    mat.onBeforeCompile = function (sh) {
      // Wrap each flake into the box round the camera, in the shader: no per-frame uploads.
      sh.uniforms.uOff = W.snowOff = { value: new THREE.Vector3() };
      sh.uniforms.uCam = W.snowCam = { value: new THREE.Vector3() };
      sh.vertexShader = "uniform vec3 uOff; uniform vec3 uCam;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "vec3 transformed = mod(position + uOff - uCam, vec3(" + SNOW.w.toFixed(1) + ", " + SNOW.h.toFixed(1) + ", " + SNOW.w.toFixed(1) + ")) - vec3(" + (SNOW.w / 2).toFixed(1) + ", " + (SNOW.h / 2).toFixed(1) + ", " + (SNOW.w / 2).toFixed(1) + ") + uCam;");
    };
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    p.renderOrder = 3;
    return p;
  }
  let snowT = 0;
  W.tick = function (dt, cam) {
    if (!W.snow || !W.snow.visible || !W.snowOff) return;
    snowT += dt;
    W.snowOff.value.set(Math.sin(snowT * 0.3) * 4 + snowT * 1.2, -snowT * 4.5, snowT * 0.6);
    W.snowCam.value.copy(cam);
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
    // Towers. Everything is merged into a few big meshes (one per wall style, one
    // for trim, one for billboards), so hundreds of detailed buildings stay cheap.
    const walls = [bucket(), bucket(), bucket()], trim = bucket(), boards = bucket(), glow = bucket();
    const TINT = [[0xffffff, 0xe8ecf4, 0xd6dde9, 0xf2e8da], [0xffffff, 0xdff1f4, 0xe6e9ff, 0xd8e6ef], [0xffffff, 0xf0ddd2, 0xe2cfc0, 0xffe9d6]];
    const TRIM = [0xd9dde6, 0x9aa6b8, 0xe6dccb];
    const c = new THREE.Color(), ct = new THREE.Color();
    T.buildings.forEach(function (b) {
      c.setHex(TINT[b.style][Math.floor(b.tint * 4) % 4]);
      ct.setHex(TRIM[b.style]);
      // Sidewalk round the block.
      box(trim, b.x, 0.12, b.z, b.w + 6, 0.24, b.d + 6, 0xa7abb5);
      let bottom = 0;
      b.tiers.forEach(function (t, k) {
        box(walls[b.style], b.x, (bottom + t.top) / 2, b.z, t.w, t.top - bottom, t.d, c, true);
        // Cornice ledge at the top of each tier, and a parapet round the roof.
        box(trim, b.x, t.top - 0.3, b.z, t.w + 0.9, 0.6, t.d + 0.9, ct);
        const pw = 0.4, ph = 1.1, y = t.top + ph / 2;
        box(trim, b.x, y, b.z - t.d / 2 + pw / 2, t.w, ph, pw, ct);
        box(trim, b.x, y, b.z + t.d / 2 - pw / 2, t.w, ph, pw, ct);
        box(trim, b.x - t.w / 2 + pw / 2, y, b.z, pw, ph, t.d, ct);
        box(trim, b.x + t.w / 2 - pw / 2, y, b.z, pw, ph, t.d, ct);
        // Corner pilasters on the base tier of office and brick towers.
        if (k === 0 && b.style !== 1) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
          box(trim, b.x + s[0] * (t.w / 2), (bottom + t.top) / 2, b.z + s[1] * (t.d / 2), 0.9, t.top - bottom, 0.9, ct);
        });
        // Glass-tower fins: thin vertical mullions standing off the wall.
        if (b.style === 1) for (let f = -2; f <= 2; f++) {
          box(trim, b.x + f * t.w / 5, (bottom + t.top) / 2, b.z - t.d / 2 - 0.15, 0.18, t.top - bottom, 0.3, 0x6c7a90);
          box(trim, b.x + f * t.w / 5, (bottom + t.top) / 2, b.z + t.d / 2 + 0.15, 0.18, t.top - bottom, 0.3, 0x6c7a90);
        }
        bottom = t.top;
      });
      // Street level: a shopfront band with an awning.
      const t0 = b.tiers[0];
      box(trim, b.x, 2.3, b.z, t0.w + 0.3, 4.6, t0.d + 0.3, 0x2b3446);
      box(glow, b.x, 2.1, b.z, t0.w + 0.36, 2.2, t0.d + 0.36, b.tint > 0.5 ? 0xffe2a6 : 0xbfe8ff);
      box(trim, b.x, 4.8, b.z, t0.w + 2.2, 0.25, t0.d + 2.2, [0xd94f3d, 0x2f8f6b, 0x3a64c4, 0xe0a030][b.roof]);
      // Roof clutter (placed by track.js, which also makes it solid).
      b.props.forEach(function (p) {
        if (p.k === "water") waterTower(trim, p.x, p.y, p.z);
        else if (p.k === "box") box(trim, p.x, p.y, p.z, p.w, p.h, p.d, p.w > 2.3 ? 0x8a8f9c : 0x9aa0ad);
        else mast(group, p.x, p.y, p.z);
      });
      if (b.board) billboard(boards, trim, b);
    });
    const tex = wallTextures();
    walls.forEach(function (bk, i) { addBucket(group, bk, new THREE.MeshLambertMaterial({ map: tex[i], vertexColors: true })); });
    addBucket(group, trim, new THREE.MeshLambertMaterial({ vertexColors: true }));
    addBucket(group, glow, new THREE.MeshBasicMaterial({ vertexColors: true }));
    addBucket(group, boards, new THREE.MeshBasicMaterial({ map: adAtlas(), vertexColors: true }));
    // Streetlights along the avenue.
    const lampGeo = new THREE.CylinderGeometry(0.12, 0.18, 7, 5); lampGeo.translate(0, 3.5, 0);
    const headGeo = new THREE.BoxGeometry(1.4, 0.3, 0.5); headGeo.translate(0.5, 7, 0);
    const lamps = new THREE.InstancedMesh(lampGeo, lambert(0x2f3442), T.lamps.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), T.lamps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    T.lamps.forEach(function (L, k) {
      m4.compose(v.set(L.x, 0, L.z), q.setFromEuler(e.set(0, L.yaw, 0)), s);
      lamps.setMatrixAt(k, m4); heads.setMatrixAt(k, m4);
    });
    group.add(lamps, heads);
  }
  function mast(group, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 12, 5), lambert(0x3a4256));
    m.position.set(x, y + 6, z);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    l.position.y = 6.2; m.add(l);
    group.add(m);
  }

  // ---- merging: many boxes into one geometry per material
  function bucket() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
  const _c = new THREE.Color();
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  // A box centred at (cx, cy, cz). wallUV: the window tile is laid out in world
  // metres (8 m wide, 7 m tall = two floors), so it lines up across tiers.
  function box(bk, cx, cy, cz, w, h, d, color, wallUV) {
    const p = BOX.attributes.position, n = BOX.attributes.normal, u = BOX.attributes.uv;
    const col = color && color.isColor ? color : _c.setHex(color);
    const base = bk.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const x = cx + p.getX(i) * w, y = cy + p.getY(i) * h, z = cz + p.getZ(i) * d;
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      bk.pos.push(x, y, z); bk.nor.push(nx, ny, nz);
      if (wallUV) {
        if (Math.abs(ny) > 0.5) bk.uv.push(0.5, 0.985);
        else bk.uv.push((Math.abs(nx) > 0.5 ? z * -nx : x * nz) / 8, y / 7);
      } else bk.uv.push(u.getX(i), u.getY(i));
      const k = ny > 0.5 ? 0.92 : ny < -0.5 ? 0.6 : 1;
      bk.col.push(col.r * k, col.g * k, col.b * k);
    }
    const gi = BOX.index.array;
    for (let i = 0; i < gi.length; i++) bk.idx.push(gi[i] + base);
  }
  function addBucket(group, bk, mat) {
    if (!bk.idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bk.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(bk.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(bk.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(bk.col, 3));
    geo.setIndex(bk.idx);
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ---- wall textures: office (concrete + windows), glass curtain wall, brick
  function wallTextures() {
    const rng = U.rng(5);
    function canvas(draw) {
      // Drawn at 4x (512 px) so windows stay sharp up close and at a glancing angle.
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const x = c.getContext("2d");
      x.scale(4, 4);
      draw(x);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = W.aniso || 8;
      return t;
    }
    function glass(x, X, Y, w, h, lit, base) {
      const g = x.createLinearGradient(0, Y, 0, Y + h);
      if (lit) { g.addColorStop(0, "#fff1c8"); g.addColorStop(1, "#ffcf7a"); }
      else { g.addColorStop(0, base[0]); g.addColorStop(0.55, base[1]); g.addColorStop(1, base[2]); }
      x.fillStyle = g; x.fillRect(X, Y, w, h);
      // A diagonal sky reflection.
      if (!lit) { x.fillStyle = "rgba(255,255,255,0.13)"; x.beginPath(); x.moveTo(X, Y + h * 0.6); x.lineTo(X + w * 0.5, Y); x.lineTo(X + w * 0.75, Y); x.lineTo(X, Y + h); x.fill(); }
    }
    const office = canvas(function (x) {
      x.fillStyle = "#e4e1da"; x.fillRect(0, 0, 128, 128);
      for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) {
        const X = 8 + b * 64, Y = 12 + f * 64;
        x.fillStyle = "#b9b5ad"; x.fillRect(X - 3, Y - 3, 54, 46);                 // recess
        glass(x, X, Y, 48, 40, rng() < 0.3, ["#a9c4de", "#4f6a8c", "#2e4260"]);
        x.fillStyle = "#d8d4cc"; x.fillRect(X + 23, Y, 3, 40); x.fillRect(X, Y + 18, 48, 2);   // mullions
      }
      for (let f = 0; f < 2; f++) { x.fillStyle = "#cfcac0"; x.fillRect(0, f * 64, 128, 6); x.fillStyle = "#f4f2ec"; x.fillRect(0, f * 64, 128, 2); }
    });
    const curtain = canvas(function (x) {
      for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) glass(x, b * 32, f * 32, 32, 32, rng() < 0.12, ["#c6e6f0", "#5e95ad", "#2c5a74"]);
      x.fillStyle = "#3b4d60";
      for (let i = 0; i <= 4; i++) { x.fillRect(i * 32 - 1, 0, 2, 128); x.fillRect(0, i * 32 - 1, 128, 2); }
      x.fillStyle = "#8fa3b5"; x.fillRect(0, 0, 128, 3); x.fillRect(0, 64, 128, 3);
    });
    const brick = canvas(function (x) {
      x.fillStyle = "#9c5a44"; x.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 32; r++) for (let k = 0; k < 9; k++) {
        const v = 0.85 + rng() * 0.3;
        x.fillStyle = "rgb(" + Math.round(170 * v) + "," + Math.round(96 * v) + "," + Math.round(74 * v) + ")";
        x.fillRect(k * 16 - (r % 2) * 8, r * 4, 15, 3);
      }
      for (let f = 0; f < 2; f++) for (let b = 0; b < 3; b++) {
        const X = 10 + b * 40, Y = 16 + f * 64;
        x.fillStyle = "#efe7da"; x.fillRect(X - 3, Y - 3, 26, 40);                  // white frame
        glass(x, X, Y, 20, 34, rng() < 0.35, ["#9fb6c8", "#4b5f78", "#2a3648"]);
        x.fillStyle = "#efe7da"; x.fillRect(X + 9, Y, 2, 34); x.fillRect(X - 5, Y + 36, 30, 4);   // sash, sill
      }
      x.fillStyle = "#cfc4b2"; x.fillRect(0, 0, 128, 4);
    });
    return [office, curtain, brick];
  }

  // ---- billboards: eight made-up ads in one atlas (2 x 4 cells)
  const ADS = [
    ["ZAP COLA", "#ff3d5a", "#fff", "taste the buzz"], ["HOP FM 98.7", "#1d2230", "#c4f35b", "all hits, all day"],
    ["DRONE DASH", "#3a64c4", "#ffd23f", "same-day delivery"], ["SKYLINE BANK", "#0f5c4a", "#fff", "built to last"],
    ["NOODLE KING", "#ffb000", "#7a1f10", "open late"], ["BOLT SNEAKERS", "#111", "#ff6b5a", "go faster"],
    ["CITY ZOO", "#5bbf63", "#fff", "now with pandas"], ["PIXEL ARCADE", "#7a3cff", "#4dffe0", "insert coin"]
  ];
  function adAtlas() {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const x = c.getContext("2d");
    ADS.forEach(function (a, i) {
      const X = (i % 2) * 512, Y = Math.floor(i / 2) * 128;
      const g = x.createLinearGradient(X, Y, X + 512, Y + 128);
      g.addColorStop(0, a[1]); g.addColorStop(1, shade(a[1]));
      x.fillStyle = g; x.fillRect(X, Y, 512, 128);
      x.fillStyle = "rgba(255,255,255,0.08)";
      for (let s = 0; s < 6; s++) { x.beginPath(); x.arc(X + 420 + s * 6, Y + 64, 90 - s * 14, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = a[2]; x.font = "900 58px system-ui, sans-serif"; x.textBaseline = "middle";
      x.fillText(a[0], X + 28, Y + 52, 460);
      x.globalAlpha = 0.85; x.font = "700 24px system-ui, sans-serif"; x.fillText(a[3], X + 30, Y + 100, 440); x.globalAlpha = 1;
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = W.aniso || 8;
    return t;
  }
  function shade(hex) { const k = new THREE.Color(hex).multiplyScalar(0.55); return "#" + k.getHexString(); }

  // A 12 x 3 m panel standing 0.8 m off the wall on struts, with a frame.
  function billboard(boards, trim, b) {
    const B = b.board;
    const along = B.nx !== 0 ? "z" : "x";
    const half = B.half, span = B.span, H = B.H, fx = B.fx, fz = B.fz;
    // Frame and struts.
    box(trim, fx - B.nx * 0.1, B.y, fz - B.nz * 0.1, along === "z" ? 0.3 : span + 0.6, H + 0.6, along === "z" ? span + 0.6 : 0.3, 0x2b2f3a);
    [-0.35, 0.35].forEach(function (s) {
      const ox = along === "x" ? s * span : 0, oz = along === "z" ? s * span : 0;
      box(trim, b.x + B.nx * (half + 0.4) + ox, B.y, b.z + B.nz * (half + 0.4) + oz, B.nx ? 0.8 : 0.25, 0.25, B.nz ? 0.8 : 0.25, 0x2b2f3a);
    });
    // The face: a quad with the ad's cell of the atlas, facing out.
    const u0 = (B.ad % 2) * 0.5, v1 = 1 - Math.floor(B.ad / 2) * 0.25, v0 = v1 - 0.25;
    const base = boards.pos.length / 3;
    const px = fx + B.nx * 0.08, pz = fz + B.nz * 0.08;
    // Corners left-to-right as seen from outside.
    const rx = along === "x" ? B.nz : 0, rz = along === "z" ? -B.nx : 0;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      boards.pos.push(px + rx * q[0] * span / 2, B.y + q[1] * H / 2, pz + rz * q[0] * span / 2);
      boards.nor.push(B.nx, 0, B.nz);
      boards.uv.push(q[0] < 0 ? u0 : u0 + 0.5, q[1] < 0 ? v0 : v1);
      boards.col.push(1, 1, 1);
    });
    boards.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
  }

  // A rooftop water tower: legs, a wooden tank and a cone roof, built from boxes.
  function waterTower(trim, x, y, z) {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(trim, x + s[0] * 1.3, y + 1.6, z + s[1] * 1.3, 0.25, 3.2, 0.25, 0x3a3f4a); });
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      box(trim, x + Math.cos(ang) * 1.7, y + 5, z + Math.sin(ang) * 1.7, 1.4, 3.6, 1.4, a % 2 ? 0x8a5a3b : 0x7a4f35);
    }
    box(trim, x, y + 7.1, z, 3.2, 0.6, 3.2, 0x4a4f5c);
    box(trim, x, y + 7.8, z, 2.0, 0.8, 2.0, 0x4a4f5c);
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
  // Snowed in from the valley floor to the peaks: only steep rock shows through.
  const MPAL = { grass: 0xf6f9fd, grassDark: 0xe6eef8, hill: 0xeef3fa, olive: 0xdfe8f4, rock: 0x7f7a80, snow: 0xffffff, trunk: 0x5e4030, pine: 0x24553a, pine2: 0x2f6646 };
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
        if (slope > 0.75) c.lerp(cB.setHex(MPAL.rock), U.clamp((slope - 0.75) * 2.4, 0, 0.9));
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
    // Pines and rocks (placed by track.js, which also makes them solid).
    const trees = T.trees, rocks = T.rocks;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 5); trunkGeo.translate(0, 1.5, 0);
    const leafGeo = new THREE.ConeGeometry(2.4, 9, 6); leafGeo.translate(0, 7, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(MPAL.trunk), trees.length);
    const leaf = new THREE.InstancedMesh(leafGeo, lambert(0xffffff), trees.length);
    // Snow on the pines: a white cap over the top third and a skirt on the lower boughs.
    const capGeo = W.mergeGeos([new THREE.ConeGeometry(1.05, 3.6, 6).translate(0, 9.85, 0), new THREE.ConeGeometry(2.55, 1.1, 6).translate(0, 3.2, 0)]);
    const cap = new THREE.InstancedMesh(capGeo, lambert(0xffffff), trees.length);
    group.add(cap); cap.frustumCulled = false;
    trees.forEach(function (t, i) {
      p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * (0.9 + t[4] * 0.4), t[3]); q.setFromEuler(e.set(0, t[4] * 6, 0));
      m4.compose(p, q, s);
      trunk.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4); cap.setMatrixAt(i, m4);
      leaf.setColorAt(i, c.setHex(t[4] < 0.5 ? MPAL.pine : MPAL.pine2));
    });
    const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(MPAL.rock), rocks.length);
    rocks.forEach(function (r, i) {
      p.set(r[0], r[1] + r[3] * 0.3, r[2]); s.set(r[3] * 1.3, r[3], r[3]); q.setFromEuler(e.set(r[4], r[4] * 2, 0));
      rock.setMatrixAt(i, m4.compose(p, q, s));
    });
    [trunk, leaf, rock].forEach(function (x) { x.frustumCulled = false; group.add(x); });
  }

  // ------------------------------------------------------------------ dunes
  const DPAL = { sand: 0xe9c98a, sandLight: 0xf6dfa6, sandDark: 0xc99a5b, track: 0xdcb878, stone: 0xd9b36c, stoneDark: 0xb88d4c, wet: 0x8a9a5a,
    trunk: 0x8a6238, palm: 0x3f9a4a, palm2: 0x58b05a, rock: 0xa9845a, obelisk: 0xcfa968, gold: 0xffd45a, water: 0x3fb8d8 };
  function dunes(group, T) {
    const G = T.terrainGrid, n = G.n, N1 = n + 1;
    const pos = new Float32Array(N1 * N1 * 3), col = new Float32Array(N1 * N1 * 3);
    const c = new THREE.Color(), cB = new THREE.Color();
    const rng = U.rng(11);
    for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) {
      const k = iz * N1 + ix, h = G.H[k], d = G.near[k];
      pos[k * 3] = G.x0 + ix * G.cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = G.z0 + iz * G.cell;
      const hx = G.H[iz * N1 + Math.min(n, ix + 1)] - G.H[iz * N1 + Math.max(0, ix - 1)];
      const hz = G.H[Math.min(n, iz + 1) * N1 + ix] - G.H[Math.max(0, iz - 1) * N1 + ix];
      const slope = Math.hypot(hx, hz) / (G.cell * 2);
      if (G.kind[k] === 1) {
        // Pyramid: stone courses, banded by height.
        c.setHex((Math.floor(h / 4) & 1) ? DPAL.stone : DPAL.stoneDark);
      } else if (G.kind[k] === 2) c.setHex(DPAL.wet);
      else {
        // The sunlit side of each dune is pale, the lee side darker: reads the shape.
        c.setHex(DPAL.sand).lerp(cB.setHex(hx - hz * 0.4 > 0 ? DPAL.sandDark : DPAL.sandLight), U.clamp(slope * 1.6, 0, 0.85));
        if (d < 16) c.lerp(cB.setHex(DPAL.track), 0.5);
      }
      const j = 0.96 + rng() * 0.07;
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
    // The oasis pool.
    const O = T.oasis;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(O.r * 0.95, 28), new THREE.MeshBasicMaterial({ color: DPAL.water }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(O.x, T.terrain(O.x, O.z) + 0.9, O.z);
    group.add(pool);
    // Gold caps on the pyramids.
    T.pyramids.forEach(function (p) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(p.half * 0.14, p.h * 0.14, 4), new THREE.MeshBasicMaterial({ color: DPAL.gold }));
      cap.rotation.y = Math.PI / 4;
      cap.position.set(p.x, p.h + 6 + p.h * 0.02, p.z);
      group.add(cap);
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    // Obelisks: a tapered shaft with a gold point.
    const shaftGeo = new THREE.CylinderGeometry(0.75, 1.3, 1, 4); shaftGeo.translate(0, 0.5, 0); shaftGeo.rotateY(Math.PI / 4);
    const tipGeo = new THREE.ConeGeometry(0.8, 1.8, 4); tipGeo.translate(0, 0.9, 0); tipGeo.rotateY(Math.PI / 4);
    const shaft = new THREE.InstancedMesh(shaftGeo, lambert(DPAL.obelisk), T.obelisks.length);
    const tip = new THREE.InstancedMesh(tipGeo, new THREE.MeshBasicMaterial({ color: DPAL.gold }), T.obelisks.length);
    T.obelisks.forEach(function (o, i) {
      q.setFromEuler(e.set(0, o[4], 0));
      shaft.setMatrixAt(i, m4.compose(p.set(o[0], o[1] - 0.5, o[2]), q, s.set(1, o[3] - 1.3, 1)));
      tip.setMatrixAt(i, m4.compose(p.set(o[0], o[1] + o[3] - 1.8, o[2]), q, s.set(1, 1, 1)));
    });
    // Ruined columns: fluted drums, some broken short, with a cap slab.
    const colGeo = new THREE.CylinderGeometry(0.85, 1, 1, 8); colGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.BoxGeometry(2.4, 0.5, 2.4); capGeo.translate(0, 0.25, 0);
    const cols = new THREE.InstancedMesh(colGeo, lambert(0xe3cfa0), T.columns.length);
    const caps = new THREE.InstancedMesh(capGeo, lambert(0xcdb682), T.columns.length);
    T.columns.forEach(function (o, i) {
      const h = (4 + o[4] * 5) * o[3];
      q.setFromEuler(e.set(0, o[4] * 6, 0));
      cols.setMatrixAt(i, m4.compose(p.set(o[0], o[1] - 0.5, o[2]), q, s.set(o[3], h, o[3])));
      q.setFromEuler(e.set(o[4] > 0.6 ? 0.25 : 0, o[4] * 6, 0));
      caps.setMatrixAt(i, m4.compose(p.set(o[0], o[1] + h - 0.5, o[2]), q, s.set(o[3], 1, o[3])));
    });
    // Palms: a leaning trunk and a crown of fronds.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 8, 6); trunkGeo.translate(0, 4, 0);
    const frond = new THREE.ConeGeometry(0.9, 4.6, 4); frond.scale(1, 1, 0.22); frond.rotateZ(-Math.PI / 2 + 0.45); frond.translate(2.1, -0.6, 0);
    const crownParts = [];
    for (let a = 0; a < 7; a++) { const f = frond.clone(); f.rotateY(a / 7 * Math.PI * 2); crownParts.push(f); }
    const crownGeo = mergeGeos(crownParts); crownGeo.translate(0, 8.1, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(DPAL.trunk), T.palms.length);
    const crown = new THREE.InstancedMesh(crownGeo, lambert(0xffffff), T.palms.length);
    T.palms.forEach(function (t, i) {
      q.setFromEuler(e.set((t[4] - 0.5) * 0.3, t[4] * 6, (t[4] - 0.5) * 0.25));
      m4.compose(p.set(t[0], t[1] - 0.4, t[2]), q, s.set(t[3], t[3], t[3]));
      trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
      crown.setColorAt(i, c.setHex(t[4] < 0.5 ? DPAL.palm : DPAL.palm2));
    });
    const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(DPAL.rock), T.rocks.length);
    T.rocks.forEach(function (r, i) {
      p.set(r[0], r[1] + r[3] * 0.3, r[2]); s.set(r[3] * 1.3, r[3], r[3]); q.setFromEuler(e.set(r[4], r[4] * 2, 0));
      rock.setMatrixAt(i, m4.compose(p, q, s));
    });
    [shaft, tip, cols, caps, trunk, crown, rock].forEach(function (x) { x.frustumCulled = false; group.add(x); });
  }
  // Several simple geometries (same attributes) into one.
  function mergeGeos(list) {
    const pos = [], nor = [], idx = [];
    list.forEach(function (g0) {
      const g = g0.index ? g0.toNonIndexed() : g0, base = pos.length / 3;
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      for (let i = 0; i < P.length / 3; i++) idx.push(base + i);
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  }
  W.mergeGeos = mergeGeos;

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
