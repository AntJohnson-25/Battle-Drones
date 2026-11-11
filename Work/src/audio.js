// Sound, all synthesised with Web Audio (no sound files, so nothing to license):
// the motor whine follows your speed; short blips for shots, hits and explosions.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const A = { on: true };
  let ctx = null, master = null, motor = null;
  try { A.on = localStorage.getItem("dr-sound") !== "0"; } catch (e) { /* storage blocked */ }

  // Browsers start audio only after a key press or click in the frame.
  A.wake = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = A.on ? 0.5 : 0;
      master.connect(ctx.destination);
      buildMotor();
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  A.toggle = function () {
    A.on = !A.on;
    try { localStorage.setItem("dr-sound", A.on ? "1" : "0"); } catch (e) { /* storage blocked */ }
    if (master) master.gain.setTargetAtTime(A.on ? 0.5 : 0, ctx.currentTime, 0.05);
  };

  function buildMotor() {
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400; f.Q.value = 2;
    const o1 = ctx.createOscillator(); o1.type = "sawtooth";
    const o2 = ctx.createOscillator(); o2.type = "square";
    const wob = ctx.createOscillator(); wob.frequency.value = 23;
    const wobG = ctx.createGain(); wobG.gain.value = 6;
    wob.connect(wobG); wobG.connect(o1.frequency); wobG.connect(o2.frequency);
    const m2 = ctx.createGain(); m2.gain.value = 0.35;
    o1.connect(f); o2.connect(m2); m2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start(); wob.start();
    motor = { g: g, f: f, o1: o1, o2: o2 };
  }

  // armed: props spinning; speed in m/s; turbo adds a sharper edge.
  A.motor = function (armed, speed, turbo) {
    if (!motor) return;
    const t = ctx.currentTime;
    const base = armed ? 140 + speed * 7 + (turbo ? 120 : 0) : 0;
    motor.o1.frequency.setTargetAtTime(Math.max(40, base), t, 0.08);
    motor.o2.frequency.setTargetAtTime(Math.max(40, base * 1.505), t, 0.08);
    motor.f.frequency.setTargetAtTime(900 + speed * 40 + (turbo ? 1500 : 0), t, 0.1);
    motor.g.gain.setTargetAtTime(armed ? 0.07 : 0, t, 0.15);
  };

  function tone(freq, dur, type, vol, slide, delay) {
    if (!ctx || !A.on) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, from, to) {
    if (!ctx || !A.on) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  A.play = function (name) {
    switch (name) {
      case "beep": tone(520, 0.18, "square", 0.12); break;
      case "go": tone(1040, 0.45, "square", 0.14); break;
      case "gate": tone(880, 0.09, "triangle", 0.14); tone(1320, 0.12, "triangle", 0.12, 0, 0.06); break;
      case "lap": [660, 880, 1100, 1320].forEach(function (f, i) { tone(f, 0.14, "triangle", 0.14, 0, i * 0.07); }); break;
      case "finish": [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, 0.22, "square", 0.1, 0, i * 0.11); }); break;
      case "pick": for (let i = 0; i < 6; i++) tone(700 + i * 90, 0.06, "square", 0.06, 0, i * 0.08); break;
      case "box": tone(400, 0.08, "triangle", 0.08); break;
      case "turbo": noise(0.7, 0.25, 300, 3000); tone(200, 0.6, "sawtooth", 0.08, 900); break;
      case "dart": noise(0.25, 0.2, 3000, 800); tone(1500, 0.25, "sawtooth", 0.06, 400); break;
      case "shield": tone(600, 0.5, "sine", 0.15, 1400); tone(900, 0.5, "sine", 0.1, 1800, 0.05); break;
      case "emp": tone(90, 0.6, "sawtooth", 0.2, 40); noise(0.5, 0.25, 4000, 200); break;
      case "smoke": noise(1.0, 0.18, 800, 300); break;
      case "hit": noise(0.35, 0.35, 1200, 150); tone(500, 0.6, "square", 0.12, 80); break;
      case "block": tone(1200, 0.2, "triangle", 0.15, 600); tone(1800, 0.25, "sine", 0.1); break;
      case "zap": tone(140, 0.4, "sawtooth", 0.15, 60); noise(0.3, 0.15, 5000, 1500); break;
      case "bonk": tone(110, 0.2, "square", 0.18, 60); break;
      case "miss": tone(300, 0.25, "square", 0.08, 200); break;
      case "fire": tone(1700 + Math.random() * 200, 0.07, "square", 0.035, 500); break;
      case "thit": tone(2200, 0.05, "triangle", 0.09); break;
      case "kill": noise(0.55, 0.38, 2200, 120); tone(160, 0.45, "sawtooth", 0.14, 45); tone(1320, 0.1, "triangle", 0.1, 0, 0.05); break;
      case "ace": noise(0.8, 0.45, 2600, 90); [880, 1175, 1568].forEach(function (f, i) { tone(f, 0.16, "square", 0.08, 0, 0.08 + i * 0.07); }); break;
      case "efire": tone(620, 0.16, "sawtooth", 0.035, 220); break;
      case "ouch": noise(0.25, 0.3, 900, 200); tone(240, 0.22, "square", 0.1, 90); break;
      case "down": noise(1.1, 0.4, 1600, 60); tone(400, 1.0, "sawtooth", 0.12, 40); break;
      case "respawn": [440, 660, 880].forEach(function (f, i) { tone(f, 0.12, "triangle", 0.1, 0, i * 0.07); }); break;
      case "over": [784, 659, 523, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "square", 0.09, 0, i * 0.12); }); break;
      case "tick": tone(1000, 0.06, "square", 0.06); break;
      case "crash": noise(0.45, 0.45, 700, 80); tone(130, 0.35, "square", 0.16, 50); break;
      case "roll": noise(0.35, 0.18, 600, 2400); break;
      case "flip": noise(0.45, 0.2, 400, 2600); tone(300, 0.4, "triangle", 0.06, 900); break;
      case "dodge": tone(1400, 0.08, "sine", 0.08); tone(1900, 0.1, "sine", 0.07, 0, 0.06); break;
      case "prox": tone(1250, 0.045, "square", 0.04); break;
      case "prox2": tone(1650, 0.045, "square", 0.06); break;
    }
  };

  DR.Audio = A;
})(globalThis.DR);
