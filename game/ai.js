const { CY, LEFT_CX, RIGHT_CX, R_INNER, R_OUTER } = require('./constants');
const { normalizeAngle } = require('./physics');

function getIdealTheta(x, y) {
  if (x >= LEFT_CX && x <= RIGHT_CX) {
    if (y > CY) return 0;
    else return Math.PI;
  }
  if (x > RIGHT_CX) {
    const phi = Math.atan2(y - CY, x - RIGHT_CX);
    return phi - Math.PI / 2;
  }
  const phi = Math.atan2(y - CY, x - LEFT_CX);
  return phi - Math.PI / 2;
}

function updateCPU(p, tickCount) {
  const level = p.cpuLevel;

  const noiseMagnitude = [0, 0.12, 0.07, 0.04, 0.02, 0.005][level];
  const threshold = [0, 0.15, 0.10, 0.06, 0.03, 0.012][level];
  const skipChance = [0, 0.15, 0.08, 0.03, 0.01, 0][level];

  // Pulsacyjne/przerywane skręcanie - CPU skręca w burstach
  p.cpuPulsePhase += p.cpuPulseSpeed;

  // Burst timer - CPU periodycznie wchodzi w tryb burst (szybkie on/off)
  p.cpuBurstTimer--;
  if (p.cpuBurstTimer <= 0) {
    p.cpuBurstActive = !p.cpuBurstActive;
    if (p.cpuBurstActive) {
      // Burst trwa 8-25 klatek zależnie od poziomu
      p.cpuBurstTimer = Math.floor(8 + Math.random() * (level * 4));
    } else {
      // Przerwa między burstami 5-20 klatek
      p.cpuBurstTimer = Math.floor(5 + Math.random() * (20 - level * 3));
    }
  }

  // Pulsacyjny efekt - sinusoidalne wahanie decyzji
  const pulseValue = Math.sin(p.cpuPulsePhase);
  const pulseThresholdMod = pulseValue * 0.03 * (6 - level); // niższy level = więcej pulsacji

  if (Math.random() < skipChance) return false;

  const idealTheta = getIdealTheta(p.x, p.y);
  const noise = p.cpuNoiseOffset * noiseMagnitude * 2;
  const targetTheta = idealTheta + noise;

  p.cpuNoiseOffset += (Math.random() - 0.5) * 0.1;
  p.cpuNoiseOffset = Math.max(-1, Math.min(1, p.cpuNoiseOffset));

  const diff = normalizeAngle(targetTheta - p.theta);
  const effectiveThreshold = threshold + pulseThresholdMod;

  if (diff < -effectiveThreshold) {
    // W trybie burst - przerywane skręcanie (on/off co kilka klatek)
    if (level <= 3) {
      // Przerywany skręt: co kilka klatek puszcza i wciska
      const burstCycle = Math.floor(3 + (5 - level)); // niższy level = dłuższy cykl
      const inBurstPhase = (tickCount % burstCycle) < Math.ceil(burstCycle * 0.6);
      if (!inBurstPhase && Math.random() < 0.4) return false; // czasami puszcza w trakcie skrętu
    }
    return true;
  }

  if (level <= 2 && Math.random() < 0.02) return true;

  return false;
}

module.exports = { getIdealTheta, updateCPU };
