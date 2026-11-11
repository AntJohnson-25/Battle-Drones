// The two courses, City and Mountain: a closed flight line the target drones flee
// along, plus the ground (and, in the city, the buildings) as a height function.
// Pure data and maths (no three.js), so whole rounds run in Node for tests.
// Every player builds the same course from the same numbers.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;

  // Centreline control points [x, y (height), z] in metres.
  const COURSES = {
    // Downtown: a long avenue, a climb between towers, a plaza swoop, the riverside and back.
    city: {
      name: "city", ceiling: 112, boundary: 60,
      points: [
        [0, 12, 170], [0, 14, 60], [6, 18, -50], [55, 26, -125], [150, 34, -140], [225, 22, -85],
        [235, 14, 10], [190, 11, 75], [125, 20, 60], [85, 30, 120], [95, 18, 205], [40, 13, 265],
        [-45, 12, 265], [-90, 16, 210], [-55, 12, 185]
      ]
    },
    // Alpine: valley floor, over a high col, down a gorge, round the lake and back up.
    mountain: {
      name: "mountain", ceiling: 160, boundary: 70,
      points: [
        [0, 8, 190], [0, 10, 75], [20, 16, -25], [75, 38, -115], [165, 34, -175], [255, 12, -155],
        [310, 8, -75], [295, 14, 0], [240, 22, 30], [190, 9, -5], [130, 7, 40], [145, 18, 125],
        [115, 34, 215], [50, 24, 300], [-40, 14, 325], [-75, 10, 275], [-45, 9, 230]
      ]
    }
  };
  const SAMPLES = 2400;

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function build(course) {
    const C = COURSES[course] || COURSES.city;
    const POINTS = C.points, n = POINTS.length;
    const raw = [];
    for (let i = 0; i < SAMPLES; i++) {
      const f = (i / SAMPLES) * n, k = Math.floor(f), t = f - k;
      const P = [POINTS[(k - 1 + n) % n], POINTS[k % n], POINTS[(k + 1) % n], POINTS[(k + 2) % n]];
      raw.push([0, 1, 2].map(function (c) { return catmull(P[0][c], P[1][c], P[2][c], P[3][c], t); }));
    }
    const cum = [0];
    for (let i = 1; i <= SAMPLES; i++) {
      const a = raw[i - 1], b = raw[i % SAMPLES];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const len = cum[SAMPLES];
    const M = Math.round(len);
    const pts = new Float32Array(M * 3), tan = new Float32Array(M * 3);
    let j = 0;
    for (let i = 0; i < M; i++) {
      const s = (i / M) * len;
      while (cum[j + 1] < s) j++;
      const u = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      const a = raw[j], b = raw[(j + 1) % SAMPLES];
      for (let c = 0; c < 3; c++) pts[i * 3 + c] = a[c] + (b[c] - a[c]) * u;
    }
    for (let i = 0; i < M; i++) {
      const a = (i - 1 + M) % M, b = (i + 1) % M;
      let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      tan[i * 3] = tx / l; tan[i * 3 + 1] = ty / l; tan[i * 3 + 2] = tz / l;
    }
    const step = len / M;

    const T = { course: C.name, len: len, M: M, pts: pts, tan: tan, ceiling: C.ceiling, boundary: C.boundary };
    T.at = function (s) {
      s = ((s % len) + len) % len;
      const f = s / step, i = Math.floor(f) % M, k = (i + 1) % M, u = f - Math.floor(f);
      return {
        x: pts[i * 3] + (pts[k * 3] - pts[i * 3]) * u, y: pts[i * 3 + 1] + (pts[k * 3 + 1] - pts[i * 3 + 1]) * u,
        z: pts[i * 3 + 2] + (pts[k * 3 + 2] - pts[i * 3 + 2]) * u,
        tx: tan[i * 3], ty: tan[i * 3 + 1], tz: tan[i * 3 + 2]
      };
    };
    T.nearest = function (x, z, hint) {
      let best = -1, bd = Infinity;
      if (hint !== undefined && hint >= 0) {
        for (let o = -60; o <= 60; o++) {
          const i = ((hint + o) % M + M) % M;
          const d = (pts[i * 3] - x) * (pts[i * 3] - x) + (pts[i * 3 + 2] - z) * (pts[i * 3 + 2] - z);
          if (d < bd) { bd = d; best = i; }
        }
        if (bd < 900) return { i: best, s: best * step, d: Math.sqrt(bd) };
      }
      for (let i = 0; i < M; i += 2) {
        const d = (pts[i * 3] - x) * (pts[i * 3] - x) + (pts[i * 3 + 2] - z) * (pts[i * 3 + 2] - z);
        if (d < bd) { bd = d; best = i; }
      }
      return { i: best, s: best * step, d: Math.sqrt(bd) };
    };
    // Signed distance from a to b along the loop, -len/2..len/2.
    T.ahead = function (a, b) { const d = b - a; return ((d % len) + len * 1.5) % len - len / 2; };

    T.startS = 40;
    // Launch pads: two rows of four behind the start, facing down the line.
    T.grid = [];
    for (let k = 0; k < 8; k++) {
      const row = Math.floor(k / 4), col = k % 4;
      const p = T.at(T.startS - 14 - row * 7);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      const o = (col - 1.5) * 3.2 + (row % 2 ? 0.8 : -0.8);
      T.grid.push({ x: p.x + sx * o, z: p.z + sz * o, yaw: U.yawTo(p.tx, p.tz) });
    }
    // The pilots' stand: beside the start, on the left, facing the line.
    {
      const p = T.at(T.startS - 30);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      const x = p.x - sx * 30, z = p.z - sz * 30;
      T.stand = { x: x, z: z, yaw: U.yawTo(sx, sz) };
    }

    if (C.name === "city") buildCity(T); else buildMountain(T);
    T.grid.forEach(function (g) { g.y = T.ground(g.x, g.z) + 0.25; });
    T.stand.y = T.ground(T.stand.x, T.stand.z);
    return T;
  }

  // ------------------------------------------------------------------ city
  // Flat streets with blocks of towers. T.terrain is the top of whatever is
  // there (a roof, or the street), so flying into a wall bonks you off it.
  const BLOCK = 34, CX0 = -300, CZ0 = -300, CN = 22;   // 22 x 22 blocks, 748 m a side
  function buildCity(T) {
    const rng = U.rng(2026);
    const cells = new Int32Array(CN * CN).fill(-1);
    const B = [];
    let hint = -1;
    const st = T.stand;
    for (let iz = 0; iz < CN; iz++) {
      for (let ix = 0; ix < CN; ix++) {
        const cx = CX0 + (ix + 0.5) * BLOCK, cz = CZ0 + (iz + 0.5) * BLOCK;
        const w = 16 + rng() * 12, d = 16 + rng() * 12, r1 = rng(), r2 = rng(), r3 = rng();
        const nb = T.nearest(cx, cz, hint);
        hint = nb.i;
        const half = Math.hypot(w, d) / 2;
        if (nb.d - half < 21) continue;                        // keep the flight corridor clear
        if (Math.hypot(cx - st.x, cz - st.z) < 30 + half) continue;  // and the stand
        if (r3 < 0.08 && nb.d > 60) continue;                    // the odd empty lot / plaza
        const near = nb.d < 70;
        const h = Math.round(near ? 22 + r1 * 40 + (r2 > 0.8 ? 30 : 0) : 40 + r1 * 80);
        // Setbacks: taller towers step in once or twice as they rise.
        const r4 = rng(), r5 = rng();
        const n = h > 70 ? (r4 < 0.55 ? 3 : 2) : h > 35 ? (r4 < 0.5 ? 2 : 1) : 1;
        const tiers = [];
        for (let k = 0; k < n; k++) {
          const f = n === 1 ? 1 : k === n - 1 ? 1 : (k + 1) / n * (0.75 + r5 * 0.2);
          const s = 1 - k * 0.2;
          tiers.push({ w: w * s, d: d * s, top: Math.round(h * f) });
        }
        // A billboard on the wall that faces the line, on some buildings near it.
        let board = null;
        if (nb.d < 90 && r3 > 0.45 && tiers[0].top > 20) {
          const lx = T.pts[nb.i * 3] - cx, lz = T.pts[nb.i * 3 + 2] - cz;
          const ax = Math.abs(lx) > Math.abs(lz);
          board = { nx: ax ? Math.sign(lx) : 0, nz: ax ? 0 : Math.sign(lz), y: Math.min(tiers[0].top - 5, 10 + r5 * 16), ad: Math.floor(r4 * 8) };
        }
        cells[iz * CN + ix] = B.length;
        B.push({ x: cx, z: cz, w: w, d: d, h: h, tiers: tiers, tint: r2, style: Math.floor(r3 * 3) % 3, board: board, roof: Math.floor(r5 * 4) });
      }
    }
    T.buildings = B;
    T.ground = function () { return 0; };
    T.terrain = function (x, z) {
      const ix = Math.floor((x - CX0) / BLOCK), iz = Math.floor((z - CZ0) / BLOCK);
      if (ix < 0 || iz < 0 || ix >= CN || iz >= CN) return 0;
      const k = cells[iz * CN + ix];
      if (k < 0) return 0;
      const b = B[k], dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
      for (let i = b.tiers.length - 1; i >= 0; i--) {
        const t = b.tiers[i];
        if (dx <= t.w / 2 && dz <= t.d / 2) return t.top;
      }
      return 0;
    };
    T.extent = { x0: CX0, z0: CZ0, size: CN * BLOCK };
  }

  // ------------------------------------------------------------------ mountain
  // A valley along the line, steep slopes either side and big peaks beyond.
  const T0X = -420, T0Z = -460, TSIZE = 1000, TCELL = 8, TN = TSIZE / TCELL;
  function buildMountain(T) {
    const N1 = TN + 1;
    const H = new Float32Array(N1 * N1);
    const near = new Float32Array(N1 * N1);
    let hint = -1;
    for (let iz = 0; iz < N1; iz++) {
      for (let ix = 0; ix < N1; ix++) {
        const x = T0X + ix * TCELL, z = T0Z + iz * TCELL;
        const nb = T.nearest(x, z, hint);
        hint = nb.i;
        const ty = T.pts[nb.i * 3 + 1];
        const under = Math.max(0, ty - 12);
        const n1 = Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.009 + 0.4);
        const n2 = Math.sin(x * 0.029 + z * 0.017) * 0.5 + Math.sin(z * 0.041 - x * 0.023) * 0.3;
        const n3 = Math.abs(Math.sin(x * 0.006 - 0.7) * Math.cos(z * 0.0055 + 1.1));
        const floor = under + n2 * 0.8;
        const slopes = under + 20 + 26 * (n1 * 0.5 + 0.5) + 8 * n2;
        const peaks = 70 + 120 * n3 + 25 * (n1 * 0.5 + 0.5) + 12 * n2;
        let h = U.lerp(floor, slopes, U.ease((nb.d - 26) / 45));
        h = U.lerp(h, Math.max(h, peaks), U.ease((nb.d - 90) / 140));
        H[iz * N1 + ix] = h;
        near[iz * N1 + ix] = nb.d;
      }
    }
    T.terrainGrid = { x0: T0X, z0: T0Z, size: TSIZE, cell: TCELL, n: TN, H: H, near: near };
    T.terrain = function (x, z) {
      const fx = U.clamp((x - T0X) / TCELL, 0, TN - 1e-4), fz = U.clamp((z - T0Z) / TCELL, 0, TN - 1e-4);
      const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
      const a = H[iz * N1 + ix], b = H[iz * N1 + ix + 1], c = H[(iz + 1) * N1 + ix], d = H[(iz + 1) * N1 + ix + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    T.ground = T.terrain;
    T.extent = { x0: T0X, z0: T0Z, size: TSIZE };
  }

  DR.Track = { build: build, COURSES: Object.keys(COURSES) };
})(globalThis.DR);
