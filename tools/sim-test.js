// A whole 3-minute hunt on each course with the autopilot flying, headless:
// does it find and down targets, do they shoot back, can it get shot down and respawn?
//   node tools/sim-test.js
"use strict";
const path = require("path");
const W = path.join(__dirname, "..", "Work", "src");
["util.js", "track.js", "sim.js"].forEach(function (f) { require(path.join(W, f)); });
const DR = globalThis.DR;

let ok = true;
function check(name, cond, info) { console.log((cond ? "  ok   " : "  FAIL ") + name + (info ? "  (" + info + ")" : "")); if (!cond) ok = false; }

DR.Track.COURSES.forEach(function (course) {
  const t0 = Date.now();
  const T = DR.Track.build(course);
  console.log(course + ": line " + T.len.toFixed(0) + " m" + (T.buildings ? ", " + T.buildings.length + " buildings" : "") + ", built in " + (Date.now() - t0) + " ms");
  // The line itself must be flyable: never inside a building or the ground.
  let blocked = 0;
  for (let s = 0; s < T.len; s += 2) { const p = T.at(s); if (T.terrain(p.x, p.z) > p.y - 2) blocked++; }
  check("line clear of walls and ground", blocked === 0, blocked + " blocked samples");

  const S = DR.Sim.create(T, [{ name: "Bot", hl: "x" }], { seed: 4242 });
  S.humanId = 0;
  const me = S.me();
  const counts = {};
  let steps = 0, insideWall = 0;
  const dt = 1 / 60;
  while (!S.over && steps < 60 * 200) {
    Object.assign(S.input, DR.Sim.botInput(S, me));
    DR.Sim.step(S, dt);
    S.events.forEach(function (e) { counts[e.k] = (counts[e.k] || 0) + 1; });
    S.events.length = 0;
    S.targets.forEach(function (t) { if (T.terrain(t.x, t.z) > t.y) insideWall++; });
    steps++;
  }
  console.log("  events " + JSON.stringify(counts));
  console.log("  score " + me.score + ", kills " + S.kills + ", escaped " + S.escaped + ", deaths " + me.deaths +
    ", accuracy " + Math.round(100 * me.shotsHit / Math.max(1, me.shotsFired)) + "%, pack used " + S.next + "/" + S.pack.length);
  check("round ended at 3:00", S.over && Math.abs(S.huntT() - DR.CFG.round) < 0.1);
  check("downed targets", S.kills >= 8, S.kills + " kills");
  check("targets fired back and hit", (counts.efire || 0) > 10 && (counts.ouch || 0) > 0);
  check("targets never inside walls", insideWall === 0, insideWall + " frames");
  check("solid obstacles on the course", T.obs.length > 100, T.obs.length + " (" + Array.from(new Set(T.obs.map(function (o) { return o.kind; }))).join(", ") + ")");
  check("tricks used and fire dodged", (counts.trick || 0) > 0 && (counts.dodge || 0) > 0, "tricks " + (counts.trick || 0) + ", dodges " + (counts.dodge || 0));
  console.log("  crashes " + (counts.crash || 0));
  if (counts.down) check("respawned after being shot down", (counts.respawn || 0) >= counts.down - 1);
});

// Same seed, same pack: fair for everyone.
const a = DR.Sim.pack(99), b = DR.Sim.pack(99);
check("same seed gives the same pack", JSON.stringify(a) === JSON.stringify(b));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
