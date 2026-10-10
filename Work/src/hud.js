// The HUD: place, lap and time, standings with HopLobby portraits, the pickup
// slot, countdown, warnings, a marker for your next gate, the FPV goggles' OSD,
// the minimap, the "goggles on" static, and the results. English and pt-PT.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U, CFG = DR.CFG;
  const H = { locale: "en", portraits: {}, last: {} };

  const STR = {
    en: {
      lap: "LAP", go: "GO!", missed: "MISSED GATE {n}: TURN BACK", wrong: "WRONG WAY", finished: "FINISHED!",
      waitHost: "Waiting for the host…", waitNext: "Waiting for the host to start the next race…",
      again: "RACE AGAIN", end: "END GAME FOR EVERYONE", back: "BACK TO LOBBY", dnf: "DNF", left: "left",
      pilot: "PILOT", track: "Canyon Loop", laps: "{n} laps", results: "RESULTS", you: "you", watching: "Watching this race",
      hitBy: "Hit by {name}'s dart!", blocked: "Your shield blocked it!", zapped: "Zapped by {name}'s EMP!",
      leftRace: "{name} left the race", host: "You're the host now", use: "SPACE", lastLap: "FINAL LAP!",
      keys: "Arrows: steer / climb · Space: pickup · Shift: brake · C: camera · M: sound · I: invert climb",
      items: [null, "Turbo", "Homing dart", "Shield", "EMP pulse", "Smoke trail"]
    },
    "pt-PT": {
      lap: "VOLTA", go: "JÁ!", missed: "FALHASTE A PORTA {n}: VOLTA ATRÁS", wrong: "SENTIDO ERRADO", finished: "TERMINASTE!",
      waitHost: "À espera do anfitrião…", waitNext: "À espera que o anfitrião comece a próxima corrida…",
      again: "CORRER OUTRA VEZ", end: "TERMINAR O JOGO PARA TODOS", back: "VOLTAR AO LOBBY", dnf: "N/T", left: "saiu",
      pilot: "PILOTO", track: "Circuito do Desfiladeiro", laps: "{n} voltas", results: "RESULTADOS", you: "tu", watching: "A assistir a esta corrida",
      hitBy: "Atingido pelo dardo de {name}!", blocked: "O teu escudo bloqueou!", zapped: "Atingido pelo EMP de {name}!",
      leftRace: "{name} saiu da corrida", host: "Agora és o anfitrião", use: "ESPAÇO", lastLap: "ÚLTIMA VOLTA!",
      keys: "Setas: virar / subir · Espaço: item · Shift: travar · C: câmara · M: som · I: inverter subida",
      items: [null, "Turbo", "Dardo teleguiado", "Escudo", "Pulso EMP", "Rasto de fumo"]
    }
  };
  function t(key, vars) {
    let s = (STR[H.locale] || STR.en)[key];
    if (s === undefined) s = STR.en[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }
  H.t = t;

  const ICONS = [null,
    '<path d="M6 30 L20 16 L6 2 M18 30 L32 16 L18 2" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>',
    '<path d="M3 16 H26 M18 7 L29 16 L18 25" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="16" r="3" fill="currentColor"/>',
    '<path d="M17 2 L30 7 V15 C30 23 24 28 17 31 C10 28 4 23 4 15 V7 Z" fill="currentColor"/>',
    '<path d="M19 1 L6 18 H15 L12 31 L27 12 H18 Z" fill="currentColor"/>',
    '<path d="M9 26 C3 26 2 19 7 17 C7 11 14 9 17 13 C19 8 28 9 28 15 C33 16 33 26 26 26 Z" fill="currentColor"/>'
  ];
  const ITEM_COL = [null, "#ffa53a", "#ff3d7f", "#6ae0ff", "#9fd0ff", "#c9ccd6"];
  function svg(i) { return '<svg viewBox="0 0 34 33" width="100%" height="100%">' + ICONS[i] + "</svg>"; }

  const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const $ = function (id) { return document.getElementById(id); };
  function hex(c) { return "#" + ("000000" + c.toString(16)).slice(-6); }
  function fmt(s) {
    if (s < 0) return "--:--.--";
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
  }
  H.fmt = fmt;
  // Only touch the DOM when something changed.
  function set(el, key, text, html) {
    if (H.last[key] === text) return;
    H.last[key] = text;
    if (html) el.innerHTML = text; else el.textContent = text;
  }

  H.init = function (locale) {
    H.locale = STR[locale] ? locale : "en";
    $("keys").textContent = t("keys");
    $("again").textContent = t("again");
    $("endAll").textContent = t("end");
    $("backLobby").textContent = t("back");
    $("resTitle").textContent = t("results");
    H.staticCtx = $("static").getContext("2d");
    H.mini = $("minimap").getContext("2d");
  };

  // Portraits: HopLobby's for players, a drawn badge for bots.
  H.portrait = function (r) {
    if (H.portraits[r.id]) return H.portraits[r.id];
    if (r.hl && typeof HopLobby !== "undefined" && HopLobby.context) {
      H.portraits[r.id] = "";
      HopLobby.avatar(r.hl, { size: 96 }).then(function (url) { H.portraits[r.id] = url; H.last.standings = null; })
        .catch(function () { H.portraits[r.id] = badge(r); });
      return "";
    }
    return (H.portraits[r.id] = badge(r));
  };
  function badge(r) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = hex(r.colour); x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#1d2230";
    if (r.bot) { x.fillRect(16, 22, 32, 22); x.fillStyle = "#fff"; x.fillRect(21, 29, 7, 7); x.fillRect(36, 29, 7, 7); }
    else { x.font = "bold 30px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText((r.name[0] || "?").toUpperCase(), 32, 34); }
    return c.toDataURL();
  }

  H.setRace = function (S) {
    H.S = S;
    H.portraits = {};
    H.last = {};
    H.msg = null; H.toastT = 0;
    $("results").hidden = true;
    $("wait").hidden = true;
    drawMapBase(S.T);
  };

  // A message in the middle for a moment.
  H.flash = function (text, cls, secs) { H.msg = { text: text, cls: cls || "", until: performance.now() / 1000 + (secs || 1.6) }; };
  H.toast = function (text) {
    const el = $("toast");
    el.textContent = text; el.classList.add("on");
    clearTimeout(H.toastTimer);
    H.toastTimer = setTimeout(function () { el.classList.remove("on"); }, 3200);
  };
  H.waiting = function (text) { const w = $("wait"); w.hidden = !text; if (text) w.textContent = text; };

  // ------------------------------------------------------------------ minimap
  let mapBase = null, mapT = null;
  function mapXY(x, z) {
    const s = 150 / mapT.span;
    return [10 + (x - mapT.x0) * s, 10 + (z - mapT.z0) * s];
  }
  function drawMapBase(T) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < T.M; i++) { const x = T.pts[i * 3], z = T.pts[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const span = Math.max(x1 - x0, z1 - z0);
    mapT = { x0: x0 - (span - (x1 - x0)) / 2, z0: z0 - (span - (z1 - z0)) / 2, span: span };
    mapBase = document.createElement("canvas");
    mapBase.width = mapBase.height = 170;
    const g = mapBase.getContext("2d");
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i <= T.M; i += 4) { const p = mapXY(T.pts[(i % T.M) * 3], T.pts[(i % T.M) * 3 + 2]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
    g.closePath();
    g.strokeStyle = "rgba(20,24,34,0.75)"; g.lineWidth = 9; g.stroke();
    g.strokeStyle = "#f6f5ef"; g.lineWidth = 3.5; g.stroke();
    const s = mapXY(T.gates[0].x, T.gates[0].z);
    g.fillStyle = "#1d2230"; g.fillRect(s[0] - 5, s[1] - 5, 10, 10);
    g.fillStyle = "#fff"; g.fillRect(s[0] - 5, s[1] - 5, 5, 5); g.fillRect(s[0], s[1], 5, 5);
  }
  function drawMap(S, me) {
    const g = H.mini;
    g.clearRect(0, 0, 170, 170);
    g.drawImage(mapBase, 0, 0);
    if (me && !me.finished) {
      const ng = S.T.gates[me.gate], p = mapXY(ng.x, ng.z);
      g.strokeStyle = "#c4f35b"; g.lineWidth = 2.5; g.beginPath(); g.arc(p[0], p[1], 6, 0, Math.PI * 2); g.stroke();
    }
    S.racers.slice().sort(function (a, b) { return (a === me) - (b === me); }).forEach(function (r) {
      if (r.left) return;
      const p = mapXY(r.disp.x, r.disp.z);
      g.fillStyle = hex(r.colour);
      g.strokeStyle = "#1d2230"; g.lineWidth = 2;
      g.beginPath(); g.arc(p[0], p[1], r === me ? 6 : 4, 0, Math.PI * 2); g.fill(); g.stroke();
      if (r === me) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 9, 0, Math.PI * 2); g.stroke(); }
    });
  }

  // ------------------------------------------------------------------ static
  function drawStatic(k) {
    const el = $("static");
    if (k <= 0.01) { if (H.last.st !== 0) { el.style.opacity = 0; H.last.st = 0; } return; }
    H.last.st = k;
    el.style.opacity = Math.min(1, k);
    const g = H.staticCtx, img = g.createImageData(160, 90), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // A rolling band, like a weak analogue video signal.
    const y = (performance.now() / 6) % 90;
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(0, y, 160, 6);
  }

  // ------------------------------------------------------------------ per frame
  H.frame = function (S, shot, net) {
    const me = S ? S.me() : null;
    const now = performance.now() / 1000;
    const hud = $("hud");
    const racing = !!S && (shot === "fpv" || shot === "chase" || shot === "lap" || shot === "goggles" || shot === "watch" || shot === "over");
    hud.classList.toggle("off", !racing);
    $("intro").hidden = !(shot === "pilot" || shot === "shoulder");
    $("osd").hidden = shot !== "fpv";
    if (!S) { drawStatic(0); return; }
    const ph = S.phase();

    // Intro card: your portrait and name, the course.
    if (me && (shot === "pilot" || shot === "shoulder")) {
      const src = H.portrait(me);
      if (H.last.introImg !== src) { $("introImg").src = src || BLANK; H.last.introImg = src; }
      set($("introName"), "introName", me.name);
      set($("introRole"), "introRole", t("pilot") + " · " + t("track") + " · " + t("laps", { n: S.laps }));
    }

    // Goggles on: static as the view cuts from the pilot to the drone.
    let st = 0;
    const gs = CFG.intro - 0.85;
    if (S.t > gs && S.t < CFG.intro + 0.35 && ph !== "race") st = S.t < CFG.intro - 0.55 ? (S.t - gs) / 0.3 : 1 - (S.t - (CFG.intro - 0.55)) / 0.9;
    if (me && me.spinT > 0) st = Math.max(st, 0.35 * me.spinT / CFG.spinT);
    if (me && me.slowT > 0) st = Math.max(st, 0.12 + Math.random() * 0.08);
    drawStatic(st);
    $("smoke").style.opacity = DR.View.smokeOnMe ? Math.min(0.92, DR.View.smokeOnMe * 1.4).toFixed(2) : 0;

    // Place, lap, time.
    if (me) {
      set($("place"), "place", U.ordinal(me.place, H.locale));
      set($("placeOf"), "placeOf", "/" + S.racers.length);
      const lap = Math.max(1, Math.min(S.laps, me.lap));
      set($("lap"), "lap", me.finished ? t("finished") : t("lap") + " " + lap + "/" + S.laps);
      const rt = ph === "race" ? (me.finished ? me.finishT : S.raceT()) : 0;
      set($("time"), "time", fmt(rt));
    } else {
      set($("place"), "place", ""); set($("placeOf"), "placeOf", "");
      set($("lap"), "lap", t("watching")); set($("time"), "time", ph === "race" ? fmt(S.raceT()) : "");
    }

    // Standings (rebuilt only when the order, or a portrait, changes).
    const order = S.racers.slice().sort(function (a, b) { return a.place - b.place; });
    const key = order.map(function (r) { return r.id + (r.finished ? "f" : "") + (r.left ? "l" : ""); }).join(",") + Object.keys(H.portraits).length;
    if (H.last.standings !== key) {
      H.last.standings = key;
      $("standings").innerHTML = "";
      order.forEach(function (r) {
        const row = document.createElement("div");
        row.className = "row" + (r === me ? " me" : "") + (r.left ? " gone" : "");
        const pl = document.createElement("b"); pl.textContent = r.left ? "–" : r.place;
        const img = document.createElement("img"); img.src = H.portrait(r) || BLANK; img.style.borderColor = hex(r.colour);
        const nm = document.createElement("span"); nm.textContent = r.name + (r.left ? " (" + t("left") + ")" : "");
        row.append(pl, img, nm);
        if (r.finished) { const f = document.createElement("i"); f.textContent = "🏁"; row.append(f); }
        $("standings").append(row);
      });
    }

    // Pickup slot.
    const it = me ? me.item : 0;
    const itemEl = $("item");
    if (H.last.item !== it) {
      H.last.item = it;
      itemEl.classList.toggle("has", !!it);
      $("itemIcon").innerHTML = it ? svg(it) : "";
      $("itemIcon").style.color = it ? ITEM_COL[it] : "";
      $("itemName").textContent = it ? STR[H.locale].items[it] || STR.en.items[it] : "";
      $("itemKey").textContent = it ? t("use") : "";
      if (it) { itemEl.classList.remove("pop"); void itemEl.offsetWidth; itemEl.classList.add("pop"); }
    }

    // Countdown and big messages.
    let big = "", cls = "";
    if (ph === "count") { const n = Math.ceil(CFG.intro + CFG.count - S.t); big = String(n); cls = "count"; }
    else if (ph === "race" && S.raceT() < 0.8) { big = t("go"); cls = "go"; }
    else if (H.msg && now < H.msg.until) { big = H.msg.text; cls = H.msg.cls; }
    else if (me && me.missT > 0.6) { big = t("missed", { n: me.gate }); cls = "warn"; }
    else if (me && me.wrongT > 0.8) { big = t("wrong"); cls = "warn"; }
    const c = $("center");
    if (H.last.big !== big + cls) { H.last.big = big + cls; c.textContent = big; c.className = cls; if (big) { c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse"); } }

    // Next-gate marker: over the gate when it's on screen, at the edge when not.
    const mk = $("marker");
    if (me && !me.finished && (ph === "race" || ph === "count") && (shot === "fpv" || shot === "chase")) {
      const g = S.T.gates[me.gate];
      const p = DR.View.project(g.x, g.y + g.h / 2 + 1.5, g.z);
      const dist = Math.hypot(g.x - me.disp.x, g.y - me.disp.y, g.z - me.disp.z);
      let x = p.x, y = p.y, edge = false;
      const m = 60;
      if (p.behind || x < m || x > innerWidth - m || y < m || y > innerHeight - m) {
        edge = true;
        let nx = p.ndcX, ny = p.ndcY;
        if (p.behind) { nx = -nx; ny = -ny; }
        const a = Math.atan2(-ny, nx);
        const cx = innerWidth / 2, cy = innerHeight / 2;
        const k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
        x = cx + Math.cos(a) * k; y = cy + Math.sin(a) * k;
        mk.style.setProperty("--rot", (a * 180 / Math.PI) + "deg");
      }
      mk.hidden = false;
      mk.classList.toggle("edge", edge);
      mk.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
      set($("markerDist"), "mdist", Math.round(dist) + " m");
    } else mk.hidden = true;

    // FPV goggles' on-screen display: battery sagging over the race, signal, timer.
    if (shot === "fpv" && me) {
      const v = 16.8 - Math.min(2.4, Math.max(0, S.raceT()) / 70) - (me.turboT > 0 ? 0.4 : 0);
      set($("osdBatt"), "osdBatt", v.toFixed(1) + "V");
      set($("osdSpeed"), "osdSpeed", Math.round(me.disp.speed * 3.6) + " km/h");
      set($("osdAlt"), "osdAlt", Math.round(me.disp.y - S.T.terrain(me.disp.x, me.disp.z)) + " m");
    }

    drawMap(S, me);

    // Results.
    const showRes = S.over && (shot === "results" || !me);
    if (showRes && $("results").hidden) {
      $("results").hidden = false;
      const body = $("resBody");
      body.innerHTML = "";
      (S.results || []).forEach(function (res, i) {
        const r = S.racers[res.id];
        if (!r) return;
        const row = document.createElement("div");
        row.className = "rrow" + (r === me ? " me" : "") + (i === 0 ? " first" : "");
        const pl = document.createElement("b"); pl.textContent = r.left ? "–" : U.ordinal(i + 1, H.locale);
        const img = document.createElement("img"); img.src = H.portrait(r) || BLANK; img.style.borderColor = hex(r.colour);
        const nm = document.createElement("span"); nm.textContent = r.name;
        const tm = document.createElement("em"); tm.textContent = r.left ? t("left") : res.t >= 0 ? fmt(res.t) : t("dnf");
        row.append(pl, img, nm, tm);
        body.append(row);
      });
      const host = !net || !net.isClient();
      $("again").hidden = !host;
      $("endAll").hidden = !(net && net.isHost());
      $("resWait").hidden = host;
      $("resWait").textContent = t("waitNext");
      $("backLobby").hidden = !!(net && net.isHost());
    }
    if (!S.over && !$("results").hidden) $("results").hidden = true;

    if (H.debug) set($("debug"), "debug", "fps " + (DR.View.fps || 0).toFixed(0) + " · px " + DR.View.pr.toFixed(2) + " · " + JSON.stringify(DR.Pilot.avatarStates()));
  };

  DR.Hud = H;
})(globalThis.DR);
