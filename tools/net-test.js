// Headless multiplayer test: up to 8 players' games in separate VM contexts, a fake
// relay with latency and dropped messages, and the HopLobby events the real platform
// sends. Every "human" is flown by the autopilot.
//   node tools/net-test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const W = path.join(__dirname, "..", "Work", "src");
const FILES = ["util.js", "track.js", "sim.js", "net.js"].map(function (f) { return [f, fs.readFileSync(path.join(W, f), "utf8")]; });

let clock = 0;
const LAT = 0.06, DROP = 0.08;
const lobby = { hostId: "A", players: [] };
const games = {};
const queue = [];
let rnd = 12345;
function rand() { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; }
const tracks = {};

function playersFor(id) { return lobby.players.map(function (p) { return { id: p.id, name: p.name, isHost: p.id === lobby.hostId, isYou: p.id === id, signedIn: true }; }); }

function makeGame(id, name) {
  const handlers = {};
  const HL = {
    context: null, players: [],
    get me() { return HL.players.find(function (p) { return p.id === id; }); },
    on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return function () {}; },
    send: function (data, to) {
      const json = JSON.stringify(data);
      if (json.length > 16384) throw new Error("message over 16 KB: " + json.length);
      const targets = to === undefined ? lobby.players.map(function (p) { return p.id; }).filter(function (x) { return x !== id; }) : [].concat(to);
      targets.forEach(function (t) { if (rand() > DROP) queue.push([clock + LAT * (0.7 + rand() * 0.6), t, JSON.parse(json), id]); });
      g.sent++;
      return true;
    }
  };
  const sandbox = { HopLobby: HL, performance: { now: function () { return clock * 1000; } }, console: console, Math: Math, JSON: JSON };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach(function (f) { vm.runInContext(f[1], sandbox, { filename: f[0] }); });
  const DR = sandbox.DR;
  const g = { id: id, name: name, HL: HL, DR: DR, handlers: handlers, S: null, sent: 0, events: {}, alive: true };
  HL.context = { sdk: 1, gameId: "dev", lobbyCode: "TEST01", playerId: id, hostId: lobby.hostId, players: playersFor(id), locale: "en", dev: true };
  HL.players = playersFor(id);
  g.track = function (c) { return tracks[c] || (tracks[c] = DR.Track.build(c)); };
  DR.Net.init(HL.context, {
    start: function (m, el, sc) {
      const me = m.roster.findIndex(function (r) { return r.hl === id; });
      const S = DR.Sim.create(g.track(m.c), m.roster, { seed: m.seed, t0: el, me: me, score: sc });
      S.humanId = me;
      g.S = S;
      DR.Net.attach(S);
    },
    promoted: function () { g.promoted = true; }
  });
  if (DR.Net.isHost()) startRound(g, "city");
  return g;
}

// What main.js does when the host starts a round.
function startRound(g, course) {
  const DR = g.DR;
  const m = DR.Net.newMatch(course, DR.Sim.roster(DR.Net.humans()));
  const S = DR.Sim.create(g.track(course), m.roster, { seed: m.seed });
  S.humanId = m.roster.findIndex(function (r) { return r.hl === g.id; });
  g.S = S;
  DR.Net.attach(S);
}

function emit(g, ev) { const args = [].slice.call(arguments, 2); (g.handlers[ev] || []).forEach(function (fn) { fn.apply(null, args); }); }
function join(id, name) { lobby.players.push({ id: id, name: name }); }
function launch(id) { games[id] = makeGame(id, lobby.players.find(function (p) { return p.id === id; }).name); }
function leave(id) {
  lobby.players = lobby.players.filter(function (p) { return p.id !== id; });
  games[id].alive = false;
  delete games[id];
  if (lobby.hostId === id) lobby.hostId = lobby.players[0].id;
  Object.keys(games).forEach(function (k) {
    const g = games[k];
    g.HL.context.hostId = lobby.hostId;
    g.HL.players = playersFor(k);
    g.HL.context.players = g.HL.players;
    emit(g, "players", g.HL.players, lobby.hostId);
  });
}

function stepGame(g, dt) {
  const S = g.S, DR = g.DR;
  if (!S) return;
  const me = S.me();
  if (me) Object.assign(S.input, DR.Sim.botInput(S, me));
  DR.Sim.step(S, dt);
  DR.Net.step(S, dt);
  S.events.forEach(function (e) { g.events[e.k] = (g.events[e.k] || 0) + 1; });
  S.events.length = 0;
}

function run(seconds, onTick) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    clock += dt;
    queue.sort(function (a, b) { return a[0] - b[0]; });
    while (queue.length && queue[0][0] <= clock) {
      const m = queue.shift();
      if (games[m[1]]) emit(games[m[1]], "message", m[2], m[3]);
    }
    Object.keys(games).forEach(function (k) { stepGame(games[k], dt); });
    if (onTick && onTick()) return true;
  }
  return false;
}

