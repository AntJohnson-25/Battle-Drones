// Sound, all synthesised with Web Audio (no sound files, so nothing to license):
// the motor whine follows your speed; short blips for shots, hits and explosions.
globalThis.DR = globalThis.DR || {};
(function (DR) {
  "use strict";
  const A = { on: true };
  let ctx = null, master = null, motor = null, dry = null, out = null, wind = null;
  try { A.on = localStorage.getItem("dr-sound") !== "0"; } catch (e) { /* storage blocked */ }

  // Browsers start audio only after a key press or click in the frame.
  A.wake = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = A.on ? 0.5 : 0;
      // A limiter so a burst of explosions never crackles, and a faint slap-back
      // echo on the effects so shots and bangs sound like they are outdoors.
      dry = ctx.createDynamicsCompressor();
      dry.threshold.value = -14; dry.ratio.value = 6; dry.attack.value = 0.003; dry.release.value = 0.18;
      dry.connect(ctx.destination);
      const post = ctx.createGain(); post.gain.value = 1;
      master.connect(post); post.connect(dry);
      const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.21;
      const fb = ctx.createGain(); fb.gain.value = 0.26;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500;
      const wet = ctx.createGain(); wet.gain.value = 0.2;
      master.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(dry);
      A.muteG = ctx.createGain(); A.muteG.gain.value = A.on ? 1 : 0;   // the motor and wind bypass the echo
      A.muteG.connect(dry);
      out = master;
      buildMotor();
      buildWind();
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  A.toggle = function () {
    A.on = !A.on;
    try { localStorage.setItem("dr-sound", A.on ? "1" : "0"); } catch (e) { /* storage blocked */ }
    if (master) { master.gain.setTargetAtTime(A.on ? 0.5 : 0, ctx.currentTime, 0.05); A.muteG.gain.setTargetAtTime(A.on ? 1 : 0, ctx.currentTime, 0.05); }
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
    o1.connect(f); o2.connect(m2); m2.connect(f); f.connect(g); g.connect(A.muteG);
    o1.start(); o2.start(); wob.start();
    motor = { g: g, f: f, o1: o1, o2: o2 };
  }

  // Air rushing past: looped noise that rises and brightens with speed.
  function buildWind() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(A.muteG);
    s.start();
    wind = { f: f, g: g };
  }

  // armed: props spinning; speed in m/s; turbo adds a sharper edge.
  A.motor = function (armed, speed, turbo) {
    if (!motor) return;
    const t = ctx.currentTime;
    const base = armed ? 140 + speed * 7 + (turbo ? 120 : 0) : 0;
    motor.o1.frequency.setTargetAtTime(Math.max(40, base), t, 0.08);
    motor.o2.frequency.setTargetAtTime(Math.max(40, base * 1.505), t, 0.08);
    motor.f.frequency.setTargetAtTime(420 + speed * 16 + (turbo ? 1500 : 0), t, 0.1);
    motor.g.gain.setTargetAtTime(armed ? 0.011 : 0, t, 0.15);   // stealth drones: a soft, dark hum
    if (wind) {
      const k = armed ? Math.min(1, speed / 32) : 0;
      wind.g.gain.setTargetAtTime(k * k * 0.05, t, 0.2);
      wind.f.frequency.setTargetAtTime(350 + k * 900, t, 0.2);
    }
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
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, from, to, delay, kind) {
    if (!ctx || !A.on) return;
    const t = ctx.currentTime + (delay || 0);
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = kind || "bandpass"; f.Q.value = kind ? 0.7 : 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t);
  }

  // pan (-1 left .. 1 right) and vol (0..1) place a sound that happens out in the world.
  A.play = function (name, pan, vol) {
    if (!ctx || !A.on) return;
    out = master;
    if ((pan || vol !== undefined) && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(), g = ctx.createGain();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.gain.value = vol === undefined ? 1 : vol;
      p.connect(g); g.connect(master); out = p;
    }
    recipe(name);
    out = master;
  };
  function recipe(name) {
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
      case "fire": { const j = Math.random(); noise(0.06, 0.2, 5200, 1800); tone(1250 + j * 220, 0.1, "sawtooth", 0.085, 240); tone(190, 0.07, "sine", 0.14, 80); break; }
      case "thit": tone(2400 + Math.random() * 500, 0.045, "triangle", 0.1, 1400); noise(0.04, 0.12, 6500, 3000); break;
      case "kill": noise(0.12, 0.5, 5000, 900); noise(0.7, 0.4, 1400, 90, 0.02, "lowpass"); tone(120, 0.5, "sine", 0.3, 34); noise(0.5, 0.1, 5000, 2500, 0.15); tone(1320, 0.1, "triangle", 0.09, 0, 0.06); break;
      case "ace": noise(0.14, 0.55, 5500, 900); noise(0.95, 0.45, 1600, 70, 0.02, "lowpass"); tone(110, 0.7, "sine", 0.32, 30); [880, 1175, 1568].forEach(function (f, i) { tone(f, 0.16, "square", 0.08, 0, 0.08 + i * 0.07); }); break;
      case "efire": tone(760, 0.2, "sawtooth", 0.05, 170); tone(1520, 0.12, "square", 0.018, 340); break;
      case "ouch": noise(0.07, 0.4, 4200, 1500); noise(0.28, 0.32, 700, 140, 0, "lowpass"); tone(170, 0.22, "sine", 0.22, 60); tone(980, 0.3, "triangle", 0.035, 940); break;
      case "down": noise(0.15, 0.5, 5000, 800); noise(1.3, 0.42, 1500, 50, 0, "lowpass"); tone(95, 0.9, "sine", 0.3, 30); tone(520, 1.2, "sawtooth", 0.09, 45); break;
      case "respawn": [440, 660, 880].forEach(function (f, i) { tone(f, 0.12, "triangle", 0.1, 0, i * 0.07); }); break;
      case "over": [784, 659, 523, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "square", 0.09, 0, i * 0.12); }); break;
      case "tick": tone(1000, 0.06, "square", 0.06); break;
      case "crash": noise(0.06, 0.5, 3600, 1200); noise(0.45, 0.45, 600, 70, 0, "lowpass"); tone(105, 0.35, "sine", 0.3, 40); noise(0.3, 0.08, 4500, 2200, 0.08); break;
      case "roll": noise(0.38, 0.2, 500, 2800); noise(0.2, 0.1, 2800, 700, 0.3); break;
      case "flip": noise(0.45, 0.2, 400, 2600); tone(300, 0.4, "triangle", 0.06, 900); break;
      case "dodge": tone(1400, 0.08, "sine", 0.08); tone(1900, 0.1, "sine", 0.07, 0, 0.06); break;
      case "boss": [196, 185, 174, 147].forEach(function (f, i) { tone(f, 0.34, "sawtooth", 0.13, 0, i * 0.24); tone(f / 2, 0.34, "square", 0.08, 0, i * 0.24); }); break;
      case "bossdown": noise(0.2, 0.6, 5500, 700); noise(1.6, 0.5, 1800, 45, 0.03, "lowpass"); tone(80, 1.3, "sine", 0.35, 28); noise(0.5, 0.35, 1200, 80, 0.45, "lowpass"); noise(0.5, 0.3, 1000, 70, 0.8, "lowpass"); tone(220, 1.1, "sawtooth", 0.14, 40); [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.18, "square", 0.09, 0, 0.3 + i * 0.09); }); break;
      case "mini": tone(900, 0.12, "triangle", 0.05, 1500); break;
      case "troll": noise(0.2, 0.06, 900, 2600); break;
      case "prox":tone(1250, 0.045, "square", 0.04); break;
      case "prox2": tone(1650, 0.045, "square", 0.06); break;
    }
  };

  DR.Audio = A;
})(globalThis.DR);
