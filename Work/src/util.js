// Small helpers shared by the race (which also runs in Node for tests) and the view.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = {};
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  // Angle wrapped to -PI..PI.
  U.wrap = function (a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  // Move v toward target by at most step.
  U.approach = function (v, target, step) { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); };
  U.ease = function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.num = function (v, lim) { return typeof v === "number" && isFinite(v) && Math.abs(v) <= (lim || 1e4); };
  U.r1 = function (v) { return Math.round(v * 10) / 10; };
  U.r2 = function (v) { return Math.round(v * 100) / 100; };
  U.r3 = function (v) { return Math.round(v * 1000) / 1000; };
  // Seeded random numbers (mulberry32), so every player builds the same scenery.
  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // Forward direction for a yaw (yaw 0 faces -Z, like a three.js camera; left turns are +yaw).
  U.fwdX = function (yaw) { return -Math.sin(yaw); };
  U.fwdZ = function (yaw) { return -Math.cos(yaw); };
  U.yawTo = function (dx, dz) { return Math.atan2(-dx, -dz); };
  U.ordinal = function (n, locale) {
    if (locale === "pt-PT") return n + ".º";
    const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return n + s;
  };
  DR.U = U;
})(globalThis.DR);
