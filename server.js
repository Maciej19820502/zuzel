const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Match = require('./game/match');
const { COLORS } = require('./game/constants');

const PORT = process.env.PORT || 3000;

// --- HTTP server ---
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    res.end(data);
  });
});

// --- WebSocket ---
const wss = new WebSocketServer({ server });

const lobbyPlayers = []; // { ws, name }
const activeMatches = new Set();
const wsToMatch = new Map(); // ws -> { match, slot }

function broadcastLobby() {
  const list = lobbyPlayers.map((p, i) => ({ name: p.name, index: i }));
  for (let i = 0; i < lobbyPlayers.length; i++) {
    const p = lobbyPlayers[i];
    try {
      p.ws.send(JSON.stringify({ type: 'lobby', players: list, you: i }));
    } catch (e) {}
  }
}

let matchCountdown = null; // { timer, startTime }

function startMatch() {
  matchCountdown = null;

  const idle = lobbyPlayers.filter(p => !wsToMatch.has(p.ws));
  if (idle.length < 2) return;

  // Take up to 4
  const batch = idle.slice(0, 4);
  const humanSlots = batch.map((p, i) => ({ ws: p.ws, name: p.name, slot: i }));

  // Notify assigned
  for (const h of humanSlots) {
    h.ws.send(JSON.stringify({ type: 'assigned', slot: h.slot, color: COLORS[h.slot], key: 'turn' }));
  }

  // Remove from lobby
  for (const b of batch) {
    const idx = lobbyPlayers.indexOf(b);
    if (idx >= 0) lobbyPlayers.splice(idx, 1);
  }
  broadcastLobby();

  const match = new Match(humanSlots, (m) => {
    // Match ended - return humans to lobby
    activeMatches.delete(m);
    for (let i = 0; i < 4; i++) {
      const s = m.slots[i];
      if (s && s.ws && s.ws.readyState === 1) {
        wsToMatch.delete(s.ws);
        // Return to lobby
        lobbyPlayers.push({ ws: s.ws, name: s.name });
      }
    }
    broadcastLobby();
  });

  activeMatches.add(match);
  for (const h of humanSlots) {
    wsToMatch.set(h.ws, { match, slot: h.slot });
  }
}

function tryMatch() {
  const idle = lobbyPlayers.filter(p => !wsToMatch.has(p.ws));

  // If 4 players ready, start immediately
  if (idle.length >= 4) {
    if (matchCountdown) {
      clearTimeout(matchCountdown.timer);
    }
    startMatch();
    return;
  }

  // If 2-3 players, start 10s countdown (if not already running)
  if (idle.length >= 2 && !matchCountdown) {
    const remaining = 10;
    // Broadcast countdown to lobby players
    for (const p of idle) {
      try {
        p.ws.send(JSON.stringify({ type: 'lobby_countdown', seconds: remaining }));
      } catch (e) {}
    }
    matchCountdown = {
      timer: setTimeout(() => {
        startMatch();
      }, remaining * 1000),
      startTime: Date.now(),
    };
    return;
  }

  // If countdown is running, broadcast remaining time
  if (matchCountdown && idle.length >= 2) {
    const elapsed = (Date.now() - matchCountdown.startTime) / 1000;
    const remaining = Math.ceil(10 - elapsed);
    for (const p of idle) {
      try {
        p.ws.send(JSON.stringify({ type: 'lobby_countdown', seconds: remaining }));
      } catch (e) {}
    }
  }

  // If players dropped below 2, cancel countdown
  if (idle.length < 2 && matchCountdown) {
    clearTimeout(matchCountdown.timer);
    matchCountdown = null;
    // Notify remaining players countdown cancelled
    for (const p of idle) {
      try {
        p.ws.send(JSON.stringify({ type: 'lobby_countdown', seconds: -1 }));
      } catch (e) {}
    }
  }
}

setInterval(tryMatch, 1000);

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'join') {
      const name = (msg.name || 'Anonim').slice(0, 12);
      // Remove if already in lobby
      const existing = lobbyPlayers.findIndex(p => p.ws === ws);
      if (existing >= 0) lobbyPlayers.splice(existing, 1);
      lobbyPlayers.push({ ws, name });
      broadcastLobby();
      return;
    }

    if (msg.type === 'keydown' || msg.type === 'keyup') {
      const info = wsToMatch.get(ws);
      if (info) {
        info.match.handleKey(info.slot, msg.type === 'keydown');
      }
      return;
    }

    if (msg.type === 'abort') {
      const info = wsToMatch.get(ws);
      if (info) {
        info.match.handleAbortVote(ws);
      }
      return;
    }
  });

  ws.on('close', () => {
    // Remove from lobby
    const idx = lobbyPlayers.findIndex(p => p.ws === ws);
    if (idx >= 0) {
      lobbyPlayers.splice(idx, 1);
      broadcastLobby();
    }

    // Handle match disconnect
    const info = wsToMatch.get(ws);
    if (info) {
      info.match.handleDisconnect(ws);
      wsToMatch.delete(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Zuzel server running on http://localhost:${PORT}`);
});
