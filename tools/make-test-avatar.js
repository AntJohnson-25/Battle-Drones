// A stand-in for a HopLobby avatar, built to the documented spec (developer
// docs, Avatars): glTF 2.0 binary, skinned, flat-shaded with vertex colours,
// a 19-bone skeleton (hips, spine, chest, neck, head, arms and legs, R and L),
// metres, feet at y = 0, facing -Z, about 1.6 m tall, clips idle / walk / run /
// jump / wave. tools/harness.html hands it out for HopLobby.avatar(id, {format:
// 'glb'}). Real avatars are never saved: this is a made-up figure.
//   node tools/make-test-avatar.js  -> tools/test-avatar.glb
"use strict";
const fs = require("fs");
const path = require("path");

// name, parent, head position relative to parent, box size [w, h, d], colour
// Bone axes stay aligned with the model (no bind rotations), like many exporters do not;
// the game must not rely on either.
const B = [
  ["Hips", -1, [0, 0.95, 0], [0.30, 0.16, 0.18], [0.20, 0.22, 0.30]],
  ["Spine", 0, [0, 0.10, 0], [0.28, 0.16, 0.17], [0.85, 0.35, 0.25]],
  ["Chest", 1, [0, 0.16, 0], [0.34, 0.20, 0.19], [0.85, 0.35, 0.25]],
  ["Neck", 2, [0, 0.20, 0], [0.08, 0.06, 0.08], [0.93, 0.76, 0.62]],
  ["Head", 3, [0, 0.06, 0], [0.20, 0.22, 0.21], [0.93, 0.76, 0.62]],
  ["Shoulder.R", 2, [0.07, 0.16, 0], [0.08, 0.06, 0.08], [0.85, 0.35, 0.25]],
  ["UpperArm.R", 5, [0.10, 0, 0], [0.09, 0.26, 0.09], [0.85, 0.35, 0.25]],
  ["LowerArm.R", 6, [0, -0.26, 0], [0.08, 0.24, 0.08], [0.93, 0.76, 0.62]],
  ["Hand.R", 7, [0, -0.24, 0], [0.07, 0.09, 0.05], [0.93, 0.76, 0.62]],
  ["Shoulder.L", 2, [-0.07, 0.16, 0], [0.08, 0.06, 0.08], [0.85, 0.35, 0.25]],
  ["UpperArm.L", 9, [-0.10, 0, 0], [0.09, 0.26, 0.09], [0.85, 0.35, 0.25]],
  ["LowerArm.L", 10, [0, -0.26, 0], [0.08, 0.24, 0.08], [0.93, 0.76, 0.62]],
  ["Hand.L", 11, [0, -0.24, 0], [0.07, 0.09, 0.05], [0.93, 0.76, 0.62]],
  ["UpperLeg.R", 0, [0.09, -0.04, 0], [0.12, 0.42, 0.13], [0.20, 0.22, 0.30]],
  ["LowerLeg.R", 13, [0, -0.42, 0], [0.10, 0.40, 0.11], [0.20, 0.22, 0.30]],
  ["Foot.R", 14, [0, -0.42, 0], [0.10, 0.07, 0.20], [0.95, 0.95, 0.95]],
  ["UpperLeg.L", 0, [-0.09, -0.04, 0], [0.12, 0.42, 0.13], [0.20, 0.22, 0.30]],
  ["LowerLeg.L", 16, [0, -0.42, 0], [0.10, 0.40, 0.11], [0.20, 0.22, 0.30]],
  ["Foot.L", 17, [0, -0.42, 0], [0.10, 0.07, 0.20], [0.95, 0.95, 0.95]]
];
if (B.length !== 19) throw new Error("19 bones");
const world = [];
B.forEach(function (b, i) { const p = b[1] >= 0 ? world[b[1]] : [0, 0, 0]; world[i] = [p[0] + b[2][0], p[1] + b[2][1], p[2] + b[2][2]]; });
// Each box hangs from its bone's head toward its first child (or down / up for leaves).
function boxCentre(i) {
  const kids = B.map(function (b, j) { return b[1] === i ? j : -1; }).filter(function (j) { return j >= 0; });
  const w = world[i];
  if (B[i][0] === "Head") return [w[0], w[1] + 0.11, w[2]];
  if (/^Foot/.test(B[i][0])) return [w[0], w[1] - 0.035 + 0.035, w[2] - 0.05];
  if (/^Hand/.test(B[i][0])) return [w[0], w[1] - 0.045, w[2]];
  if (kids.length && !/^(Hips|Chest)$/.test(B[i][0])) { const c = world[kids[0]]; return [(w[0] + c[0]) / 2, (w[1] + c[1]) / 2, (w[2] + c[2]) / 2]; }
  return [w[0], w[1] + B[i][3][1] / 2 * (B[i][0] === "Hips" ? 0 : 1), w[2]];
}