const results = [];
function check(name, ok, info) { results.push([name, ok]); console.log((ok ? "  ok   " : "  FAIL ") + name + (info ? "  (" + info + ")" : "")); }
const IDS = "ABCDEFGH".split("");
const NAMES = ["Ant", "Joshua", "Maria", "Dee", "Kai", "Lena", "Omar", "Tess"];

// ---------------------------------------------------------------- 1. a full round, 8 pilots
console.log("1. 8 pilots, a full 3-minute round in the city");
IDS.forEach(function (id, i) { join(id, NAMES[i]); });
IDS.forEach(launch);
run(1.5);
check("everyone got the round", IDS.every(function (id) { return games[id].S && games[id].S.racers.length === 8; }));
check("same course and seed for all", IDS.every(function (id) { return games[id].S.seed === games.A.S.seed && games[id].S.T.course === "city"; }));
check("each is their own pilot", IDS.every(function (id, i) { return games[id].S.humanId === i; }));
[null, 5, "x", { t: "p" }, { t: "p", id: "zzz", x: 1e9 }, { t: "start", roster: "x" }, { t: "p", id: games.A.DR.Net.match.id, x: NaN, y: 0, z: 0 },
  { t: "start", id: "q", c: "moon", seed: 1, el: 0, roster: [["x", "y"]] }]
  .forEach(function (j) { emit(games.A, "message", j, "B"); emit(games.B, "message", j, "A"); });
check("junk messages ignored", games.B.S.T.course === "city");
run(60);
// Ghosts: B's drone as A draws it vs where B really is.
const gB = games.A.S.racers[1], rB = games.B.S.me();
const gap = Math.hypot(gB.disp.x - rB.x, gB.disp.z - rB.z);
check("A sees B's ghost close to where B is", gap < 12, gap.toFixed(1) + " m (120 ms smoothing at 30 m/s is ~4 m)");
const over = run(140, function () { return IDS.every(function (id) { return games[id].S.over; }); });
run(3);   // final reports land
check("round ended for everyone", over);
const truth = IDS.map(function (id) { return games[id].S.me().score; });
const seenByA = games.A.S.racers.map(function (r) { return r.score; });
const seenByH = games.H.S.racers.map(function (r) { return r.score; });
check("final scores agree on every screen", JSON.stringify(truth) === JSON.stringify(seenByA) && JSON.stringify(truth) === JSON.stringify(seenByH), JSON.stringify(truth));
check("everyone scored", truth.every(function (s) { return s > 0; }));
check("same results order on A and H", JSON.stringify(games.A.DR.Sim.rank(games.A.S)) === JSON.stringify(games.H.DR.Sim.rank(games.H.S)));
const rate = Math.max.apply(null, IDS.map(function (id) { return games[id].sent / clock; }));
check("message rate per player well under the relay limit", rate < 15, rate.toFixed(1) + "/s");

// ---------------------------------------------------------------- 2. mountain, B reloads, C leaves
console.log("2. new round on the mountain; B reloads mid-round; C leaves");
startRound(games.A, "mountain");
run(50);
check("everyone moved to the mountain", IDS.every(function (id) { return games[id].S.T.course === "mountain"; }));
const scoreB = games.B.S.me().score;
games.B.alive = false;
games.B = makeGame("B", "Joshua");
run(3);
const nb = games.B.S && games.B.S.me();
check("reloaded B is back in the same round", !!nb && games.B.S.seed === games.A.S.seed && games.B.S.huntT() > 30, nb ? "at " + games.B.S.huntT().toFixed(0) + " s" : "no round");
check("reloaded B kept their score", !!nb && nb.score >= scoreB - 1, nb ? nb.score + " (had " + scoreB + ")" : "");
leave("C");
run(2);
check("C marked as left on A and D", games.A.S.racers[2].left && games.D.S.racers[2].left);

// ---------------------------------------------------------------- 3. host leaves
console.log("3. host A leaves mid-round");
leave("A");
run(1);
check("B promoted to host", games.B.DR.Net.isHost() && games.B.promoted);
check("the round carries on for D", !games.D.S.over && games.D.S.huntT() > 40);
run(140, function () { return games.D.S.over; });
startRound(games.B, "city");
run(2);
check("new host's next round reaches the others", games.D.S.T.course === "city" && games.D.S.seed === games.B.S.seed && games.D.S.racers.length === 6);

const failed = results.filter(function (r) { return !r[1]; }).length;
console.log(failed ? failed + " FAILED" : "ALL " + results.length + " PASS");
process.exit(failed ? 1 : 0);
