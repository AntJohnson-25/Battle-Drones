// A whole race with bots only, headless: do they get round, do pickups and hits happen?
//   node tools/sim-test.js
"use strict";
const path = require("path");
const W = path.join(__dirname, "..", "Work", "src");
["util.js", "track.js", "sim.js"].forEach(function (f) { require(path.join(W, f)); });
const DR = globalThis.DR;

const t0 = Date.now();
const T = DR.Track.build();
console.log("track: " + T.len.toFixed(0) + " m, " + T.gates.length + " gates, built in " + (Date.now() - t0) + " ms");
T.gates.forEach(function (g) {
  const ground = T.terrain(g.x, g.z);
  if (g.y - g.h / 2 < ground + 0.5) console.log("  gate " + g.i + " bottom below ground: y " + g.y.toFixed(1) + " ground " + ground.toFixed(1));
});

const S = DR.Sim.create(T, DR.Sim.roster([]).map(function (r) { return r; }));
S.solo = true;
const counts = {};
let steps = 0;
const dt = 1 / 60;
while (!S.over && steps < 60 * 400) {
  DR.Sim.step(S, dt);
  S.events.forEach(function (e) { counts[e.k] = (counts[e.k] || 0) + 1; });
  S.events.length = 0;
  steps++;
}
console.log("race over: " + S.over + " after " + S.raceT().toFixed(1) + " s of racing");
console.log("events: " + JSON.stringify(counts));
S.racers.forEach(function (r) {
  console.log("  " + r.place + ". " + r.name.padEnd(10) + " lap " + r.lap + " gates " + r.passed + (r.finished ? " finished " + r.finishT.toFixed(1) + " s" : " DNF"));
});
const ok = S.over && S.racers.filter(function (r) { return r.finished; }).length >= 4 && counts.pick > 0 && (counts.hit || 0) + (counts.zap || 0) > 0;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
