/**
 * @name Frost
 * @author Thawney
 * @hue 175
 * @sat 160
 * @param_label Branching
 * @description A crystal grows from a seed. Low density = spiky horizontal needles. High density = branching in all directions. Tilt steers growth. Notes fire on each new cell. Fills then shatters and restarts.
 * @sound Pluck / Glass
 */

var crystal      = [];   // crystal[row][col] = brightness (0 = empty)
var crystalCount = 0;
var growElapsed  = 0;
var shattering   = false;

var MAX_FILL;  // set in activate

function activate(m) {
  MAX_FILL = Math.floor(m.COLS * m.ROWS * 8 / 10);
  crystal  = [];
  for (var r = 0; r < m.ROWS; r++) {
    crystal[r] = [];
    for (var c = 0; c < m.COLS; c++) crystal[r][c] = 0;
  }
  // Seed at centre
  crystal[Math.floor(m.ROWS / 2)][Math.floor(m.COLS / 2)] = m.brightness;
  crystalCount = 1;
  growElapsed  = 0;
  shattering   = false;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function tryGrow(m) {
  // Pick a random occupied cell and try to grow into an empty neighbour
  var attempts = 40;
  while (attempts-- > 0) {
    var r = m.rnd(m.ROWS);
    var c = m.rnd(m.COLS);
    if (crystal[r][c] === 0) continue;

    // Density controls branching: 0=pure horizontal needles, 255=all directions
    var horizBias = 10 - Math.floor((m.density / 255.0) * 7);  // 3..10
    var roll = m.rnd(10);
    var dx, dy;
    if (roll < horizBias) {
      dx = (m.rnd(2) === 0) ? 1 : -1;
      dy = 0;
    } else if (roll < horizBias + 2) {
      dx = (m.rnd(2) === 0) ? 1 : -1;
      dy = (m.rnd(2) === 0) ? 1 : -1;
    } else {
      dx = 0;
      dy = (m.rnd(2) === 0) ? 1 : -1;
    }

    // Tilt biases horizontal direction: right tilt → favour dx=+1
    if (dx !== 0 && m.accelY > 25 && dx < 0 && m.rnd(255) < 140) continue;
    if (dx !== 0 && m.accelY < -25 && dx > 0 && m.rnd(255) < 140) continue;

    var nr = r + dy;
    var nc = c + dx;
    if (nr < 0 || nr >= m.ROWS || nc < 0 || nc >= m.COLS) continue;
    if (crystal[nr][nc] !== 0) continue;

    // Slightly randomise brightness for an icy, uneven texture
    var br = Math.floor(m.brightness * (140 + m.rnd(116)) / 255);
    crystal[nr][nc] = br;
    crystalCount++;

    var deg = m.colToDegree(nc);
    m.note(deg, 30 + m.rnd(55), Math.floor(m.beatMs * 0.5));
    return;
  }
}

function update(m) {
  if (shattering) {
    // Fast fade-out then re-seed
    var fadeAmt = Math.floor((8 * m.dt + 8) / 16);
    if (fadeAmt < 1) fadeAmt = 1;
    var anyLeft = false;
    for (var r = 0; r < m.ROWS; r++) {
      for (var c = 0; c < m.COLS; c++) {
        if (crystal[r][c] > fadeAmt) { crystal[r][c] -= fadeAmt; anyLeft = true; }
        else crystal[r][c] = 0;
      }
    }
    if (!anyLeft) { activate(m); return; }
    for (var r = 0; r < m.ROWS; r++)
      for (var c = 0; c < m.COLS; c++)
        m.px(c, r, crystal[r][c]);
    m.show();
    return;
  }

  // Growth speed: fixed, one cell every ~80ms (tied to tempo feel)
  var growInterval = Math.max(40, Math.floor(m.beatMs / 8));

  growElapsed += m.dt;
  while (growElapsed >= growInterval && crystalCount < m.COLS * m.ROWS) {
    growElapsed -= growInterval;
    tryGrow(m);
  }

  if (crystalCount >= MAX_FILL) shattering = true;

  for (var r = 0; r < m.ROWS; r++)
    for (var c = 0; c < m.COLS; c++)
      m.px(c, r, crystal[r][c]);
  m.show();
}
