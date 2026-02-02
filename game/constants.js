const V = 2.5;
const V_TURN = 2.2;
const OMEGA = 0.025;
const TRAIL_LEN = 45;

const R_INNER = 100;
const R_OUTER = 180;
const STRAIGHT_LEN = 300;
const CX = 400;
const CY = 300;
const LEFT_CX = CX - STRAIGHT_LEN / 2;
const RIGHT_CX = CX + STRAIGHT_LEN / 2;

const COLORS = ['#ff3333', '#3388ff', '#ffdd00', '#ffffff'];
const LEVEL_NAMES = ['', 'Leszcz', 'Kotek', 'Piesek', 'Kocur', 'Jaguar'];

const TOTAL_LAPS = 2;
const TOTAL_HEATS = 5;

const TICK_RATE = 60;
const TICK_MS = Math.round(1000 / TICK_RATE);

module.exports = {
  V, V_TURN, OMEGA, TRAIL_LEN,
  R_INNER, R_OUTER, STRAIGHT_LEN, CX, CY, LEFT_CX, RIGHT_CX,
  COLORS, LEVEL_NAMES,
  TOTAL_LAPS, TOTAL_HEATS,
  TICK_RATE, TICK_MS,
};
