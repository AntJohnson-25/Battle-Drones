// Headless multiplayer test: two (or three) players' games in separate VM contexts,
// a fake relay with latency and dropped messages, and the HopLobby events the real
// platform sends. Both "humans" are flown by the bot pilot.
//   node tools/net-test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const W = path.join(__dirname, "..", "Work", "src");
const FILES = ["util.js", "track.js", "sim.js", "net.js"].map(function (f) { return [f, fs.readFileSync(path.join(W, f), "utf8")]; });

let clock = 0;                 // virtual seconds
const LAT = 0.06, DROP = 0.08;
const lobby = { hostId: "A", players: [] };
const games = {};              // id -> game
const queue = [];              // [deliverAt, to, data, from]
let rnd = 12345;
function rand() { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; }
let sharedTrack = null;

function playersFor(id) { return lobby.players.map(function (p) { return { id: p.id, name: p.name, isHost: p.id === lobby.hostId, isYou: p.id === id, signedIn: true }; }); }

function makeGame(id, name) {
  const handlers = {};
  const HL = {
    context: null, players: [],
    get isHost() { return lobby.hostId === id; },
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
  // Reuse one track build (it's the same numbers for everyone) to keep the test quick.
  const T = sharedTrack || (sharedTrack = DR.Track.build());
  g.T = T;
  DR.Net.init(HL.context, {
    start: function (match) {
      const S = DR.Sim.create(T, match.roster, { client: true });
      S.humanId = match.roster.findIndex(function (r) { return r.hl === id && !r.bot; });
      g.S = S;
      DR.Net.clientAttach(S);
    },
    promoted: function () { g.promoted = true; }
  });
  if (DR.Net.isHost()) {
    const roster = DR.Sim.roster(DR.Net.humans());
    const S = DR.Sim.create(T, roster);
    S.humanId = roster.findIndex(function (r) { return r.hl === id; });
    g.S = S;
    DR.Net.hostStart(S, roster);
  }
  return g;
}

function emit(g, ev) { const args = [].slice.call(arguments, 2); (g.handlers[ev] || []).forEach(function (fn) { fn.apply(null, args); }); }
// Everyone is in the lobby before the game launches (HopLobby lets players join only while it waits).
function join(id, name) {
  lobby.players.push({ id: id, name: name });
  Object.keys(games).forEach(function (k) { games[k].HL.players = playersFor(k); games[k].HL.context.players = games[k].HL.players; });
}
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
  const S = g.S, N = g.DR.Net;
  if (!S) return;
  const me = S.me();
  if (me) {
    // The bot pilot flies our human too.
    const inp = g.DR.Sim.botInput(S, me, dt);
    S.input.steer = inp.steer; S.input.climb = inp.climb; S.input.brake = inp.brake;
    if (me.useReq) { S.input.use = true; me.useReq = false; }
  }
  if (N.isHost() || N.role === "solo") { g.DR.Sim.step(S, dt); N.hostStep(S, dt); }
  else N.clientStep(S, dt);
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

// ---------------------------------------------------------------- 1. a full race, host + player
console.log("1. host A + player B, full race");
join("A", "Ant"); join("B", "Joshua");
launch("A"); launch("B");
run(1.5);
check("B got the race", !!games.B.S && games.B.S.racers.length === 6);
check("B is a racer", games.B.S && games.B.S.humanId === 1);
// Junk from B never crashes the host.
[null, 5, "x", { t: "in" }, { t: "in", id: "zzz", x: 1e9 }, { t: "s", id: "?" }, { t: "start", roster: "x" }, { t: "in", id: games.A.DR.Net.match.id, x: NaN, y: 0, z: 0 }]
  .forEach(function (j) { emit(games.A, "message", j, "B"); emit(games.B, "message", j, "A"); });
check("junk messages ignored", true);
let over = run(200, function () { return games.A.S.over && games.B.S.over; });
const SA = games.A.S, SB = games.B.S;
check("race ended for both", over, "after " + SA.raceT().toFixed(1) + " s");
const bA = SA.racers[1], bB = SB.racers[1];
check("host counted B's laps", bA.finished && bA.lap === 3, "lap " + bA.lap + " passed " + bA.passed);
check("B finished on its own screen", bB.finished);
check("same results on both", JSON.stringify(SA.results) === JSON.stringify(SB.results), JSON.stringify(SA.results.map(function (r) { return r.id; })));
check("B used pickups", (games.B.events.use || 0) > 0, "uses " + (games.B.events.use || 0));
check("hits or EMPs seen by B", (games.B.events.hit || 0) + (games.B.events.zap || 0) + (games.B.events.block || 0) + (games.B.events.ouch || 0) > 0,
  JSON.stringify(games.B.events));
check("message rate under the relay limit", games.B.sent / (clock) < 60 && games.A.sent / clock < 60,
  "A " + (games.A.sent / clock).toFixed(1) + "/s, B " + (games.B.sent / clock).toFixed(1) + "/s");

// ---------------------------------------------------------------- 2. new race, B reloads, B leaves
console.log("2. new race; B reloads mid-race; C leaves mid-race");
function newRace() {
  const g = games.A, DR = g.DR;
  const roster = DR.Sim.roster(DR.Net.humans());
  const S = DR.Sim.create(g.T, roster);
  S.humanId = roster.findIndex(function (r) { return r.hl === "A"; });
  g.S = S;
  DR.Net.hostStart(S, roster);
}
// (C stands in for a third player who was in the lobby all along.)
join("C", "Maria"); launch("C");
newRace();
run(40);
check("three humans racing", games.C.S && games.C.S.humanId === 2 && games.B.S.humanId === 1);
const lapBefore = games.A.S.racers[1].passed;
// B reloads: a fresh game, same player id.
games.B.alive = false;
games.B = makeGame("B", "Joshua");
run(3);
const rb = games.B.S && games.B.S.me();
check("reloaded B rejoined the race", !!rb && rb.passed >= lapBefore - 1, rb ? "passed " + rb.passed + " (host had " + lapBefore + ")" : "no race");
leave("C");
run(2);
check("C's drone marked as left on the host", games.A.S.racers[2].left);
over = run(220, function () { return games.A.S.over && games.B.S.over; });
check("race still ends after C left", over);
check("left racer not ranked ahead of finishers", games.A.S.results[games.A.S.results.length - 1].id === 2 || games.A.S.racers[2].place === games.A.S.racers.length);

// ---------------------------------------------------------------- 3. host leaves mid-race
console.log("3. host A leaves mid-race");
newRace();
run(45);
leave("A");
run(1);
check("B promoted to host", games.B.DR.Net.isHost() && games.B.promoted);
over = run(220, function () { return games.B.S.over; });
check("race finishes under the new host", over, games.B.S.results ? JSON.stringify(games.B.S.results.map(function (r) { return r.id; })) : "");
check("A marked as left", games.B.S.racers[0].left);

const failed = results.filter(function (r) { return !r[1]; }).length;
console.log(failed ? failed + " FAILED" : "ALL " + results.length + " PASS");
process.exit(failed ? 1 : 0);
