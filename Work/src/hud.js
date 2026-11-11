// The HUD: score, round clock, health, the live scoreboard with HopLobby portraits,
// the crosshair (it locks red over a target), target brackets and an edge arrow to
// the nearest one, hit markers, the damage flash, the FPV goggles' OSD, the minimap,
// the "goggles on" static, the course picker and the results. English and pt-PT.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const U = DR.U, CFG = DR.CFG;
  const H = { locale: "en", portraits: {}, last: {} };

  const STR = {
    en: {
      go: "HUNT!", wrong: "WRONG WAY", pts: "PTS", left: "left", leftN: "{n} targets left", none: "Pack cleared!",
      waitHost: "Waiting for the host to pick a course…", waitNext: "Waiting for the host to start the next round…",
      pick: "PICK A COURSE", city: "City", mountain: "Mountain", cityD: "Weave between the towers", mountainD: "Valleys, a high col and a gorge",
      again: "HUNT AGAIN", end: "END GAME FOR EVERYONE", back: "BACK TO LOBBY", results: "FINAL SCORES", you: "you",
      pilot: "PILOT", brief: "3:00 · down as many target drones as you can · they shoot back",
      leftRace: "{name} left", host: "You're the host now", down: "SHOT DOWN", respawn: "Back in {n}",
      kill: "+1", ace: "+3 ACE!", lastMin: "1 MINUTE LEFT", last10: "", over: "TIME!", watching: "Watching",
      keys: "Arrows / WASD: fly · Space: fire (hold) · Shift: brake · C: camera · M: sound · I: invert climb",
      still: "still flying…"
    },
    "pt-PT": {
      go: "CAÇA!", wrong: "SENTIDO ERRADO", pts: "PTS", left: "saiu", leftN: "faltam {n} alvos", none: "Bando abatido!",
      waitHost: "À espera que o anfitrião escolha o percurso…", waitNext: "À espera que o anfitrião comece a próxima ronda…",
      pick: "ESCOLHE O PERCURSO", city: "Cidade", mountain: "Montanha", cityD: "Ziguezague entre as torres", mountainD: "Vales, um colo alto e uma garganta",
      again: "CAÇAR OUTRA VEZ", end: "TERMINAR O JOGO PARA TODOS", back: "VOLTAR AO LOBBY", results: "PONTUAÇÃO FINAL", you: "tu",
      pilot: "PILOTO", brief: "3:00 · abate o máximo de drones-alvo · eles disparam de volta",
      leftRace: "{name} saiu", host: "Agora és o anfitrião", down: "ABATIDO", respawn: "De volta em {n}",
      kill: "+1", ace: "+3 ÁS!", lastMin: "FALTA 1 MINUTO", last10: "", over: "TEMPO!", watching: "A assistir",
      keys: "Setas / WASD: voar · Espaço: disparar · Shift: travar · C: câmara · M: som · I: inverter subida",
      still: "ainda a voar…"
    }
  };
  function t(key, vars) {
    let s = (STR[H.locale] || STR.en)[key];
    if (s === undefined) s = STR.en[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }
  H.t = t;

  const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const $ = function (id) { return document.getElementById(id); };
  function hex(c) { return "#" + ("000000" + c.toString(16)).slice(-6); }
  function clock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function set(el, key, text, html) {
    if (H.last[key] === text) return;
    H.last[key] = text;
    if (html) el.innerHTML = text; else el.textContent = text;
  }

  H.init = function (locale) {
    H.locale = STR[locale] ? locale : "en";
    $("keys").textContent = t("keys");
    $("endAll").textContent = t("end");
    $("backLobby").textContent = t("back");
    $("resTitle").textContent = t("results");
    $("pickTitle").textContent = t("pick");
    $("resWait").textContent = t("waitNext");
    document.querySelectorAll("[data-course]").forEach(function (b) {
      const c = b.getAttribute("data-course");
      b.querySelector("b").textContent = b.classList.contains("small") ? t("again") + " · " + t(c) : t(c);
      const d = b.querySelector("small"); if (d) d.textContent = t(c + "D");
    });
    H.staticCtx = $("static").getContext("2d");
    H.mini = $("minimap").getContext("2d");
    // Pooled target brackets.
    H.marks = [];
    for (let i = 0; i < CFG.alive + 1; i++) {
      const m = document.createElement("div"); m.className = "tmark"; m.hidden = true;
      m.innerHTML = "<i></i><span></span>";
      $("marks").append(m); H.marks.push(m);
    }
  };

  H.portrait = function (r) {
    if (H.portraits[r.id]) return H.portraits[r.id];
    if (r.hl && typeof HopLobby !== "undefined" && HopLobby.context) {
      H.portraits[r.id] = "";
      HopLobby.avatar(r.hl, { size: 96 }).then(function (url) { H.portraits[r.id] = url; H.last.board = null; })
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
    x.fillStyle = "#1d2230"; x.font = "bold 30px system-ui"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText((r.name[0] || "?").toUpperCase(), 32, 34);
    return c.toDataURL();
  }

  H.setRace = function (S) {
    H.S = S;
    H.portraits = {};
    H.last = {};
    H.msg = null; H.hitT = 0; H.pop = null;
    $("results").hidden = true;
    $("wait").hidden = true;
    $("menu").hidden = true;
    drawMapBase(S.T);
  };

  H.flash = function (text, cls, secs) { H.msg = { text: text, cls: cls || "", until: performance.now() / 1000 + (secs || 1.6) }; };
  H.hit = function (kill) { H.hitT = performance.now() / 1000; const el = $("hitmark"); el.className = kill ? "kill" : ""; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); };
  H.points = function (text, ace) {
    const el = $("pop"); el.textContent = text; el.className = ace ? "ace" : "";
    void el.offsetWidth; el.classList.add("on");
  };
  H.toast = function (text) {
    const el = $("toast");
    el.textContent = text; el.classList.add("on");
    clearTimeout(H.toastTimer);
    H.toastTimer = setTimeout(function () { el.classList.remove("on"); }, 3200);
  };
  H.waiting = function (text) { const w = $("wait"); w.hidden = !text; if (text) w.textContent = text; };
  // The course picker (host / solo) before a round.
  H.menu = function (show) { $("menu").hidden = !show; if (show) { $("results").hidden = true; $("wait").hidden = true; } };

  // ------------------------------------------------------------------ minimap
  let mapBase = null, mapT = null;
  function mapXY(x, z) { const s = 150 / mapT.span; return [10 + (x - mapT.x0) * s, 10 + (z - mapT.z0) * s]; }
  function drawMapBase(T) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < T.M; i++) { const x = T.pts[i * 3], z = T.pts[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const span = Math.max(x1 - x0, z1 - z0);
    mapT = { x0: x0 - (span - (x1 - x0)) / 2, z0: z0 - (span - (z1 - z0)) / 2, span: span };
    mapBase = document.createElement("canvas");
    mapBase.width = mapBase.height = 170;
    const g = mapBase.getContext("2d");
    if (T.buildings) {
      g.fillStyle = "rgba(150,160,180,0.35)";
      const s = 150 / mapT.span;
      T.buildings.forEach(function (b) { const p = mapXY(b.x - b.w / 2, b.z - b.d / 2); g.fillRect(p[0], p[1], b.w * s, b.d * s); });
    }
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i <= T.M; i += 4) { const p = mapXY(T.pts[(i % T.M) * 3], T.pts[(i % T.M) * 3 + 2]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
    g.closePath();
    g.strokeStyle = "rgba(20,24,34,0.75)"; g.lineWidth = 9; g.stroke();
    g.strokeStyle = "#f6f5ef"; g.lineWidth = 3.5; g.stroke();
  }
  function drawMap(S, me) {
    const g = H.mini;
    g.clearRect(0, 0, 170, 170);
    g.drawImage(mapBase, 0, 0);
    S.targets.forEach(function (tg) {
      const p = mapXY(tg.x, tg.z);
      g.fillStyle = tg.spec.ace ? "#ffc23a" : "#ff2d4a";
      g.beginPath(); g.moveTo(p[0], p[1] - 5); g.lineTo(p[0] + 4, p[1]); g.lineTo(p[0], p[1] + 5); g.lineTo(p[0] - 4, p[1]); g.fill();
    });
    S.racers.slice().sort(function (a, b) { return (a === me) - (b === me); }).forEach(function (r) {
      if (r.left || (r !== me && !(r.rb && r.rb.length))) return;
      const p = mapXY(r.disp.x, r.disp.z);
      g.fillStyle = hex(r.colour); g.strokeStyle = "#1d2230"; g.lineWidth = 2;
      g.beginPath(); g.arc(p[0], p[1], r === me ? 6 : 4, 0, Math.PI * 2); g.fill(); g.stroke();
      if (r === me) { g.strokeStyle = "#fff"; g.beginPath(); g.arc(p[0], p[1], 9, 0, Math.PI * 2); g.stroke(); }
    });
  }

  // ------------------------------------------------------------------ static
  function drawStatic(k) {
    const el = $("static");
    if (k <= 0.01) { if (H.last.st !== 0) { el.style.opacity = 0; H.last.st = 0; } return; }
    H.last.st = k;
    el.style.opacity = Math.min(1, k);
    const g = H.staticCtx, img = g.createImageData(160, 90), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const y = (performance.now() / 6) % 90;
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(0, y, 160, 6);
  }

  // ------------------------------------------------------------------ per frame
  H.frame = function (S, shot, net) {
    const me = S ? S.me() : null;
    const now = performance.now() / 1000;
    const flying = !!S && (shot === "fpv" || shot === "chase" || shot === "goggles" || shot === "watch" || shot === "over" || shot === "down");
    $("hud").classList.toggle("off", !flying);
    $("intro").hidden = !(shot === "pilot" || shot === "shoulder");
    $("osd").hidden = shot !== "fpv";
    $("cross").hidden = !(shot === "fpv" || shot === "chase") || !me || S.phase() !== "hunt";
    if (!S) { drawStatic(0); return; }
    const ph = S.phase();

    if (me && (shot === "pilot" || shot === "shoulder")) {
      const src = H.portrait(me);
      if (H.last.introImg !== src) { $("introImg").src = src || BLANK; H.last.introImg = src; }
      set($("introName"), "introName", me.name);
      set($("introRole"), "introRole", t("pilot") + " · " + t(S.T.course));
      set($("introBrief"), "introBrief", t("brief"));
    }

    // Static: goggles going on, being shot down, a hard hit.
    let st = 0;
    const gs = CFG.intro - 0.85;
    if (S.t > gs && S.t < CFG.intro + 0.35 && ph !== "hunt") st = S.t < CFG.intro - 0.55 ? (S.t - gs) / 0.3 : 1 - (S.t - (CFG.intro - 0.55)) / 0.9;
    if (me && me.downT > 0) st = Math.max(st, me.downT > CFG.downT - 0.5 ? 0.9 : 0.25);
    if (me && me.hurtT > 0) st = Math.max(st, me.hurtT * 0.35);
    drawStatic(st);
    $("hurt").style.opacity = me && me.hurtT > 0 ? (me.hurtT * 1.6).toFixed(2) : me && me.hp < 30 && me.downT <= 0 ? (0.25 + Math.sin(now * 6) * 0.1).toFixed(2) : 0;

    // Score, clock, targets left, health.
    if (me) {
      set($("score"), "score", String(me.score));
      const leftN = S.pack.length - S.next + S.targets.length;
      set($("left"), "left", leftN ? t("leftN", { n: leftN }) : t("none"));
      const hp = me.downT > 0 ? 0 : me.hp;
      if (H.last.hp !== hp) {
        H.last.hp = hp;
        $("hpFill").style.width = hp + "%";
        $("hpFill").className = hp < 30 ? "low" : hp < 60 ? "mid" : "";
        $("hpNum").textContent = Math.ceil(hp);
      }
    }
    const rem = ph === "hunt" ? S.left() : ph === "over" ? 0 : CFG.round;
    set($("clock"), "clock", clock(rem));
    $("clock").classList.toggle("hot", ph === "hunt" && rem <= 10);

    // Scoreboard.
    const order = S.racers.slice().sort(function (a, b) { return (a.left - b.left) || (b.score - a.score) || (a.lastKillT - b.lastKillT); });
    const key = order.map(function (r) { return r.id + ":" + r.score + (r.left ? "l" : "") + (r.downT > 0 ? "d" : ""); }).join(",") + Object.keys(H.portraits).length;
    if (H.last.board !== key) {
      H.last.board = key;
      const box = $("board");
      box.innerHTML = "";
      order.forEach(function (r, i) {
        const row = document.createElement("div");
        row.className = "row" + (r === me ? " me" : "") + (r.left ? " gone" : "") + (r.downT > 0 ? " dn" : "");
        const pl = document.createElement("b"); pl.textContent = r.left ? "–" : i + 1;
        const img = document.createElement("img"); img.src = H.portrait(r) || BLANK; img.style.borderColor = hex(r.colour);
        const nm = document.createElement("span"); nm.textContent = r.name + (r.left ? " (" + t("left") + ")" : "");
        const sc = document.createElement("em"); sc.textContent = r.score;
        row.append(pl, img, nm, sc);
        box.append(row);
      });
    }

    // Big messages.
    let big = "", cls = "";
    if (ph === "count") { big = String(Math.ceil(CFG.intro + CFG.count - S.t)); cls = "count"; }
    else if (ph === "hunt" && S.huntT() < 0.8) { big = t("go"); cls = "go"; }
    else if (me && me.downT > 0) { big = t("down"); cls = "warn"; }
    else if (H.msg && now < H.msg.until) { big = H.msg.text; cls = H.msg.cls; }
    else if (me && me.wrongT > 1.2 && ph === "hunt") { big = t("wrong"); cls = "warn"; }
    const c = $("center");
    if (H.last.big !== big + cls) { H.last.big = big + cls; c.textContent = big; c.className = cls; if (big) { c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse"); } }
    set($("sub"), "sub", me && me.downT > 0 ? t("respawn", { n: Math.ceil(me.downT) }) : "");

    // Crosshair lock and target brackets.
    let locked = false;
    const showMarks = me && ph === "hunt" && (shot === "fpv" || shot === "chase");
    let used = 0, nearest = null, nd = Infinity, edge = false;
    if (showMarks) {
      const a = DR.aimDir(me);
      S.targets.forEach(function (tg) {
        const dx = tg.x - me.x, dy = tg.y - me.y, dz = tg.z - me.z, d = Math.hypot(dx, dy, dz);
        if (d < CFG.assistRange && Math.acos(U.clamp((dx * a.x + dy * a.y + dz * a.z) / d, -1, 1)) < CFG.assist) locked = true;
        const p = DR.View.project(tg.x, tg.y, tg.z);
        const on = !p.behind && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight;
        if (on && used < H.marks.length - 1) {
          const m = H.marks[used++];
          const size = U.clamp(1400 / Math.max(d, 1), 26, 90);
          m.hidden = false; m.className = "tmark" + (tg.spec.ace ? " ace" : "");
          m.style.transform = "translate(" + Math.round(p.x) + "px," + Math.round(p.y) + "px)";
          m.style.setProperty("--s", size + "px");
          m.lastChild.textContent = Math.round(d) + " m";
        }
        if (!on && d < nd) { nd = d; nearest = { tg: tg, p: p, d: d }; }
      });
      // None on screen: an arrow at the edge toward the nearest.
      if (used === 0 && nearest) {
        const m = H.marks[H.marks.length - 1], p = nearest.p;
        let nx = p.ndcX, ny = p.ndcY;
        if (p.behind) { nx = -nx; ny = -ny; }
        const ang = Math.atan2(-ny, nx), cx = innerWidth / 2, cy = innerHeight / 2, mg = 70;
        const k = Math.min((cx - mg) / Math.abs(Math.cos(ang) || 1e-6), (cy - mg) / Math.abs(Math.sin(ang) || 1e-6));
        m.hidden = false; m.className = "tmark edge" + (nearest.tg.spec.ace ? " ace" : "");
        m.style.transform = "translate(" + Math.round(cx + Math.cos(ang) * k) + "px," + Math.round(cy + Math.sin(ang) * k) + "px)";
        m.style.setProperty("--rot", (ang * 180 / Math.PI) + "deg");
        m.lastChild.textContent = Math.round(nearest.d) + " m";
        edge = true;
      }
    }
    H.marks.forEach(function (m, i) { if (!showMarks || (i >= used && !(edge && i === H.marks.length - 1))) m.hidden = true; });
    $("cross").classList.toggle("lock", locked);

    // Incoming fire close by.
    let incoming = false;
    if (me && me.downT <= 0) S.bolts.forEach(function (b) {
      const dx = me.x - b.x, dy = me.y - b.y, dz = me.z - b.z, d = Math.hypot(dx, dy, dz);
      if (d < 35 && (dx * b.vx + dy * b.vy + dz * b.vz) / (d * CFG.boltSpeed) > 0.9) incoming = true;
    });
    $("incoming").classList.toggle("on", incoming);

    if (shot === "fpv" && me) {
      const v = 16.8 - Math.min(2.4, Math.max(0, S.huntT()) / 75);
      set($("osdBatt"), "osdBatt", v.toFixed(1) + "V");
      set($("osdSpeed"), "osdSpeed", Math.round(me.disp.speed * 3.6) + " km/h");
      set($("osdAlt"), "osdAlt", Math.round(me.disp.y - S.T.ground(me.disp.x, me.disp.z)) + " m");
    }

    drawMap(S, me);

    // Results: live, so late final scores still slot in.
    const showRes = S.over && (shot === "results" || !me);
    if (showRes) {
      const res = DR.Sim.rank(S);
      const rk = res.map(function (r) { const x = S.racers[r.id]; return r.id + ":" + r.score + (x.done || x === me ? "" : "?") + (x.left ? "l" : ""); }).join(",") + Object.keys(H.portraits).length;
      if ($("results").hidden || H.last.res !== rk) {
        H.last.res = rk;
        $("results").hidden = false;
        $("resCourse").textContent = t(S.T.course);
        const body = $("resBody");
        body.innerHTML = "";
        res.forEach(function (x, i) {
          const r = S.racers[x.id];
          const row = document.createElement("div");
          row.className = "rrow" + (r === me ? " me" : "") + (i === 0 && !r.left ? " first" : "");
          const pl = document.createElement("b"); pl.textContent = r.left ? "–" : U.ordinal(i + 1, H.locale);
          const img = document.createElement("img"); img.src = H.portrait(r) || BLANK; img.style.borderColor = hex(r.colour);
          const nm = document.createElement("span"); nm.textContent = r.name;
          const sc = document.createElement("em");
          sc.textContent = r.left ? t("left") : r.score + " " + t("pts") + (r !== me && !r.done && net && net.online() ? " · " + t("still") : "");
          row.append(pl, img, nm, sc);
          body.append(row);
        });
        const host = !net || !net.isClient();
        $("resPick").hidden = !host;
        $("endAll").hidden = !(net && net.isHost());
        $("resWait").hidden = host;
        $("backLobby").hidden = !!(net && net.isHost());
      }
    }
    if (!S.over && !$("results").hidden) $("results").hidden = true;

    if (H.debug) set($("debug"), "debug", "fps " + (DR.View.fps || 0).toFixed(0) + " · px " + DR.View.pr.toFixed(2) + " · " + JSON.stringify(DR.Pilot.avatarStates()));
  };

  DR.Hud = H;
})(globalThis.DR);
