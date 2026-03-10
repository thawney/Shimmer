/**
 * @name Cells
 * @author Thawney
 * @hue 55
 * @sat 220
 * @param_label Mutation Rate
 * @description Rule 30 cellular automaton. New live cells fire notes. History scrolls as rows.
 * @sound Pluck / Clavinet
 */

// row 0 = newest (brightest), row 4 = oldest
var ROW_FRAC = [255, 170, 110, 70, 40];
var SEED_DENS = [100, 80, 60, 40, 25];

var gen = [];   // gen[row][col]
var elapsed = 0;

function rule30(row, i, n) {
  var l = row[(i - 1 + n) % n];
  var c = row[i];
  var r = row[(i + 1) % n];
  return l ^ (c | r);
}

function activate(m) {
  gen = [];
  for (var r = 0; r < m.ROWS; r++) {
    gen[r] = [];
    for (var c = 0; c < m.COLS; c++) gen[r][c] = 0;
  }

  // Seed all 5 rows immediately so CA history shows (decreasing density = older row)
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      gen[r][c] = (m.rnd(255) < SEED_DENS[r]) ? 1 : 0;
    }
  }
  gen[0][Math.floor(m.COLS / 2)] = 1;  // always seed center in newest row

  elapsed = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function nextGeneration(m) {
  // Scroll history: row 4 <- row 3 <- row 2 <- row 1 <- row 0
  for (var r = m.ROWS - 1; r > 0; r--)
    for (var c = 0; c < m.COLS; c++)
      gen[r][c] = gen[r - 1][c];

  // Compute new row from what is now row 1 (previous newest)
  var prev = [];
  for (var c = 0; c < m.COLS; c++) prev[c] = gen[1][c];

  var next = [];
  for (var c = 0; c < m.COLS; c++) next[c] = rule30(prev, c, m.COLS);

  // Apply mutation
  for (var c = 0; c < m.COLS; c++) {
    if (m.rnd(255) < Math.floor(m.density / 16)) next[c] ^= 1;
  }

  // Reseed if all dead
  var anyAlive = false;
  for (var c = 0; c < m.COLS; c++) anyAlive = anyAlive || (next[c] === 1);
  if (!anyAlive) {
    next[m.rnd(m.COLS)] = 1;
    next[m.rnd(m.COLS)] = 1;
  }

  // Store and fire notes for newly born cells
  for (var c = 0; c < m.COLS; c++) {
    gen[0][c] = next[c];
    if (next[c] && !prev[c]) {
      var degree = Math.floor((c * 13) / (m.COLS - 1));
      var vel = 55 + m.rnd(64);
      m.note(degree, vel, Math.floor(m.beatMs * 3 / 4));
    }
  }
}

function update(m) {
  // genMs = beatMs (stepsPerBeat=1; C++ uses speed>>7 for 1 or 2 steps)
  var genMs = m.beatMs;

  elapsed += m.dt;
  while (elapsed >= genMs) {
    elapsed -= genMs;
    nextGeneration(m);
  }

  // Draw: row 0 = newest/brightest, row 4 = oldest/dimmest
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (gen[r][c]) {
        var br = Math.floor((m.brightness * ROW_FRAC[r]) >> 8);
        m.px(c, r, br);
      } else {
        m.px(c, r, 0);
      }
    }
  }

  m.show();
}