const pos = [], nor = [], col = [], jnt = [], wgt = [];
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
B.forEach(function (b, i) {
  const c = boxCentre(i), s = b[3].map(function (v) { return v / 2; });
  FACES.forEach(function (n) {
    // Two axes across the face.
    const a = n[0] ? [0, 1, 0] : [1, 0, 0], d = n[2] ? [0, 1, 0] : (n[0] ? [0, 0, 1] : [0, 0, 1]);
    const corner = function (sa, sd) {
      return [0, 1, 2].map(function (k) { return c[k] + (n[k] + a[k] * sa + d[k] * sd) * s[k]; });
    };
    const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    // Wind counter-clockwise seen from outside.
    const e1 = q[1].map(function (v, k) { return v - q[0][k]; }), e2 = q[2].map(function (v, k) { return v - q[0][k]; });
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const tri = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    tri.forEach(function (t) { pos.push.apply(pos, q[t]); nor.push.apply(nor, n); col.push(b[4][0], b[4][1], b[4][2], 1); jnt.push(i, 0, 0, 0); wgt.push(1, 0, 0, 0); });
  });
});
const nv = pos.length / 3;

// Clips: rotations about each bone's x (swing forward/back) or z (out to the side).
function qx(a) { return [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]; }
function qz(a) { return [0, 0, Math.sin(a / 2), Math.cos(a / 2)]; }
function clip(name, dur, frames, tracks) {
  const times = [];
  for (let f = 0; f <= frames; f++) times.push(dur * f / frames);
  return { name: name, times: times, tracks: tracks.map(function (t) { return { bone: t[0], q: times.map(function (tt) { return t[1](tt / dur); }) }; }) };
}
const TAU = Math.PI * 2;
const swing = function (amp, ph) { return function (u) { return qx(Math.sin(u * TAU + ph) * amp); }; };
const knee = function (amp, ph) { return function (u) { return qx(-Math.max(0, Math.sin(u * TAU + ph)) * amp); }; };
const CLIPS = [
  clip("idle", 2, 20, [[2, function (u) { return qx(Math.sin(u * TAU) * 0.03); }], [6, function () { return qz(0.08); }], [10, function () { return qz(-0.08); }]]),
  clip("walk", 1, 20, [[13, swing(0.45, 0)], [16, swing(0.45, Math.PI)], [14, knee(0.6, -0.8)], [17, knee(0.6, Math.PI - 0.8)], [6, swing(0.35, Math.PI)], [10, swing(0.35, 0)]]),
  clip("run", 0.7, 20, [[13, swing(0.85, 0)], [16, swing(0.85, Math.PI)], [14, knee(1.2, -0.8)], [17, knee(1.2, Math.PI - 0.8)], [6, swing(0.7, Math.PI)], [10, swing(0.7, 0)], [7, function () { return qx(1.2); }], [11, function () { return qx(1.2); }]]),
  clip("jump", 1, 10, [[13, function (u) { return qx(Math.sin(u * Math.PI) * 0.8); }], [14, function (u) { return qx(-Math.sin(u * Math.PI) * 1.1); }], [16, function (u) { return qx(Math.sin(u * Math.PI) * 0.5); }], [17, function (u) { return qx(-Math.sin(u * Math.PI) * 0.8); }]]),
  clip("wave", 1.5, 15, [[6, function () { return qz(2.6); }], [7, function (u) { return qz(Math.sin(u * TAU * 2) * 0.4); }]])
];

