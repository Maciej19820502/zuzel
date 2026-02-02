const { V, V_TURN, OMEGA, TRAIL_LEN, COLORS, TOTAL_LAPS, TOTAL_HEATS, TICK_MS, CX, CY } = require('./constants');
const { isOnTrack, createPlayer, checkLaps } = require('./physics');
const { updateCPU } = require('./ai');

class Match {
  constructor(humanSlots, onEnd) {
    // humanSlots: array of { ws, name, slot } for humans (up to 4)
    // remaining slots filled with CPU
    this.onEnd = onEnd;
    this.totalLaps = TOTAL_LAPS;
    this.totalHeats = TOTAL_HEATS;
    this.currentHeat = 0;
    this.totalPoints = [0, 0, 0, 0];
    this.players = [];
    this.finishOrder = [];
    this.state = 'WAITING'; // WAITING, COUNTDOWN, RACING, HEAT_RESULTS, ENDED
    this.tickInterval = null;
    this.shakeTimer = 0;
    this.tickCount = 0;
    this.aborted = false;

    // Slots: index 0-3
    this.slots = [null, null, null, null];
    this.keysDown = [false, false, false, false];

    // Fill human slots
    for (const h of humanSlots) {
      this.slots[h.slot] = { ws: h.ws, name: h.name, isCPU: false };
    }

    // Fill remaining with CPU
    const cpuNames = ['CPU-Alfa', 'CPU-Beta', 'CPU-Gamma', 'CPU-Delta'];
    let cpuIdx = 0;
    for (let i = 0; i < 4; i++) {
      if (!this.slots[i]) {
        const level = 2 + Math.floor(Math.random() * 3); // 2-4
        this.slots[i] = { ws: null, name: cpuNames[cpuIdx], isCPU: true, cpuLevel: level };
        cpuIdx++;
      }
    }

    this.startHeat();
  }

