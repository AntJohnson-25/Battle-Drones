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
    },
    // Desert: out between the dunes, past the obelisks, round the pyramids and back by the oasis.
    dunes: {
      name: "dunes", ceiling: 130, boundary: 70,
      points: [
        [0, 10, 180], [0, 12, 60], [-30, 16, -40], [-10, 24, -140], [90, 14, -190], [190, 10, -150],
        [250, 18, -60], [230, 26, 40], [150, 12, 90], [110, 9, 170], [160, 16, 250], [100, 22, 320],
        [0, 12, 330], [-70, 10, 280], [-50, 9, 230]
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
    // Launch pads: one row of eight across the line behind the start. Each pilot
    // walks out to theirs from behind (wx, wz) and launches from the hand.
    T.grid = [];
    {
      const p = T.at(T.startS - 14);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl, fx = p.tx / hl, fz = p.tz / hl;
      for (let k = 0; k < 8; k++) {
        const o = (k - 3.5) * 3.4;
        const x = p.x + sx * o, z = p.z + sz * o;
        T.grid.push({ x: x, z: z, yaw: U.yawTo(p.tx, p.tz), fx: fx, fz: fz, wx: x - fx * 8, wz: z - fz * 8 });
      }
    }
    // The pilots' stand: beside the start, on the left, facing the line.
    {
      const p = T.at(T.startS - 30);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      const x = p.x - sx * 30, z = p.z - sz * 30;
      T.stand = { x: x, z: z, yaw: U.yawTo(sx, sz) };
    }

    T.obs = [];
    // What you've hit when you fly into the scenery itself.
    T.wall = C.name === "city" ? "building" : C.name === "dunes" ? "dune" : "hillside";
    if (C.name === "city") buildCity(T); else if (C.name === "dunes") buildDunes(T); else buildMountain(T);
    T.grid.forEach(function (g) { g.y = T.ground(g.x, g.z) + 0.25; g.wy = T.ground(g.wx, g.wz); });
    T.stand.y = T.ground(T.stand.x, T.stand.z);
    indexObstacles(T);
    return T;
  }

  // ------------------------------------------------------------------ obstacles
  // Everything solid that isn't ground or a building wall: lampposts, billboards,
  // rooftop kit, trees, rocks. Cylinders { c, x, z, r, y0, y1 } and boxes
  // { b, x, z, hx, hz, y0, y1 }, bucketed on a 16 m grid for quick tests.
  const OC = 16;
  function indexObstacles(T) {
    const grid = new Map();
    T.obs.forEach(function (o) {
      const ext = o.c ? o.r : Math.max(o.hx, o.hz);
      for (let ix = Math.floor((o.x - ext) / OC); ix <= Math.floor((o.x + ext) / OC); ix++)
        for (let iz = Math.floor((o.z - ext) / OC); iz <= Math.floor((o.z + ext) / OC); iz++) {
          const k = ix * 65536 + iz;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(o);
        }
    });
    // The obstacle a sphere at (x, y, z) of radius rad touches, or null.
    T.hit = function (x, y, z, rad) {
      const list = grid.get(Math.floor(x / OC) * 65536 + Math.floor(z / OC));
      if (!list) return null;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (y < o.y0 - rad || y > o.y1 + rad) continue;
        if (o.c) { if (Math.hypot(x - o.x, z - o.z) < o.r + rad) return o; }
        else if (Math.abs(x - o.x) < o.hx + rad && Math.abs(z - o.z) < o.hz + rad) return o;
      }
      return null;
    };
    // Is the point inside anything solid (ground, a wall, an obstacle)?
    T.solid = function (x, y, z, rad) { return y - rad < T.terrain(x, z) || !!T.hit(x, y, z, rad); };
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
    // Billboard placement, rooftop kit and streetlights: the view draws exactly
    // these, and they're solid.
    B.forEach(function (b) {
      const top = b.tiers[b.tiers.length - 1], t0 = b.tiers[0];
      b.props = [];
      if (b.roof === 0 && b.style === 2) b.props.push({ k: "water", x: b.x + top.w * 0.2, y: top.top, z: b.z - top.d * 0.15 });
      if (b.roof === 1 || b.roof === 2) {
        b.props.push({ k: "box", x: b.x - top.w * 0.18, y: top.top + 1.2, z: b.z + top.d * 0.12, w: top.w * 0.3, h: 2.4, d: top.d * 0.25 });
        b.props.push({ k: "box", x: b.x + top.w * 0.2, y: top.top + 0.9, z: b.z - top.d * 0.2, w: 2.2, h: 1.8, d: 2.2 });
      }
      if (b.h > 60 && b.roof === 3) b.props.push({ k: "mast", x: b.x, y: top.top, z: b.z });
      b.props.forEach(function (p) {
        if (p.k === "water") T.obs.push({ c: 1, x: p.x, z: p.z, r: 2.5, y0: p.y, y1: p.y + 8.2, kind: "water tower" });
        else if (p.k === "box") T.obs.push({ b: 1, x: p.x, z: p.z, hx: p.w / 2, hz: p.d / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2, kind: "rooftop unit" });
        else T.obs.push({ c: 1, x: p.x, z: p.z, r: 0.5, y0: p.y, y1: p.y + 12.6, kind: "mast" });
      });
      const BB = b.board;
      if (BB) {
        BB.half = (BB.nx !== 0 ? t0.w : t0.d) / 2;
        BB.span = Math.min(12, (BB.nx !== 0 ? t0.d : t0.w) - 3);
        if (BB.span < 6) { b.board = null; return; }
        BB.H = BB.span / 4;
        BB.fx = b.x + BB.nx * (BB.half + 0.8); BB.fz = b.z + BB.nz * (BB.half + 0.8);
        T.obs.push({ b: 1, x: b.x + BB.nx * (BB.half + 0.5), z: b.z + BB.nz * (BB.half + 0.5),
          hx: BB.nx ? 0.55 : BB.span / 2 + 0.3, hz: BB.nx ? BB.span / 2 + 0.3 : 0.55, y0: BB.y - BB.H / 2 - 0.3, y1: BB.y + BB.H / 2 + 0.3, kind: "billboard" });
      }
    });
    T.lamps = [];
    for (let i = 0; i < Math.floor(T.len / 30); i++) {
      const a = T.at(i * 30 + 10), hl = Math.hypot(a.tx, a.tz) || 1;
      [-1, 1].forEach(function (sd) {
        const x = a.x - a.tz / hl * 13 * sd, z = a.z + a.tx / hl * 13 * sd;
        T.lamps.push({ x: x, z: z, yaw: U.yawTo(a.tx, a.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) });
        T.obs.push({ c: 1, x: x, z: z, r: 0.35, y0: 0, y1: 7.4, kind: "lamppost" });
      });
    }
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
    // Pines on the lower slopes, rocks higher up: drawn by the view, solid here.
    const rng = U.rng(77);
    T.trees = []; T.rocks = [];
    let th = -1;
    for (let i = 0; i < 5000 && T.trees.length < 760; i++) {
      const x = T0X + 20 + rng() * (TSIZE - 40), z = T0Z + 20 + rng() * (TSIZE - 40);
      const r1 = rng(), r2 = rng(), r3 = rng();
      const nb = T.nearest(x, z, th); th = nb.i;
      if (nb.d > 260) continue;
      if (Math.hypot(x - T.stand.x, z - T.stand.z) < 18) continue;
      const h = T.terrain(x, z);
      // A few pines near the line so the valley isn't a free corridor.
      if (nb.d < 26 && !(nb.d > 17 && r3 < 0.25 && h < 40)) continue;
      if (h > 92) { if (r1 < 0.15) T.rocks.push([x, h, z, 1.5 + r2 * 3, r3 * 6]); continue; }
      if (r1 < 0.1) T.rocks.push([x, h, z, 0.8 + r2 * 2.2, r3 * 6]);
      else T.trees.push([x, h, z, 0.9 + r2 * 0.9, r3]);
    }
    T.trees.forEach(function (t) { T.obs.push({ c: 1, x: t[0], z: t[2], r: 1.5 * t[3], y0: t[1] - 1, y1: t[1] + 11 * t[3] * (0.9 + t[4] * 0.4), kind: "tree" }); });
    T.rocks.forEach(function (r) { T.obs.push({ c: 1, x: r[0], z: r[2], r: 1.2 * r[3], y0: r[1] - 1, y1: r[1] + 1.3 * r[3], kind: "rock" }); });
  }

  // ------------------------------------------------------------------ dunes
  // Rolling sand with the line running through the troughs, a sea of big dunes
  // beyond, pyramids standing out of it, and obelisks, ruined columns, palms and
  // rocks to fly round. Same height grid as the mountain.
  function buildDunes(T) {
    const N1 = TN + 1;
    const H = new Float32Array(N1 * N1);
    const near = new Float32Array(N1 * N1);
    const kind = new Uint8Array(N1 * N1);     // 1 = pyramid stone, 2 = oasis water's edge
    // Pyramids: only where there's room well away from the line.
    T.pyramids = [];
    [[120, -40, 62, 58], [-160, 120, 46, 44], [340, 150, 52, 50], [40, -330, 70, 66], [-170, -160, 42, 40], [200, 400, 48, 46]].forEach(function (p) {
      const nb = T.nearest(p[0], p[1]);
      if (nb.d > p[3] + 34) T.pyramids.push({ x: p[0], z: p[1], h: p[2], half: p[3] });
    });
    // The oasis: a hollow with a pool beside the line.
    const oa = T.at(T.len * 0.62), ol = Math.hypot(oa.tx, oa.tz) || 1;
    T.oasis = { x: oa.x - oa.tz / ol * 44, z: oa.z + oa.tx / ol * 44, r: 20 };
    let hint = -1;
    for (let iz = 0; iz < N1; iz++) {
      for (let ix = 0; ix < N1; ix++) {
        const x = T0X + ix * TCELL, z = T0Z + iz * TCELL, k = iz * N1 + ix;
        const nb = T.nearest(x, z, hint);
        hint = nb.i;
        const ty = T.pts[nb.i * 3 + 1];
        const under = Math.max(0, ty - 13);
        // Dune crests: sharp ridges that wander, with ripples across them.
        const w = Math.sin(z * 0.011 + 0.6) * 1.3 + Math.sin(x * 0.007 - z * 0.004) * 0.9;
        const ridge = 1 - Math.abs(Math.sin(x * 0.021 + z * 0.008 + w));
        const ridge2 = 1 - Math.abs(Math.sin(z * 0.017 - x * 0.006 + 1.7 + w * 0.6));
        const swell = Math.sin(x * 0.006 + 0.9) * Math.cos(z * 0.0052 - 0.4) * 0.5 + 0.5;
        const floor = under + ridge * ridge * 2.6 + ridge2 * 1.2;
        const low = under + 5 + ridge * ridge * 15 + ridge2 * 5;
        const sea = 14 + ridge * ridge * 30 + ridge2 * 12 + swell * 34;
        let h = U.lerp(floor, low, U.ease((nb.d - 20) / 46));
        h = U.lerp(h, Math.max(h, sea), U.ease((nb.d - 85) / 150));
        const od = Math.hypot(x - T.oasis.x, z - T.oasis.z);
        if (od < T.oasis.r * 2.2) { h = U.lerp(Math.min(h, under + 0.4), h, U.ease((od - T.oasis.r) / (T.oasis.r * 1.2))); if (od < T.oasis.r * 0.8) kind[k] = 2; }
        T.pyramids.forEach(function (p) {
          const e = Math.max(Math.abs(x - p.x), Math.abs(z - p.z));
          if (e < p.half) { const ph = p.h * (1 - e / p.half) + 6; if (ph > h) { h = ph; kind[k] = 1; } }
        });
        H[k] = h;
        near[k] = nb.d;
      }
    }
    T.terrainGrid = { x0: T0X, z0: T0Z, size: TSIZE, cell: TCELL, n: TN, H: H, near: near, kind: kind };
    T.terrain = function (x, z) {
      const fx = U.clamp((x - T0X) / TCELL, 0, TN - 1e-4), fz = U.clamp((z - T0Z) / TCELL, 0, TN - 1e-4);
      const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
      const a = H[iz * N1 + ix], b = H[iz * N1 + ix + 1], c = H[(iz + 1) * N1 + ix], d = H[(iz + 1) * N1 + ix + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    T.ground = T.terrain;
    T.extent = { x0: T0X, z0: T0Z, size: TSIZE };
    // Obelisks stand in pairs along the line, like gates you thread.
    T.obelisks = [];
    for (let i = 0; i < Math.floor(T.len / 85); i++) {
      const a = T.at(i * 85 + 70), hl = Math.hypot(a.tx, a.tz) || 1;
      if (Math.abs(T.ahead(T.startS, i * 85 + 70)) < 45) continue;
      [-1, 1].forEach(function (sd) {
        const off = 15 + ((i * 7 + (sd > 0 ? 3 : 0)) % 5) * 1.6;
        const x = a.x - a.tz / hl * off * sd, z = a.z + a.tx / hl * off * sd;
        if (Math.hypot(x - T.stand.x, z - T.stand.z) < 16) return;
        const h = 15 + ((i * 5 + (sd > 0 ? 2 : 0)) % 4) * 2.5;
        T.obelisks.push([x, T.terrain(x, z), z, h, U.yawTo(a.tx, a.tz)]);
      });
    }
    // Ruined columns, palms (thick round the oasis) and rocks.
    const rng = U.rng(404);
    T.columns = []; T.palms = []; T.rocks = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * 6.28, r = T.oasis.r * (0.85 + rng() * 0.9), x = T.oasis.x + Math.cos(a) * r, z = T.oasis.z + Math.sin(a) * r;
      const nb = T.nearest(x, z);
      if (nb.d > 9) T.palms.push([x, T.terrain(x, z), z, 0.85 + rng() * 0.6, rng()]);
    }
    let th = -1;
    for (let i = 0; i < 5000 && T.columns.length + T.palms.length + T.rocks.length < 430; i++) {
      const x = T0X + 20 + rng() * (TSIZE - 40), z = T0Z + 20 + rng() * (TSIZE - 40);
      const r1 = rng(), r2 = rng(), r3 = rng();
      const nb = T.nearest(x, z, th); th = nb.i;
      if (nb.d > 230 || nb.d < 12) continue;
      if (Math.hypot(x - T.stand.x, z - T.stand.z) < 18) continue;
      if (Math.abs(T.ahead(T.startS - 14, nb.s)) < 40 && nb.d < 30) continue;   // the launch area stays open
      if (kind[Math.round((z - T0Z) / TCELL) * N1 + Math.round((x - T0X) / TCELL)]) continue;
      if (T.pyramids.some(function (p) { return Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) < p.half + 6; })) continue;
      const h = T.terrain(x, z);
      if (nb.d < 24 && r3 > 0.35) continue;                                       // thinner right by the line
      if (r1 < 0.3) T.columns.push([x, h, z, 0.8 + r2 * 0.7, r3]);
      else if (r1 < 0.5) T.palms.push([x, h, z, 0.8 + r2 * 0.6, r3]);
      else T.rocks.push([x, h, z, 0.9 + r2 * 2.6, r3 * 6]);
    }
    T.obelisks.forEach(function (o) { T.obs.push({ b: 1, x: o[0], z: o[2], hx: 1.1, hz: 1.1, y0: o[1] - 1, y1: o[1] + o[3], kind: "obelisk" }); });
    T.columns.forEach(function (c) { T.obs.push({ c: 1, x: c[0], z: c[2], r: 1.0 * c[3], y0: c[1] - 1, y1: c[1] + (4 + c[4] * 5) * c[3], kind: "column" }); });
    T.palms.forEach(function (p) { T.obs.push({ c: 1, x: p[0], z: p[2], r: 0.7, y0: p[1] - 1, y1: p[1] + 9.5 * p[3], kind: "palm" }); });
    T.rocks.forEach(function (r) { T.obs.push({ c: 1, x: r[0], z: r[2], r: 1.2 * r[3], y0: r[1] - 1, y1: r[1] + 1.3 * r[3], kind: "rock" }); });
  }

  DR.Track = { build: build, COURSES: Object.keys(COURSES) };
})(globalThis.DR);
