/**
 * @name Game Of Life
 * @author TonyNacho
 * @hue 96
 * @sat 220
 * @param_label Chaos
 * @description Basic Conway Game of Life on a 5x28 toroidal grid. Density controls mutation/chaos.
 * @sound Soft Pluck / Marimba
 */

var life = [];    // life[row][col] = 0 or 1
var next = [];    // scratch buffer
var elapsed = 0;
var MAX_CATCHUP_STEPS = 4;

function clearBoards(m) {
  life = [];
  next = [];
  for (var r = 0; r < m.ROWS; r++) {
    life[r] = [];
    next[r] = [];
    for (var c = 0; c < m.COLS; c++) {
      life[r][c] = 0;
      next[r][c] = 0;
    }
  }
}

function seedBoard(m) {
  // density=0 -> 12%, density=255 -> 38%
  var chance = 12 + Math.floor((m.density * 26) / 255);
  var alive = 0;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var cell = (m.rnd(255) < chance) ? 1 : 0;
      life[r][c] = cell;
      alive += cell;
    }
  }

  // Ensure at least one live cell.
  if (alive === 0) {
    life[m.rnd(m.ROWS)][m.rnd(m.COLS)] = 1;
  }
}

function activate(m) {
  clearBoards(m);
  seedBoard(m);
  elapsed = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function neighbors(m, row, col) {
  var count = 0;

  for (var dr = -1; dr <= 1; dr++) {
    for (var dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;

      var rr = (row + dr + m.ROWS) % m.ROWS;
      var cc = (col + dc + m.COLS) % m.COLS;
      count += life[rr][cc];
    }
  }

  return count;
}

function step(m) {
  var aliveNext = 0;
  // density=0 -> 0%, density=255 -> ~12% mutation chance per dead cell
  var chaos = Math.floor(m.density / 8);

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var n = neighbors(m, r, c);
      var wasAlive = life[r][c] === 1;
      var isAlive = 0;

      // Conway rules
      if (wasAlive) {
        isAlive = (n === 2 || n === 3) ? 1 : 0;
      } else {
        isAlive = (n === 3) ? 1 : 0;
      }

      // Chaos: occasional spontaneous births to keep motion alive.
      if (!isAlive && m.rnd(255) < chaos) {
        isAlive = 1;
      }

      next[r][c] = isAlive;
      aliveNext += isAlive;

      if (isAlive && !wasAlive) {
        var degree = Math.floor((c * 13) / (m.COLS - 1));
        var vel = 52 + Math.floor((r * 60) / (m.ROWS - 1));
        m.note(degree, vel, Math.floor(m.beatMs / 2));
      }
    }
  }

  // If the board died, reseed quickly.
  if (aliveNext === 0) {
    seedBoard(m);
    return;
  }

  for (var rr = 0; rr < m.ROWS; rr++) {
    for (var cc = 0; cc < m.COLS; cc++) {
      life[rr][cc] = next[rr][cc];
    }
  }
}

function draw(m) {
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (life[r][c]) {
        m.px(c, r, m.brightness);
      } else {
        m.px(c, r, 0);
      }
    }
  }
}

function update(m) {
  // 120 BPM -> step every 250ms. Tempo slider scales through beatMs.
  var stepMs = Math.max(80, Math.floor(m.beatMs / 2));

  elapsed += m.dt;
  var steps = 0;
  while (elapsed >= stepMs && steps < MAX_CATCHUP_STEPS) {
    elapsed -= stepMs;
    step(m);
    steps++;
  }
  if (steps === MAX_CATCHUP_STEPS && elapsed >= stepMs) elapsed = stepMs - 1;

  draw(m);
  m.show();
}
