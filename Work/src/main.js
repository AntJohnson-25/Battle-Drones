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

  // The host's pick in HopLobby's Match settings (same list as hoplobby.json "options").
  DR.LOBBY_OPTIONS = [
    { key: "course", label: { en: "Course", "pt-PT": "Percurso" }, type: "choice", default: "city",
      choices: [
        { value: "city", label: { en: "City", "pt-PT": "Cidade" } },
        { value: "mountain", label: { en: "Mountain", "pt-PT": "Montanha" } },
        { value: "dunes", label: { en: "Dunes", "pt-PT": "Dunas" } },
        { value: "random", label: { en: "Random", "pt-PT": "Aleatório" } }
      ] }
  ];
  // Each player's own settings and the key list, in HopLobby's Esc menu.
  DR.MENU = {
    settings: [
      { key: "steering", label: { en: "Steering sensitivity", "pt-PT": "Sensibilidade da direção" }, type: "choice", default: 0.8, section: "controls",
        choices: [
          { value: 0.6, label: { en: "Gentle", "pt-PT": "Suave" } },
          { value: 0.8, label: { en: "Smooth", "pt-PT": "Fluida" } },
          { value: 1, label: { en: "Normal", "pt-PT": "Normal" } },
          { value: 1.25, label: { en: "Twitchy", "pt-PT": "Rápida" } }
        ] },
      { key: "invertClimb", label: { en: "Invert climb", "pt-PT": "Inverter subida" }, type: "toggle", default: false, section: "controls" },
      { key: "camera", label: { en: "Camera", "pt-PT": "Câmara" }, type: "choice", default: "fpv",
        choices: [{ value: "fpv", label: "FPV" }, { value: "chase", label: { en: "Chase", "pt-PT": "Perseguição" } }] },
      { key: "sensor", label: { en: "Obstacle sensor beeps", "pt-PT": "Sensor de obstáculos" }, type: "toggle", default: false }
    ],
    controls: [
      { title: "Flying", keys: [
        { keys: ["←", "→", "A", "D"], action: "Steer" },
        { keys: ["↑", "↓", "W", "S"], action: "Climb / dive" },
        { keys: ["Shift"], action: "Brake (tighter turns)" },
        { keys: ["Q", "E"], action: "Barrel roll (dodge)" },
        { keys: ["X"], action: "Flip (dodge)" }
      ] },
      { title: "Hunting", keys: [
        { keys: ["Space", "J"], action: "Fire (hold)" },
        { keys: ["C"], action: "FPV / chase camera" },
        { keys: ["O"], action: "Obstacle sensor" },
        { keys: ["I"], action: "Invert climb" },
        { keys: ["M"], action: "Sound on / off" }
      ] },
      { title: "Controller", keys: [
        { keys: ["Left stick"], action: "Steer, climb / dive" },
        { keys: ["RT", "A"], action: "Fire" },
        { keys: ["LT", "B"], action: "Brake" },
        { keys: ["LB", "RB"], action: "Barrel roll" },
        { keys: ["Y"], action: "Flip" }
      ] }
    ],
    shared: ["graphics", "audio", "shake"]
  };

  async function boot() {
    HopLobby.progress(0.05, "Joining the lobby");
    let ctx;
    try { ctx = await HopLobby.init({ lobbyOptions: DR.LOBBY_OPTIONS }); } catch (e) { fatal(e.message); return; }
    G.myId = ctx.playerId;
    G.course = pickCourse((ctx.options || HopLobby.options || {}).course);
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
      promoted: function () {
        DR.Hud.toast(DR.Hud.t("host")); DR.Hud.last.res = null;
        if (!G.S) startRound(G.course);
        else if (G.S.over) endRound();     // the old host left before ending it: we do
      },
      left: function (name) { DR.Hud.toast(DR.Hud.t("leftRace", { name: name })); }
    });
    if (qs.has("course")) G.course = pickCourse(qs.get("course"));

    HopLobby.on("pause", function () { DR.Input.hold(true); if (!DR.Net.online()) G.paused = true; });
    HopLobby.on("graphics", function (g) { DR.View.applyGraphics(g); });
    try {
      applyPrefs(await HopLobby.menu.set(DR.MENU));
    } catch (e) { /* the menu is HopLobby's: play on with the defaults */ }
    HopLobby.on("prefs", applyPrefs);
    HopLobby.on("resume", function () { DR.Input.hold(false); G.paused = false; });
    HopLobby.on("relay", function (s) { $("status").textContent = s === "open" ? "" : s === "connecting" ? "Connecting…" : "Reconnecting…"; });
    if (ctx.standalone) $("status").textContent = "Standalone: open this from a HopLobby lobby (Dev Mode) to hunt with up to 8 players.";
    wireButtons();
    DR.Input.onKey = onKey;
    DR.Input.onPad = function () { DR.Hud.toast(DR.Hud.t("pad")); $("padKeys").hidden = false; };
    if (DR.Input.pad) $("padKeys").hidden = false;
    HopLobby.progress(1, "Ready");
    HopLobby.ready();
    // HopLobby already ran the lobby, Ready and countdown: the host starts the hunt
    // straight away on the course picked in Match settings; everyone else gets it from them.
    if (DR.Net.isClient()) DR.Hud.waiting(DR.Hud.t("waitHost"));
    else startRound(G.course);
    G.last = performance.now() / 1000;
    requestAnimationFrame(frame);
    hiddenTicker();
  }

  function fatal(msg) { const el = $("err"); el.hidden = false; el.textContent = msg; }

  function pickCourse(c) {
    if (c === "random") return DR.Track.COURSES[Math.floor(Math.random() * DR.Track.COURSES.length)];
    return DR.Track.COURSES.indexOf(c) >= 0 ? c : "city";
  }

  // Personal settings from HopLobby's Esc menu.
  function applyPrefs(p) {
    if (!p) return;
    const s = Number(p.steering);
    if (s >= 0.4 && s <= 1.6) DR.Input.sens = s;
    if (typeof p.invertClimb === "boolean" && p.invertClimb !== DR.Input.invert) DR.Input.toggleInvert();
    if (typeof p.sensor === "boolean") DR.Hud.sensor = p.sensor;
    if ((p.camera === "fpv" || p.camera === "chase") && DR.View.mode !== p.camera) DR.View.toggleCamera();
  }

  // Round over: the host hands the scores to HopLobby (results screen + rematch).
  // A few seconds first so everyone's final score lands.
  function endRound() {
    if (G.ended || DR.Net.isClient()) return;
    G.ended = true;
    setTimeout(function () {
      const S = G.S;
      const res = DR.Sim.rank(S);
      const entries = [];
      res.forEach(function (x, i) {
        const r = S.racers[x.id];
        if (!r.hl || r.left) return;
        entries.push({ playerId: r.hl, place: i + 1, score: r.score, label: r.score + " pts" });
      });
      try { HopLobby.endGame({ title: DR.Hud.t(S.T.course), entries: entries }); } catch (e) { /* standalone */ }
    }, 5000);
  }

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
  }
  addEventListener("pointerdown", function () { DR.Audio.wake(); });

  function wireButtons() {
    // No buttons of our own any more: HopLobby runs the lobby, results and rematch.
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
    if (S.over && !G.ended) endRound();
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
    // Where a sound is, from the cockpit: left or right, and quieter with distance.
    const U = DR.U;
    function at(name, e, range) {
      if (!me) { A.play(name); return; }
      const dx = e.x - me.x, dz = e.z - me.z, d = Math.hypot(dx, dz) || 1;
      A.play(name, (dx * -U.fwdZ(me.yaw) + dz * U.fwdX(me.yaw)) / d * 0.8, Math.max(0.25, 1 - d / range));
    }
    S.events.forEach(function (e) {
      if (e.k === "fire") { if (!fired) A.play("fire"); fired = true; }
      else if (e.k === "thit") { at("thit", e, 400); H.hit(false); V.spark(e.x, e.y, e.z); }
      else if (e.k === "kill" && e.boss) { at("bossdown", e, 600); H.hit(true); H.points(H.t("bossDown", { n: e.pts }), "boss"); V.boom(e.x, e.y, e.z, 2); V.shake = 1.5; DR.Input.rumble(500, 1); }
      else if (e.k === "kill") { at(e.ace ? "ace" : "kill", e, 380); H.hit(true); H.points(e.ace ? H.t("ace") : H.t("kill"), e.ace); V.boom(e.x, e.y, e.z, e.ace); }
      else if (e.k === "boss") { A.play("boss"); H.flash(H.t("bossIn", { name: e.name }), "warn", 2.6); }
      else if (e.k === "mini") { if (me && Math.hypot(e.x - me.x, e.z - me.z) < 120) at("mini", e, 200); }
      else if (e.k === "troll") A.play("troll");
      else if (e.k === "spark") V.spark(e.x, e.y, e.z);
      else if (e.k === "efire") { if (me && Math.hypot(e.x - me.x, e.z - me.z) < 90) at("efire", e, 130); }
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