// ---- glb
const chunks = [];
let byteLen = 0;
const bufferViews = [], accessors = [];
function addView(typed, target) {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (byteLen % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); byteLen += pad; }
  bufferViews.push(Object.assign({ buffer: 0, byteOffset: byteLen, byteLength: buf.length }, target ? { target: target } : {}));
  chunks.push(buf); byteLen += buf.length;
  return bufferViews.length - 1;
}
function addAcc(typed, type, ctype, count, extra, target) {
  accessors.push(Object.assign({ bufferView: addView(typed, target), componentType: ctype, count: count, type: type }, extra || {}));
  return accessors.length - 1;
}
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i * 3 + k]); mx[k] = Math.max(mx[k], pos[i * 3 + k]); }
const aPos = addAcc(new Float32Array(pos), "VEC3", 5126, nv, { min: mn, max: mx }, 34962);
const aNor = addAcc(new Float32Array(nor), "VEC3", 5126, nv, null, 34962);
const aCol = addAcc(new Float32Array(col), "VEC4", 5126, nv, null, 34962);
const aJnt = addAcc(new Uint8Array(jnt), "VEC4", 5121, nv, null, 34962);
const aWgt = addAcc(new Float32Array(wgt), "VEC4", 5126, nv, null, 34962);
const ibm = [];
world.forEach(function (w) { ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1); });
const aIbm = addAcc(new Float32Array(ibm), "MAT4", 5126, B.length);

const nodes = B.map(function (b, i) {
  const kids = B.map(function (c, j) { return c[1] === i ? j : -1; }).filter(function (j) { return j >= 0; });
  return Object.assign({ name: b[0], translation: b[2] }, kids.length ? { children: kids } : {});
});
const meshNode = nodes.length;
nodes.push({ name: "Avatar", mesh: 0, skin: 0 });
const animations = CLIPS.map(function (c) {
  const tIn = addAcc(new Float32Array(c.times), "SCALAR", 5126, c.times.length, { min: [0], max: [c.times[c.times.length - 1]] });
  const samplers = [], channels = [];
  c.tracks.forEach(function (t) {
    const flat = [];
    t.q.forEach(function (q) { flat.push.apply(flat, q); });
    samplers.push({ input: tIn, output: addAcc(new Float32Array(flat), "VEC4", 5126, t.q.length), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: t.bone, path: "rotation" } });
  });
  return { name: c.name, samplers: samplers, channels: channels };
});
const gltf = {
  asset: { version: "2.0", generator: "bladed tools/make-test-avatar.js" },
  scene: 0, scenes: [{ nodes: [0, meshNode] }], nodes: nodes,
  meshes: [{ name: "Avatar", primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor, COLOR_0: aCol, JOINTS_0: aJnt, WEIGHTS_0: aWgt }, material: 0 }] }],
  materials: [{ name: "Body", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
  skins: [{ joints: B.map(function (b, i) { return i; }), inverseBindMatrices: aIbm, skeleton: 0 }],
  animations: animations,
  buffers: [{ byteLength: 0 }], bufferViews: bufferViews, accessors: accessors
};
let bin = Buffer.concat(chunks);
if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - bin.length % 4)]);
gltf.buffers[0].byteLength = bin.length;
let json = Buffer.from(JSON.stringify(gltf), "utf8");
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - json.length % 4, 0x20)]);
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
const out = path.join(__dirname, "test-avatar.glb");
fs.writeFileSync(out, Buffer.concat([header, jh, json, bh, bin]));
console.log("wrote " + out + " (" + nv + " vertices, " + B.length + " bones, clips " + CLIPS.map(function (c) { return c.name; }).join(", ") + ", height " + mx[1].toFixed(2) + " m)");
