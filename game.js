// Hop Tag: a tiny example game for the HopLobby SDK. Everyone runs around; whoever is "it" tags someone to pass it on.
//
// What it shows:
//   - HopLobby.init() for the lobby's players, HopLobby.progress() / ready() for the loading screen
//   - HopLobby.avatar() for each player's portrait
//   - HopLobby.send() / on('message') to share positions through the relay, on('players') for joins and leaves
//   - The host keeps the shared state ("who is it") and the others follow; a new host takes over if the host leaves
//
// Nothing here is trusted: in a real game, anything that matters (scores, rewards) belongs on your own server, with
// HopLobby.playerToken() to know who is who (see server-example/).

(async function () {
  const canvas = document.getElementById('stage');
  const g = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const status = document.getElementById('status');
  const SPEED = 260, RADIUS = 22, ARENA = { w: 1200, h: 700 };

  HopLobby.progress(0.1, 'Joining the lobby');
  const ctx = await HopLobby.init();
  const me = ctx.playerId;

  // Every player's dot, keyed by player id. Our own moves locally; others follow their last message.
  const dots = new Map();
  const colours = ['#c4f35b', '#62cbff', '#ffcd57', '#bb8dff', '#ff8a80', '#58d68d'];
  let it = ctx.hostId;
  let paused = false;

  function addPlayer(player, index) {
    if (dots.has(player.id)) { dots.get(player.id).name = player.name; return; }
    const angle = (index / Math.max(1, ctx.players.length)) * Math.PI * 2;
    dots.set(player.id, { x: ARENA.w / 2 + Math.cos(angle) * 200, y: ARENA.h / 2 + Math.sin(angle) * 200, name: player.name, colour: colours[index % colours.length], avatar: null });
    // Avatars are pictures of each player's HopLobby character. Load them in the background.
    HopLobby.avatar(player.id, { size: 96 }).then(url => {
      const image = new Image();
      image.onload = () => { const dot = dots.get(player.id); if (dot) dot.avatar = image; renderHud(); };
      image.src = url;
    }).catch(() => {});
  }
  ctx.players.forEach(addPlayer);
  HopLobby.progress(0.6, 'Drawing the arena');

  HopLobby.on('players', (players, hostId) => {
    players.forEach(addPlayer);
    for (const id of [...dots.keys()]) if (!players.some(p => p.id === id)) dots.delete(id);
    // The person who was "it" left: the (possibly new) host hands it to themselves and tells everyone.
    if (!dots.has(it) && HopLobby.isHost) { it = me; HopLobby.send({ type: 'it', id: it }); }
    renderHud();
  });

  HopLobby.on('message', (data, from) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'pos' && dots.has(from)) { const dot = dots.get(from); dot.x = data.x; dot.y = data.y; }
    // Only the host decides who is "it" (a real game would check tags on its own server).
    if (data.type === 'it' && from === ctx.hostId && dots.has(data.id)) { it = data.id; renderHud(); }
    if (data.type === 'tagged' && HopLobby.isHost && from === it && dots.has(data.id)) { it = data.id; HopLobby.send({ type: 'it', id: it }); renderHud(); }
    // Someone new asks who is "it".
    if (data.type === 'hello' && HopLobby.isHost) HopLobby.send({ type: 'it', id: it }, from);
  });
  HopLobby.on('relay', state => {
    status.textContent = state === 'open' ? '' : state === 'connecting' ? 'Connecting…' : 'Reconnecting…';
    // Messages sent while the relay is down are dropped, so say hello (and get the state) each time it opens.
    if (state === 'open') HopLobby.send({ type: 'hello' });
  });
  HopLobby.on('pause', () => { paused = true; });
  HopLobby.on('resume', () => { paused = false; });
  if (ctx.standalone) status.textContent = 'Standalone mode: open this from a HopLobby lobby (Dev Mode) to play with others.';

  // Input
  const keys = new Set();
  addEventListener('keydown', e => keys.add(e.code));
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function renderHud() {
    hud.textContent = '';
    for (const [id, dot] of dots) {
      const row = document.createElement('div');
      row.className = 'row';
      const img = document.createElement('img');
      if (dot.avatar) img.src = dot.avatar.src;
      const name = document.createElement('span');
      name.textContent = dot.name + (id === me ? ' (you)' : '');
      if (id === it) name.className = 'it';
      row.append(img, name);
      hud.append(row);
    }
  }
  renderHud();

  let last = performance.now(), sendTimer = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const mine = dots.get(me);
    if (mine && !paused) {
      const dx = (keys.has('ArrowRight') || keys.has('KeyD')) - (keys.has('ArrowLeft') || keys.has('KeyA'));
      const dy = (keys.has('ArrowDown') || keys.has('KeyS')) - (keys.has('ArrowUp') || keys.has('KeyW'));
      const len = Math.hypot(dx, dy) || 1;
      const speed = SPEED * (me === it ? 1.08 : 1);
      mine.x = Math.max(RADIUS, Math.min(ARENA.w - RADIUS, mine.x + (dx / len) * speed * dt));
      mine.y = Math.max(RADIUS, Math.min(ARENA.h - RADIUS, mine.y + (dy / len) * speed * dt));
      // 15 updates a second is plenty here (the relay allows 60).
      sendTimer += dt;
      if (sendTimer > 1 / 15) { sendTimer = 0; HopLobby.send({ type: 'pos', x: Math.round(mine.x), y: Math.round(mine.y) }); }
      // "It" tags whoever they touch.
      if (me === it) for (const [id, dot] of dots) {
        if (id !== me && Math.hypot(dot.x - mine.x, dot.y - mine.y) < RADIUS * 2) {
          if (HopLobby.isHost) { it = id; HopLobby.send({ type: 'it', id }); } else HopLobby.send({ type: 'tagged', id }, ctx.hostId);
          renderHud();
          break;
        }
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const scale = Math.min(innerWidth / ARENA.w, innerHeight / ARENA.h);
    canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio;
    g.setTransform(scale * devicePixelRatio, 0, 0, scale * devicePixelRatio, (innerWidth - ARENA.w * scale) / 2 * devicePixelRatio, (innerHeight - ARENA.h * scale) / 2 * devicePixelRatio);
    g.fillStyle = '#1b2030'; g.fillRect(0, 0, ARENA.w, ARENA.h);
    g.strokeStyle = '#2b3245'; g.lineWidth = 4; g.strokeRect(2, 2, ARENA.w - 4, ARENA.h - 4);
    for (const [id, dot] of dots) {
      g.save();
      g.beginPath(); g.arc(dot.x, dot.y, RADIUS, 0, Math.PI * 2); g.closePath();
      g.fillStyle = dot.colour; g.fill();
      if (dot.avatar) { g.clip(); g.drawImage(dot.avatar, dot.x - RADIUS, dot.y - RADIUS, RADIUS * 2, RADIUS * 2); }
      g.restore();
      if (id === it) { g.strokeStyle = '#c4f35b'; g.lineWidth = 5; g.beginPath(); g.arc(dot.x, dot.y, RADIUS + 5, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#f6f5ef'; g.font = '600 16px system-ui'; g.textAlign = 'center';
      g.fillText(dot.name, dot.x, dot.y - RADIUS - 10);
    }
  }

  HopLobby.progress(1, 'Ready');
  HopLobby.ready();
  requestAnimationFrame(frame);
})();
