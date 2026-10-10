// Start-up and the main loop: join the lobby, build the course, fetch every
// player's avatar while HopLobby's loading screen is up, then race. The host (or
// a player on their own) starts each race; everyone else waits for it.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const STEP = 1 / 60;
  const G = { S: null, T: null, paused: false, acc: 0, last: 0, myId: null };
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
    HopLobby.progress(0.15, "Shaping the canyon");
    await tick();
    G.T = DR.Track.build();
    HopLobby.progress(0.45, "Setting out the gates");
    await tick();
    DR.View.init($("view"), G.T);
    DR.Hud.init(ctx.locale);
    DR.Hud.debug = qs.has("debug");
    $("debug").hidden = !DR.Hud.debug;
    await DR.Drone.loadCustom();
    // Avatars take a moment each: fetch them all now, behind the loading screen.
    HopLobby.progress(0.6, "Pilots taking their places");
    const all = Promise.all((HopLobby.players || []).map(function (p) { return DR.Pilot.requestAvatar(p.id); }));
    await Promise.race([all, wait(9000)]);
    HopLobby.progress(0.95, "Charging batteries");

    DR.Net.init(ctx, {
      start: function (match) {
        const S = DR.Sim.create(G.T, match.roster, { client: true });
        S.humanId = match.roster.findIndex(function (r) { return r.hl === G.myId && !r.bot; });
        DR.Net.clientAttach(S);
        setRace(S);
      },
      promoted: function () { DR.Hud.toast(DR.Hud.t("host")); },
      left: function (name) { DR.Hud.toast(DR.Hud.t("leftRace", { name: name })); }
    });
    if (DR.Net.isClient()) DR.Hud.waiting(DR.Hud.t("waitHost"));
    else startRace();

    HopLobby.on("pause", function () { DR.Input.hold(true); if (!DR.Net.online()) G.paused = true; });
    HopLobby.on("resume", function () { DR.Input.hold(false); G.paused = false; });
    HopLobby.on("relay", function (s) { $("status").textContent = s === "open" ? "" : s === "connecting" ? "Connecting…" : "Reconnecting…"; });
    if (ctx.standalone) $("status").textContent = "Standalone: open this from a HopLobby lobby (Dev Mode) to race other players. Bots fill the grid.";
    wireButtons();
    DR.Input.onKey = onKey;
    HopLobby.progress(1, "Ready");
    HopLobby.ready();
    G.last = performance.now() / 1000;
    requestAnimationFrame(frame);
    hiddenTicker();
  }

  function fatal(msg) { const el = $("err"); el.hidden = false; el.textContent = msg; }

  function startRace() {
    const roster = DR.Sim.roster(DR.Net.humans());
    const S = DR.Sim.create(G.T, roster);
    S.humanId = roster.findIndex(function (r) { return r.hl === G.myId; });
    S.solo = !DR.Net.online();
    DR.Net.hostStart(S, roster);
    setRace(S);
  }

  function setRace(S) {
    G.S = S;
    DR.View.setRace(S);
    DR.Hud.setRace(S);
    DR.Hud.waiting(null);
    G.lastCount = -1; G.missed = false;
  }

  // ------------------------------------------------------------------ input
  function onKey(code) {
    DR.Audio.wake();
    const S = G.S;
    if (code === "KeyC") DR.View.toggleCamera();
    else if (code === "KeyM") DR.Audio.toggle();
    else if (code === "KeyI") DR.Input.toggleInvert();
    else if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && S) {
      if (S.over && !$("results").hidden && !DR.Net.isClient() && code !== "Space") startRace();
      else S.input.use = true;
    }
  }
  addEventListener("pointerdown", function () { DR.Audio.wake(); });

  function wireButtons() {
    $("again").onclick = function () { if (!DR.Net.isClient()) startRace(); };
    $("endAll").onclick = function () { HopLobby.endGame(); };
    $("backLobby").onclick = function () { HopLobby.exit(); };
  }

  // ------------------------------------------------------------------ the loop
  function simStep(h) {
    const S = G.S;
    if (!S || G.paused) return;
    DR.Input.read(S.input);
    // ?autopilot=1 (testing and recording): the bot pilot flies your drone.
    const me = S.me();
    if (G.autopilot && me && S.phase() === "race") {
      const inp = DR.Sim.botInput(S, me, h);
      S.input.steer = inp.steer; S.input.climb = inp.climb; S.input.brake = inp.brake;
      if (me.useReq) { S.input.use = true; me.useReq = false; }
    }
    if (DR.Net.isClient()) DR.Net.clientStep(S, h);
    else { DR.Sim.step(S, h); DR.Net.hostStep(S, h); }
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
    advance(dt);
    DR.View.frame(dt, now);
    DR.Hud.frame(G.S, DR.View.shot, DR.Net);
    sounds();
    swapLateAvatars(now);
    requestAnimationFrame(frame);
  }

  // Hidden tabs get no animation frames, but the host's race must go on for
  // everyone else: a worker timer keeps the steps coming while hidden.
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
    } catch (e) { /* no workers: the race pauses while hidden */ }
  }

  // An avatar that arrived after the race was built replaces the stand-in figure.
  let swapT = 0;
  function swapLateAvatars(now) {
    if (!G.S || now - swapT < 1) return;
    swapT = now;
    const st = DR.Pilot.avatarStates();
    G.S.racers.forEach(function (r, i) {
      const p = DR.View.pilots[i];
      if (p && p.kind === "figure" && r.hl && st[r.hl] && st[r.hl].state === "ready") {
        DR.World.stand.root.remove(p.root);
        const np = DR.Pilot.make(r, DR.World.stand.slots[i % 16]);
        DR.World.stand.root.add(np.root);
        DR.View.pilots[i] = np;
      }
    });
  }

  // ------------------------------------------------------------------ sounds and messages
  function react(S) {
    const me = S.me(), H = DR.Hud, A = DR.Audio;
    const name = function (id) { return S.racers[id] ? S.racers[id].name : ""; };
    S.events.forEach(function (e) {
      const mine = me && e.p === me.id;
      if (e.k === "emp") {
        DR.View.empAt(e.x, e.y, e.z);
        if (me && Math.hypot(e.x - me.disp.x, e.z - me.disp.z) < 80) A.play("emp");
      }
      if (!mine) return;
      if (e.k === "gate") A.play("gate");
      else if (e.k === "lap") { A.play("lap"); if (e.l === S.laps) H.flash(H.t("lastLap"), "info", 1.8); }
      else if (e.k === "fin") { A.play("finish"); H.flash(H.t("finished"), "go", 2.5); }
      else if (e.k === "pick") A.play("pick");
      else if (e.k === "box") A.play("box");
      else if (e.k === "use" && (e.local || !DR.Net.isClient())) A.play(DR.ITEMS[e.it] || "box");
      else if (e.k === "hit") { A.play("hit"); H.flash(H.t("hitBy", { name: name(e.by) }), "warn", 1.6); }
      else if (e.k === "block") { A.play("block"); H.flash(H.t("blocked"), "info", 1.4); }
      else if (e.k === "zap") { A.play("zap"); H.flash(H.t("zapped", { name: name(e.by) }), "warn", 1.6); }
      else if (e.k === "bonk") A.play("bonk");
    });
  }

  function sounds() {
    const S = G.S;
    if (!S) { DR.Audio.motor(false, 0, false); return; }
    const me = S.me(), ph = S.phase();
    // Countdown beeps.
    if (ph === "count" || (ph === "race" && S.raceT() < 0.2)) {
      const n = ph === "race" ? 0 : Math.ceil(DR.CFG.intro + DR.CFG.count - S.t);
      if (n !== G.lastCount) { G.lastCount = n; DR.Audio.play(n === 0 ? "go" : "beep"); }
    }
    if (me && me.missT > 0.6 && !G.missed) { G.missed = true; DR.Audio.play("miss"); }
    if (me && me.missT === 0) G.missed = false;
    const armed = !!me && (ph === "race" || (ph === "count" && S.t > DR.CFG.intro + 0.8)) && DR.View.shot !== "results";
    DR.Audio.motor(armed, me ? me.disp.speed : 0, me && me.turboT > 0);
  }

  DR.Game = G;
  boot();
})(globalThis.DR);
