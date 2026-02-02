const { R_INNER, R_OUTER, CX, CY, LEFT_CX, RIGHT_CX } = require('./constants');

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function isOnTrack(x, y) {
  if (x >= LEFT_CX && x <= RIGHT_CX) {
    return (y >= CY - R_OUTER && y <= CY - R_INNER) ||
           (y >= CY + R_INNER && y <= CY + R_OUTER);
  }
  if (x < LEFT_CX) {
    const dx = x - LEFT_CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist >= R_INNER && dist <= R_OUTER;
  }
  if (x > RIGHT_CX) {
    const dx = x - RIGHT_CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist >= R_INNER && dist <= R_OUTER;
  }
  return false;
}

function pointToSegmentDistSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx2 = ax + t * abx, cy2 = ay + t * aby;
  const dx = px - cx2, dy = py - cy2;
  return dx * dx + dy * dy;
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 0.001) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function checkTrailCollision(player, allPlayers) {
  if (player.trail.length < 2) return false;
  const hx = player.trail[0].x, hy = player.trail[0].y;
  const px = player.trail[1].x, py = player.trail[1].y;

  for (const other of allPlayers) {
    if (other === player) continue;
    const oTrail = other.trail;
    if (oTrail.length < 2) continue;

    for (let i = 0; i < oTrail.length - 1; i++) {
      const ax = oTrail[i].x, ay = oTrail[i].y;
      const bx = oTrail[i + 1].x, by = oTrail[i + 1].y;
      if (pointToSegmentDistSq(hx, hy, ax, ay, bx, by) < 16) return true;
      if (segmentsIntersect(hx, hy, px, py, ax, ay, bx, by)) return true;
    }

    if (other.alive && !other.finished && oTrail.length > 0) {
      const dx2 = hx - other.x, dy2 = hy - other.y;
      if (dx2 * dx2 + dy2 * dy2 < 25) return true;
    }
  }
  return false;
}

function createPlayer(index, name, color, isCPU, cpuLevel) {
  const startX = CX - 40 + index * 25;
  const laneY = CY + R_INNER + 15 + index * ((R_OUTER - R_INNER - 10) / 4);
  return {
    index,
    name,
    color,
    isCPU,
    cpuLevel: cpuLevel || 3,
    x: startX,
    y: laneY,
    theta: 0,
    trail: [],
    alive: true,
    laps: 0,
    crossedMidpoint: false,
    finished: false,
    heatPoints: 0,
    cpuTurnFrames: 0,
    cpuNoiseOffset: (Math.random() - 0.5) * 0.3,
    cpuPulsePhase: Math.random() * Math.PI * 2,
    cpuPulseSpeed: 0.05 + Math.random() * 0.1,
    cpuBurstTimer: 0,
    cpuBurstActive: false,
  };
}

function checkLaps(p, totalLaps) {
  if (p.y < CY && p.x >= CX - 10 && p.x <= CX + 10) {
    p.crossedMidpoint = true;
  }
  if (p.crossedMidpoint && p.y > CY && p.x >= CX - 10 && p.x <= CX + 10) {
    p.laps++;
    p.crossedMidpoint = false;
    if (p.laps >= totalLaps && !p.finished) {
      p.finished = true;
      return 'finished';
    }
    return 'lap';
  }
  return null;
}

module.exports = {
  normalizeAngle,
  isOnTrack,
  checkTrailCollision,
  createPlayer,
  checkLaps,
};
