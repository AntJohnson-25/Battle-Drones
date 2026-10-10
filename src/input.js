// Keyboard. Arrows (or WASD) fly, Space / Enter fires the pickup, Shift brakes,
// C swaps FPV and chase camera, M mutes, I inverts climb. Esc is HopLobby's.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const I = { keys: new Set(), held: false, invert: false, onKey: null };
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

  const k = function (a, b) { return I.keys.has(a) || I.keys.has(b); };
  // Fill the race's input from the keys.
  I.read = function (inp) {
    if (I.held) { inp.steer = 0; inp.climb = 0; inp.brake = false; return; }
    inp.steer = (k("ArrowLeft", "KeyA") ? 1 : 0) - (k("ArrowRight", "KeyD") ? 1 : 0);
    const c = (k("ArrowUp", "KeyW") ? 1 : 0) - (k("ArrowDown", "KeyS") ? 1 : 0);
    inp.climb = I.invert ? -c : c;
    inp.brake = k("ShiftLeft", "ShiftRight");
  };
  I.toggleInvert = function () {
    I.invert = !I.invert;
    try { localStorage.setItem("dr-invert", I.invert ? "1" : "0"); } catch (e) { /* storage blocked */ }
  };
  // HopLobby's menu is open: drop this player's input (the race carries on for everyone).
  I.hold = function (on) { I.held = on; I.keys.clear(); };

  DR.Input = I;
})(globalThis.DR);
