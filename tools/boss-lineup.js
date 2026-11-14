// For tools/shot.js --evalfile: freeze the round and stand all three bosses and
// their pests in front of the camera, facing it, for a look at the models.
(function () {
  const G = DR.Game, V = DR.View, cam = V.camera;
  G.paused = true;
  const yaw = cam.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  const now = performance.now() / 1000;
  ["santa", "ceo", "pharaoh"].forEach(function (who, i) {
    const name = { santa: "EVIL SANTA", ceo: "BIG TECH CEO", pharaoh: "MUMMY PHARAOH" }[who];
    const o = (i - 1) * 9.5;
    const tg = { id: i, x: cam.position.x + fx * 15 + rx * o, y: cam.position.y + 1.5, z: cam.position.z + fz * 15 + rz * o, yaw: yaw, bank: 0, spin: 0, flash: 0, fireT: 1 };
    const m = DR.Drone.makeTarget({ boss: true, who: who, name: name });
    DR.Drone.updateTarget(m, tg, 0, now);
    V.scene.add(m.root);
    for (let k = 0; k < 2; k++) {
      const mm = DR.Drone.makeTarget({ mini: true, who: who });
      DR.Drone.updateTarget(mm, { id: 9, x: tg.x + rx * (k ? 2.6 : -2.6) - fx * 5, y: tg.y - 3.2, z: tg.z + rz * (k ? 2.6 : -2.6) - fz * 5, yaw: yaw, bank: 0.2, spin: 0, flash: 0, fireT: 1 }, 0, now);
      V.scene.add(mm.root);
    }
  });
  return "ok";
})();
