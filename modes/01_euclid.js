/**
 * @name Euclid
 * @author Thawney
 * @hue 32
 * @sat 220
 * @param_label Hit Density
 * @description Euclidean rhythm walks a scale. Density controls how many of 12 steps trigger notes. Tilt left/right biases melodic direction.
 * @sound Marimba / Mallet
 */

var N_STEPS = 0;  // set in activate from m.COLS
var HIT_BRIGHT = 180;
var colBright = [];
var elapsed = 0;
var step = 0;
var degree = 6;
var seeded = false;

function isHit(s, k) {
  if (k === 0) return false;
  if (k >= N_STEPS) return true;
  var prev = (s === 0 ? N_STEPS - 1 : s - 1);
  return Math.floor(s * k / N_STEPS) !== Math.floor(prev * k / N_STEPS);
}

function activate(m) {
  N_STEPS = m.COLS;
  colBright = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  elapsed = 0;
  step = 0;
  degree = 6;
  seeded = false;
  m.clear();
  m.show();
}

function update(m) {
  if (!seeded) {
    degree = Math.floor((m.density * 13) / 255);
    seeded = true;
  }

  var k = 1 + Math.floor((m.density * (N_STEPS - 2)) / 255);
  var stepMs = m.beatMs;
  var jumpRange = 1 + Math.floor((m.density * 3) / 255);

  elapsed += m.dt;
  while (elapsed >= stepMs) {
    elapsed -= stepMs;

    if (isHit(step, k)) {
      // accelX biases direction: tilt right → walks up, tilt left → walks down
      var dirProb = 128 + Math.floor(m.accelY / 2);
      if (dirProb < 20)  dirProb = 20;
      if (dirProb > 235) dirProb = 235;
      var dir = (m.rnd(255) < dirProb) ? 1 : -1;
      var jump = (m.rnd(255) < 30) ? dir * jumpRange : dir;
      degree += jump;
      if (degree < 0) degree = 0;
      if (degree > 13) degree = 13;

      var vel = 70 + m.rnd(64);
      m.note(degree, vel, Math.floor(stepMs * 7 / 8));
      colBright[step] = Math.floor((m.brightness * vel) / 127);
    }

    step = (step + 1) % N_STEPS;
  }

  var fadeAmt = Math.floor((2 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var col = 0; col < m.COLS; col++) {
    if (colBright[col] > fadeAmt) colBright[col] -= fadeAmt;
    else colBright[col] = 0;

    var hit    = isHit(col, k);
    var cursor = (col === step);

    var br = 0;
    if (colBright[col] > 0) br = colBright[col];
    else if (cursor)         br = 30;
    else if (hit)            br = Math.floor(HIT_BRIGHT / 3);

    for (var row = 0; row < m.ROWS; row++) {
      if (br > 0) m.px(col, row, br);
      else        m.px(col, row, 0);
    }
  }

  m.show();
}
