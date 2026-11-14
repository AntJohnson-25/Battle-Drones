// Start-up and the main loop: join the lobby, build both courses, fetch every
// player's avatar while HopLobby's loading screen is up, then hunt. The host (or
// a player on their own) picks the course and starts each round; everyone else
// waits for it, then plays their own copy of it (see net.js).
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const STEP = 1 / 60;
  const G = { S: null, T: {}, paused: false, acc: 0, last: 0, myId: null, course: "city" };
  const qs = new URLSearchParams(location.search);
  G.autopilot = qs.has("autopilot");
  const tick = function () { return new Promise(function (ok) { setTimeout(ok, 0); }); };
  const wait = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  const $ = function (id) { return document.getElementById(id); };

  async function boot() {
    HopLobby.progress(0.05, "Joining the lobby");
    let ctx;
    try { ctx = await HopLobby.init(); } catch (e) { fatal(e.message); return; }
    G.myId = ctx.playerId;
    HopLobby.progress(0.15, "Building the city");
    await tick();
    G.T.city = DR.Track.build("city");
    HopLobby.progress(0.3, "Raising the mountains");
    await tick();
    G.T.mountain = DR.Track.build("mountain");
    HopLobby.progress(0.38, "Sweeping the dunes");
    await tick();
    G.T.dunes = DR.Track.build("dunes");
    HopLobby.progress(0.45, "Arming the targets");
    await tick();
    DR.View.init($("view"));
    DR.View.preview(G.T.city);
    DR.Hud.init(ctx.locale);
    DR.Hud.debug = qs.has("debug");
    $("debug").hidden = !DR.Hud.debug;
    await DR.Drone.loadCustom();
    HopLobby.progress(0.6, "Pilots taking their places");
    const all = Promise.all((HopLobby.players || []).map(function (p) { return DR.Pilot.requestAvatar(p.id); }));
    await Promise.race([all, wait(9000)]);
    HopLobby.progress(0.95, "Charging batteries");

    DR.Net.init(ctx, {
      start: function (m, el, sc) {
        const me = m.roster.findIndex(function (r) { return r.hl === G.myId; });
        const S = DR.Sim.create(G.T[m.c], m.roster, { seed: m.seed, t0: el, me: me, score: sc });
        S.humanId = me;
        DR.Net.attach(S);
        setRace(S);
      },
      promoted: function () { DR.Hud.toast(DR.Hud.t("host")); DR.Hud.last.res = null; if (!G.S) DR.Hud.menu(true); },
      left: function (name) { DR.Hud.toast(DR.Hud.t("leftRace", { name: name })); }
    });
    if (DR.Net.isClient()) DR.Hud.waiting(DR.Hud.t("waitHost"));
    else if (G.autopilot || qs.has("course")) startRound(DR.Track.COURSES.indexOf(qs.get("course")) >= 0 ? qs.get("course") : "city");
    else DR.Hud.menu(true);

    HopLobby.on("pause", function () { DR.Input.hold(true); if (!DR.Net.online()) G.paused = true; });
    HopLobby.on("resume", function () { DR.Input.hold(false); G.paused = false; });
    HopLobby.on("relay", function (s) { $("status").textContent = s === "open" ? "" : s === "connecting" ? "Connecting…" : "Reconnecting…"; });
    if (ctx.standalone) $("status").textContent = "Standalone: open this from a HopLobby lobby (Dev Mode) to hunt with up to 8 players.";
    wireButtons();
    DR.Input.onKey = onKey;
    DR.Input.onPad = function () { DR.Hud.toast(DR.Hud.t("pad")); $("padKeys").hidden = false; };
    if (DR.Input.pad) $("padKeys").hidden = false;
    HopLobby.progress(1, "Ready");
    HopLobby.ready();
    G.last = performance.now() / 1000;
    requestAnimationFrame(frame);
    hiddenTicker();
  }

  function fatal(msg) { const el = $("err"); el.hidden = false; el.textContent = msg; }

  function startRound(course) {
    if (DR.Net.isClient()) return;
    G.course = course;
    const m = DR.Net.newMatch(course, DR.Sim.roster(DR.Net.humans()));
    const S = DR.Sim.create(G.T[course], m.roster, { seed: m.seed });
    S.humanId = m.roster.findIndex(function (r) { return r.hl === G.myId; });
    if (S.humanId < 0 && !DR.Net.online()) S.humanId = 0;
    DR.Net.attach(S);
    setRace(S);
  }

  function setRace(S) {
    G.S = S;
    DR.View.setRace(S);
    DR.Hud.setRace(S);
    DR.Hud.waiting(null);
    G.lastCount = -1; G.lastSec = -1; G.minWarned = false;
  }

  // ------------------------------------------------------------------ input
  function onKey(code) {
    DR.Audio.wake();
    const S = G.S;
    if (code === "KeyC") DR.View.toggleCamera();
    else if (code === "KeyM") DR.Audio.toggle();
    else if (code === "KeyI") DR.Input.toggleInvert();
    else if (code === "KeyO") { DR.Hud.sensor = !DR.Hud.sensor; DR.Hud.toast(DR.Hud.t(DR.Hud.sensor ? "sensorOn" : "sensorOff")); }
    else if ((code === "KeyQ" || code === "KeyE" || code === "KeyX") && S && !DR.Input.held) S.input.trick = code === "KeyQ" ? "rollL" : code === "KeyE" ? "rollR" : "flip";
    else if ((code === "Enter" || code === "NumpadEnter") && S && S.over && !$("results").hidden) startRound(G.course);
  }
  addEventListener("pointerdown", function () { DR.Audio.wake(); });

  function wireButtons() {
    document.querySelectorAll("[data-course]").forEach(function (b) {
      b.onclick = function () { DR.Audio.wake(); startRound(b.getAttribute("data-course")); };
    });
    $("endAll").onclick = function () { HopLobby.endGame(); };
    $("backLobby").onclick = function () { HopLobby.exit(); };
  }

  // ------------------------------------------------------------------ the loop
  function simStep(h) {
    const S = G.S;
    if (!S || G.paused) return;
    DR.Input.read(S.input);
    const me = S.me();
    if (G.autopilot && me && S.phase() === "hunt") Object.assign(S.input, DR.Sim.botInput(S, me));
    DR.Sim.step(S, h);
    DR.Net.step(S, h);
    react(S);
    S.events.length = 0;
  }

  function advance(dt) {
    G.acc = Math.min(G.acc + dt, STEP * 8);
    while (G.acc >= STEP) { simStep(STEP); G.acc -= STEP; }
  }

  function frame(ms) {
    const now = ms / 1000;
    const dt = Math.min(0.1, now - G.last);
    G.last = now;
    DR.Input.poll();
    advance(dt);
    DR.View.frame(dt, now);
    DR.Hud.frame(G.S, DR.View.shot, DR.Net);
    sounds();
    swapLateAvatars(now);
    requestAnimationFrame(frame);
  }

  // Hidden tabs get no animation frames, but the round clock and our reports to
  // the others must go on: a worker timer keeps the steps coming while hidden.
  function hiddenTicker() {
    try {
      const src = "setInterval(function(){postMessage(0)},50)";
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      w.onmessage = function () {
        if (!document.hidden) return;
        const now = performance.now() / 1000;
        advance(Math.min(0.25, now - G.last));
        G.last = now;
      };
    } catch (e) { /* no workers: the round pauses while hidden */ }
  }

  let swapT = 0;
  function swapLateAvatars(now) {
    if (!G.S || now - swapT < 1) return;
    swapT = now;
    const st = DR.Pilot.avatarStates();
    G.S.racers.forEach(function (r, i) {
      const p = DR.View.pilots[i];
      if (p && p.kind === "figure" && r.hl && st[r.hl] && st[r.hl].state === "ready") DR.View.replacePilot(i, r);
    });
  }

  // ------------------------------------------------------------------ sounds, effects, messages
  function react(S) {
    const me = S.me(), H = DR.Hud, A = DR.Audio, V = DR.View;
    let fired = false;
    S.events.forEach(function (e) {
      if (e.k === "fire") { if (!fired) A.play("fire"); fired = true; }
      else if (e.k === "thit") { A.play("thit"); H.hit(false); V.spark(e.x, e.y, e.z); }
      else if (e.k === "kill" && e.boss) { A.play("bossdown"); H.hit(true); H.points(H.t("bossDown", { n: e.pts }), "boss"); V.boom(e.x, e.y, e.z, 2); V.shake = 1.5; DR.Input.rumble(500, 1); }
      else if (e.k === "kill") { A.play(e.ace ? "ace" : "kill"); H.hit(true); H.points(e.ace ? H.t("ace") : H.t("kill"), e.ace); V.boom(e.x, e.y, e.z, e.ace); }
      else if (e.k === "boss") { A.play("boss"); H.flash(H.t("bossIn", { name: e.name }), "warn", 2.6); }
      else if (e.k === "mini") { if (me && Math.hypot(e.x - me.x, e.z - me.z) < 120) A.play("mini"); }
      else if (e.k === "troll") A.play("troll");
      else if (e.k === "spark") V.spark(e.x, e.y, e.z);
      else if (e.k === "efire") { if (me && Math.hypot(e.x - me.x, e.z - me.z) < 70) A.play("efire"); }
      else if (e.k === "ouch") { A.play("ouch"); V.shake = 1; DR.Input.rumble(160, 0.6); }
      else if (e.k === "down") { A.play("down"); if (me) V.boom(me.x, me.y, me.z, false); DR.Input.rumble(600, 1); }
      else if (e.k === "respawn") A.play("respawn");
      else if (e.k === "crash") { A.play("crash"); V.shake = 1.2; DR.Input.rumble(220, 0.9); H.flash(H.t("crash", { what: H.t("ob_" + e.kind.replace(" ", "_")) || e.kind, n: e.dmg }), "warn", 1.3); }
      else if (e.k === "trick") A.play(e.t === "flip" ? "flip" : "roll");
      else if (e.k === "dodge") { A.play("dodge"); H.points(H.t("dodged"), false); }
      else if (e.k === "over") { A.play("over"); H.flash(H.t("over"), "info", 1.4); }
    });
  }

  function sounds() {
    const S = G.S;
    if (!S) { DR.Audio.motor(false, 0, false); return; }
    const me = S.me(), ph = S.phase();
    if (ph === "count" || (ph === "hunt" && S.huntT() < 0.2)) {
      const n = ph === "hunt" ? 0 : Math.ceil(DR.CFG.intro + DR.CFG.count - S.t);
      if (n !== G.lastCount) { G.lastCount = n; DR.Audio.play(n === 0 ? "go" : "beep"); }
    }
    if (ph === "hunt") {
      const left = Math.ceil(S.left());
      if (left <= 60 && left > 55 && !G.minWarned) { G.minWarned = true; DR.Hud.flash(DR.Hud.t("lastMin"), "info", 2); DR.Audio.play("beep"); }
      if (left <= 10 && left !== G.lastSec) { G.lastSec = left; DR.Audio.play("tick"); }
    }
    // Obstacle sensor: beeps faster the closer you get, like a parking sensor.
    if (me && DR.Hud.sensor && ph === "hunt" && me.downT <= 0 && me.warn < DR.CFG.sensor) {
      const now = performance.now() / 1000, gap = 0.05 + (me.warn / DR.CFG.sensor) * 0.4;
      if (now - (G.beepT || 0) > gap) { G.beepT = now; DR.Audio.play(me.warn < 6 ? "prox2" : "prox"); }
    }
    const armed = !!me && me.downT <= 0 && (ph === "hunt" || (ph === "count" && S.t > DR.CFG.intro + 0.8)) && DR.View.shot !== "results";
    DR.Audio.motor(armed, me ? me.disp.speed : 0, false);
  }

  DR.Game = G;
  boot();
})(globalThis.DR);
