// Keyboard and controller. Arrows (or WASD) fly, Space (or J) held fires, Shift
// brakes, C swaps FPV and chase camera, M mutes, I inverts climb. Esc is HopLobby's.
//
// Controller (any standard-layout pad: Xbox, PlayStation, Switch Pro):
//   left stick  steer and climb / dive      RT or A   fire (hold)
//   LT or B     brake                       LB / RB   barrel roll left / right
//   Y           flip                        X         camera
//   D-pad up    obstacle sensor             D-pad down  invert climb
//   Back/Select sound on / off
// In the menus the D-pad or stick moves between buttons and A presses one.
// Start is left alone: HopLobby's own menu belongs to Esc and its on-screen pill.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const I = { keys: new Set(), held: false, invert: false, onKey: null, onPad: null, pad: false };
  try { I.invert = localStorage.getItem("dr-invert") === "1"; } catch (e) { /* storage blocked */ }

  addEventListener("keydown", function (e) {
    if (e.code === "Escape") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
    if (I.held) return;
    if (!e.repeat && I.onKey) I.onKey(e.code);
    I.keys.add(e.code);
  });
  addEventListener("keyup", function (e) { I.keys.delete(e.code); });
  addEventListener("blur", function () { I.keys.clear(); });

  // ------------------------------------------------------------------ controller
  const P = { x: 0, y: 0, fire: false, brake: false, prev: [], navT: 0, focus: -1 };
  const DEAD = 0.2;
  // Pad button -> the key it stands in for (pressed once).
  const TAP = { 4: "KeyQ", 5: "KeyE", 3: "KeyX", 2: "KeyC", 12: "KeyO", 13: "KeyI", 8: "KeyM" };
  function dead(v) { const a = Math.abs(v); return a < DEAD ? 0 : Math.sign(v) * (a - DEAD) / (1 - DEAD); }
  function pads() {
    // Some embeds block the Gamepad API for frames: then there's simply no pad.
    try { return navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return []; }
  }
  function current() {
    const list = pads();
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g && g.connected && g.buttons.length >= 8 && (!best || (g.mapping === "standard" && best.mapping !== "standard"))) best = g;
    }
    return best;
  }
  function down(g, i) { const b = g.buttons[i]; return !!b && (b.pressed || b.value > 0.4); }

  // The buttons of whichever panel is open (course picker or results).
  function menuButtons() {
    const out = [];
    ["menu", "results"].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || el.hidden) return;
      el.querySelectorAll("button").forEach(function (b) { if (b.offsetParent !== null) out.push(b); });
    });
    return out;
  }
  function setFocus(btns, i) {
    btns.forEach(function (b, k) { b.classList.toggle("focus", k === i); });
    P.focus = i;
  }

  // Once a frame: read the pad, turn presses into the same actions as the keys.
  I.poll = function () {
    const g = current();
    if (!g) { if (I.pad) { I.pad = false; P.x = P.y = 0; P.fire = P.brake = false; P.prev = []; } return; }
    if (!I.pad) { I.pad = true; if (I.onPad) I.onPad(); }
    I.gp = g;
    const now = performance.now();
    const edge = function (i) { return down(g, i) && !P.prev[i]; };
    const sx = dead(g.axes[0] || 0), sy = dead(g.axes[1] || 0);
    const btns = I.held ? [] : menuButtons();
    if (btns.length) {
      // A menu is open: move between its buttons, A presses.
      P.x = P.y = 0; P.fire = P.brake = false;
      if (P.focus < 0 || P.focus >= btns.length || !btns[P.focus].classList.contains("focus")) setFocus(btns, 0);
      const dir = (down(g, 15) || down(g, 13) || sx > 0.6 || sy > 0.6 ? 1 : 0) - (down(g, 14) || down(g, 12) || sx < -0.6 || sy < -0.6 ? 1 : 0);
      if (dir && now > P.navT) { setFocus(btns, (P.focus + dir + btns.length) % btns.length); P.navT = now + 260; }
      if (!dir) P.navT = 0;
      if (edge(0)) { const b = btns[P.focus]; setFocus(btns, -1); b.click(); }
    } else if (!I.held) {
      P.focus = -1;
      P.x = sx; P.y = sy;
      P.fire = down(g, 7) || down(g, 0);
      P.brake = down(g, 6) || down(g, 1);
      Object.keys(TAP).forEach(function (i) { if (edge(+i) && I.onKey) I.onKey(TAP[i]); });
    }
    for (let i = 0; i < g.buttons.length; i++) P.prev[i] = down(g, i);
  };

  // A short buzz in the grips (where the pad and browser support it).
  I.rumble = function (ms, strength) {
    try {
      const a = I.pad && I.gp && I.gp.vibrationActuator;
      if (a && a.playEffect) a.playEffect("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(function () {});
    } catch (e) { /* no rumble */ }
  };

  const k = function (a, b) { return I.keys.has(a) || I.keys.has(b); };
  // Steering sensitivity (HopLobby menu): 0.5 gentle .. 1.5 twitchy. Default is calm.
  I.sens = 1;
  // Stick response curve: small pushes give small turns, full push still gives full.
  function curve(v) { return Math.sign(v) * Math.pow(Math.abs(v), 1.8); }
  // Fill the race's input from the keys and the pad.
  I.read = function (inp) {
    if (I.held) { inp.steer = 0; inp.climb = 0; inp.brake = false; inp.fire = false; return; }
    inp.fire = k("Space", "KeyJ") || P.fire;
    const ks = (k("ArrowLeft", "KeyA") ? 1 : 0) - (k("ArrowRight", "KeyD") ? 1 : 0);
    inp.steer = U1((ks - curve(P.x)) * I.sens);
    const c = U1(((k("ArrowUp", "KeyW") ? 1 : 0) - (k("ArrowDown", "KeyS") ? 1 : 0) - curve(P.y)) * Math.min(1, I.sens + 0.2));
    inp.climb = I.invert ? -c : c;
    inp.brake = k("ShiftLeft", "ShiftRight") || P.brake;
  };
  function U1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
  I.toggleInvert = function () {
    I.invert = !I.invert;
    try { localStorage.setItem("dr-invert", I.invert ? "1" : "0"); } catch (e) { /* storage blocked */ }
  };
  // HopLobby's menu is open: drop this player's input (the race carries on for everyone).
  I.hold = function (on) { I.held = on; I.keys.clear(); P.x = P.y = 0; P.fire = P.brake = false; };

  DR.Input = I;
})(globalThis.DR);