  broadcast(type, data) {
    const msg = JSON.stringify({ type, ...data });
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i];
      if (s && s.ws && s.ws.readyState === 1) {
        try { s.ws.send(msg); } catch (e) {}
      }
    }
  }

  sendTo(slot, type, data) {
    const s = this.slots[slot];
    if (s && s.ws && s.ws.readyState === 1) {
      try { s.ws.send(JSON.stringify({ type, ...data })); } catch (e) {}
    }
  }

  startHeat() {
    if (this.aborted) return;
    this.currentHeat++;
    this.finishOrder = [];
    this.eliminationOrder = [];
    this.shakeTimer = 0;
    this.tickCount = 0;
    this.keysDown = [false, false, false, false];

    this.players = [];
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i];
      this.players.push(createPlayer(i, s.name, COLORS[i], s.isCPU, s.cpuLevel || 3));
    }

    this.state = 'COUNTDOWN';
    let count = 3;

    this.broadcast('countdown', { value: count });

    const cdInterval = setInterval(() => {
      if (this.aborted) { clearInterval(cdInterval); return; }
      count--;
      if (count > 0) {
        this.broadcast('countdown', { value: count });
      } else if (count === 0) {
        this.broadcast('countdown', { value: 0 });
      } else {
        clearInterval(cdInterval);
        this.state = 'RACING';
        this.tickInterval = setInterval(() => this.tick(), TICK_MS);
      }
    }, 800);
  }

  tick() {
    if (this.state !== 'RACING' || this.aborted) {
      if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
      return;
    }

    this.tickCount++;

    if (this.shakeTimer > 0) this.shakeTimer--;

    for (const p of this.players) {
      if (!p.alive || p.finished) continue;

      // CPU auto-eliminate if last active
      if (p.isCPU) {
        const othersActive = this.players.some(o => o !== p && o.alive && !o.finished);
        if (!othersActive) {
          this.eliminatePlayer(p);
          continue;
        }
      }

      let turning = false;
      if (p.isCPU) {
        turning = updateCPU(p, this.tickCount);
      } else {
        turning = this.keysDown[p.index];
      }

      if (turning) {
        p.theta -= OMEGA;
      }

      const speed = turning ? V_TURN : V;
      p.x += speed * Math.cos(p.theta);
      p.y += speed * Math.sin(p.theta);

      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > TRAIL_LEN) p.trail.pop();

      if (!isOnTrack(p.x, p.y)) {
        this.eliminatePlayer(p);
        continue;
      }


      const lapResult = checkLaps(p, this.totalLaps);
      // lapResult used for sound triggers on client side via state
    }

    this.broadcastState();

    const activeCount = this.players.filter(p => p.alive && !p.finished).length;
    if (activeCount === 0) {
      this.endHeat();
    }
  }

  eliminatePlayer(p) {
    p.alive = false;
    this.eliminationOrder.push(p);
    this.shakeTimer = 10;
  }

  broadcastState() {
    const playersData = this.players.map(p => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      theta: Math.round(p.theta * 1000) / 1000,
      trail: p.trail.map(t => ({ x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10 })),
      alive: p.alive,
      finished: p.finished,
      laps: p.laps,
      name: p.name,
      isCPU: p.isCPU,
      color: p.color,
    }));

    this.broadcast('state', {
      players: playersData,
      heat: this.currentHeat,
      totalLaps: this.totalLaps,
      totalHeats: this.totalHeats,
      shakeTimer: this.shakeTimer,
    });
  }

  endHeat() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.state = 'HEAT_RESULTS';

    // Build finish order:
    // 1. Finishers (first to finish = best)
    // 2. Still alive but didn't finish (by laps desc)
    // 3. Eliminated in reverse order (last to crash = best among crashers)
    const stillGoing = this.players.filter(p => p.alive && !p.finished)
      .sort((a, b) => b.laps - a.laps);
    const eliminatedReversed = [...this.eliminationOrder].reverse();
    const finalOrder = [...this.finishOrder, ...stillGoing, ...eliminatedReversed];

    const pointsTable = [3, 2, 1, 0];
    finalOrder.forEach((p, i) => {
      const pts = pointsTable[i] || 0;
      p.heatPoints = pts;
      this.totalPoints[p.index] += pts;
    });

    const isLast = this.currentHeat >= this.totalHeats;

    this.broadcast('heat_end', {
      order: finalOrder.map(p => ({
        name: p.name,
        color: p.color,
        heatPoints: p.heatPoints,
        finished: p.finished,
        alive: p.alive,
        laps: p.laps,
        index: p.index,
      })),
      totalPoints: [...this.totalPoints],
      heat: this.currentHeat,
      totalHeats: this.totalHeats,
      totalLaps: this.totalLaps,
      isLast,
      slots: this.slots.map(s => ({ name: s.name, isCPU: s.isCPU })),
    });

    if (isLast) {
      setTimeout(() => this.endMatch(), 100);
    } else {
      // Start next heat after 4 seconds
      setTimeout(() => {
        if (!this.aborted) this.startHeat();
      }, 4000);
    }
  }

  endMatch() {
    this.state = 'ENDED';

    const standings = this.slots.map((s, i) => ({
      name: s.name,
      color: COLORS[i],
      points: this.totalPoints[i],
      isCPU: s.isCPU,
    })).sort((a, b) => b.points - a.points);

    this.broadcast('match_end', { finalStandings: standings });

    if (this.onEnd) this.onEnd(this);
  }

  abort() {
    this.aborted = true;
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.state = 'ENDED';
    this.broadcast('match_end', {
      finalStandings: this.slots.map((s, i) => ({
        name: s.name,
        color: COLORS[i],
        points: this.totalPoints[i],
        isCPU: s.isCPU,
      })).sort((a, b) => b.points - a.points),
      aborted: true,
    });
    if (this.onEnd) this.onEnd(this);
  }

  handleKey(slot, down) {
    if (slot >= 0 && slot < 4) {
      this.keysDown[slot] = down;
    }
  }

  handleDisconnect(ws) {
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i];
      if (s && s.ws === ws) {
        // Convert to CPU level 3
        s.ws = null;
        s.isCPU = true;
        s.cpuLevel = 3;
        if (this.players[i]) {
          this.players[i].isCPU = true;
          this.players[i].cpuLevel = 3;
        }
        this.keysDown[i] = false;
        break;
      }
    }
  }

  handleAbortVote(ws) {
    // Any human player can abort the match
    for (let i = 0; i < 4; i++) {
      if (this.slots[i] && this.slots[i].ws === ws) {
        this.abort();
        return;
      }
    }
  }
}

module.exports = Match;
