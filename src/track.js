// The course: one closed loop of gates over a low-poly valley. Pure data and maths
// (no three.js), so the race can run in Node for tests. Every player builds the
// same track from the same numbers.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U;

  // Centreline control points [x, y (height), z] in metres. The loop runs from the
  // start straight (heading -Z), over a ridge, down a valley, round a hairpin,
  // through a low dip and back along a high sweeper.
  const POINTS = [
    [0, 6, 150], [0, 7, 60], [15, 10, -20], [60, 22, -90], [130, 20, -140], [200, 8, -125],
    [245, 6, -60], [235, 9, 0], [190, 13, 25], [150, 6, -5], [105, 5, 30], [115, 12, 100],
    [90, 22, 170], [40, 16, 240], [-30, 10, 260], [-60, 8, 220], [-35, 7, 185]
  ];
  const GATES = 16;              // gates per lap; gate 0 is the start/finish arch
  const GATE_W = 12, GATE_H = 8; // opening, metres
  const BOX_ROWS = [0.27, 0.6, 0.86];   // pickup rows, as a fraction of the lap
  const SAMPLES = 2400;

  // Terrain grid (also used to build the mesh, so the drones and the ground agree).
  const T0X = -360, T0Z = -390, TSIZE = 900, TCELL = 7.5, TN = TSIZE / TCELL;   // 120 cells a side

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function build() {
    const n = POINTS.length;
    // Sample the closed spline, then index it by distance along the lap.
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
    // Evenly spaced points by distance (1 m apart, roughly), with tangents.
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

    const T = { len: len, M: M, pts: pts, tan: tan, laps: 3 };
    // Point on the line at distance s (wraps round the lap).
    T.at = function (s) {
      s = ((s % len) + len) % len;
      const f = s / step, i = Math.floor(f) % M, k = (i + 1) % M, u = f - Math.floor(f);
      return {
        x: pts[i * 3] + (pts[k * 3] - pts[i * 3]) * u, y: pts[i * 3 + 1] + (pts[k * 3 + 1] - pts[i * 3 + 1]) * u,
        z: pts[i * 3 + 2] + (pts[k * 3 + 2] - pts[i * 3 + 2]) * u,
        tx: tan[i * 3], ty: tan[i * 3 + 1], tz: tan[i * 3 + 2]
      };
    };
    // Nearest point on the line. With a hint (last index) it searches nearby only.
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

    // Gates, evenly spaced; gate 0 sits a little way into the lap so the grid fits behind it.
    T.gates = [];
    for (let g = 0; g < GATES; g++) {
      const s = 40 + (g / GATES) * len;
      const p = T.at(s);
      const hl = Math.hypot(p.tx, p.tz) || 1;
      const nx = p.tx / hl, nz = p.tz / hl;
      T.gates.push({
        i: g, s: s, x: p.x, y: p.y, z: p.z, nx: nx, nz: nz, sx: -nz, sz: nx,   // n = through the gate, s = to its right
        w: g === 0 ? 16 : GATE_W, h: g === 0 ? 10 : GATE_H
      });
    }
    T.startS = T.gates[0].s;

    // Pickup rows: four boxes across the line.
    T.boxes = [];
    BOX_ROWS.forEach(function (f) {
      const p = T.at(f * len);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      for (let b = 0; b < 4; b++) {
        const o = (b - 1.5) * 3.2;
        T.boxes.push({ x: p.x + sx * o, y: p.y, z: p.z + sz * o });
      }
    });

    // Starting grid: rows of four behind the start arch, facing down the straight.
    T.grid = [];
    for (let k = 0; k < 16; k++) {
      const row = Math.floor(k / 4), col = k % 4;
      const p = T.at(T.startS - 14 - row * 7);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      const o = (col - 1.5) * 3.2 + (row % 2 ? 0.8 : -0.8);
      T.grid.push({ x: p.x + sx * o, z: p.z + sz * o, yaw: U.yawTo(p.tx, p.tz) });
    }

    // The pilots' stand: beside the start straight, on the left, facing the track.
    {
      const p = T.at(T.startS - 30);
      const hl = Math.hypot(p.tx, p.tz) || 1, sx = -p.tz / hl, sz = p.tx / hl;
      const x = p.x - sx * 30, z = p.z - sz * 30;
      T.stand = { x: x, z: z, yaw: U.yawTo(sx, sz), sx: -p.tx / hl, sz: -p.tz / hl };   // faces the track; s = along the stand
    }

    buildTerrain(T);
    T.grid.forEach(function (g) { g.y = T.terrain(g.x, g.z) + 0.25; });
    T.stand.y = T.terrain(T.stand.x, T.stand.z);
    return T;
  }

  // Ground: a flat-ish valley along the line that rises into hills away from it.
  // Where the line runs high, the ground under it rises too (the track crests a ridge).
  function buildTerrain(T) {
    const N1 = TN + 1;
    const H = new Float32Array(N1 * N1);
    const near = new Float32Array(N1 * N1);   // distance to the line, for colouring
    let hint = -1;
    for (let iz = 0; iz < N1; iz++) {
      for (let ix = 0; ix < N1; ix++) {
        const x = T0X + ix * TCELL, z = T0Z + iz * TCELL;
        const nb = T.nearest(x, z, hint);
        hint = nb.i;
        const ty = T.pts[nb.i * 3 + 1];
        const under = Math.max(0, ty - 10);
        const n1 = Math.sin(x * 0.013 + 1.3) * Math.sin(z * 0.011 + 0.4);
        const n2 = Math.sin(x * 0.031 + z * 0.017) * 0.5 + Math.sin(z * 0.043 - x * 0.021) * 0.3;
        const floor = under + n2 * 0.6;
        const hills = under + 14 + 12 * (n1 * 0.5 + 0.5) + 6 * n2;
        const far = 30 + 40 * (n1 * 0.5 + 0.5) + 10 * n2;
        let h = U.lerp(floor, hills, U.ease((nb.d - 24) / 50));
        h = U.lerp(h, Math.max(h, far), U.ease((nb.d - 120) / 120));
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
  }

  DR.Track = { build: build };
})(globalThis.DR);
