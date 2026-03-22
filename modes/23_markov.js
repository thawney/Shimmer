/**
 * @name Markov
 * @author Thawney
 * @hue 210
 * @sat 180
 * @param_label Leap Bias
 * @description A Markov chain wanders through scale degrees, each step biased toward nearby pitches (smooth melody) or occasionally leaping. Three simultaneous chains drift at different speeds, creating shifting, self-generating chord textures. Tilt biases up or down in pitch. Density controls leap tendency: low = smooth steps, high = wild jumps.
 * @sound Pad / Keys
 */

var NUM_CHAINS = 3;
var chains     = [];    // {pos, elapsed, speed, row, bright}

// Leap bias from density: 0=smooth/stepwise, 255=large leaps
// stay%, step%, skip%, leap% are adjusted per density

function weightedStep(m) {
  // Higher density → more weight on larger intervals
  var leapW = Math.floor((m.density / 255.0) * 55);  // 0..55
  var stepW = 45 - Math.floor(leapW / 2);             // shrinks as leaps grow
  var stayW = 15;
  var skipW = 100 - stayW - stepW - leapW;
  if (skipW < 5) skipW = 5;

  var r = m.rnd(stayW + stepW + skipW + leapW);
  var size;
  if      (r < stayW)                   size = 0;
  else if (r < stayW + stepW)            size = 1;
  else if (r < stayW + stepW + skipW)    size = 2;
  else                                   size = 3 + m.rnd(3);  // big leap

  var sign = (m.rnd(2) === 0) ? 1 : -1;
  return sign * size;
}

function activate(m) {
  chains = [];
  var rowStep = Math.max(1, Math.floor(m.ROWS / NUM_CHAINS));
  for (var i = 0; i < NUM_CHAINS; i++) {
    chains.push({
      pos    : 2 + m.rnd(10),       // starting scale degree
      elapsed: m.rnd(255) * 4,      // stagger so they don't all fire at once
      speed  : 0.5 + i * 0.35,      // multiplier on beatMs
      row    : Math.min(i * rowStep, m.ROWS - 1),
      bright : 0
    });
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // Tilt bias: accelY biases transitions up (+) or down (-)
  var tiltBias = Math.floor(m.accelY / 30);   // roughly -4 to +4

  for (var i = 0; i < NUM_CHAINS; i++) {
    var ch = chains[i];
    var interval = Math.floor(m.beatMs * ch.speed);
    if (interval < 60) interval = 60;

    ch.elapsed += m.dt;
    if (ch.elapsed >= interval) {
      ch.elapsed -= interval;

      // Step
      var step = weightedStep(m) + tiltBias;
      ch.pos += step;
      if (ch.pos < 0)  ch.pos = 0;
      if (ch.pos > 13) ch.pos = 13;

      var vel = 55 + m.rnd(45) - i * 8;
      if (vel < 30)  vel = 30;
      if (vel > 110) vel = 110;
      m.note(ch.pos, vel, Math.floor(interval * 0.75));

      ch.bright = Math.floor(m.brightness * (0.9 - i * 0.15));
    }
  }

  // Fade
  var fadeAmt = Math.floor((2 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var i = 0; i < NUM_CHAINS; i++) {
    if (chains[i].bright > fadeAmt) chains[i].bright -= fadeAmt;
    else chains[i].bright = 0;
  }

  // Draw: each chain lights a column on its dedicated row
  m.clear();
  for (var i = 0; i < NUM_CHAINS; i++) {
    var ch = chains[i];
    if (ch.bright <= 0) continue;
    var col = m.degreeToCol(ch.pos);
    if (col < 0)        col = 0;
    if (col >= m.COLS)  col = m.COLS - 1;

    // Full column for the active chain row, dimmer for others
    for (var r = 0; r < m.ROWS; r++) {
      var dimR = (r === ch.row) ? ch.bright : Math.floor(ch.bright * 0.18);
      if (dimR > 0) m.px(col, r, dimR);
    }

    // Ghost trail: dim previous column
    var prevCol = col - 1;
    if (prevCol >= 0) {
      m.px(prevCol, ch.row, Math.floor(ch.bright * 0.25));
    }
  }

  m.show();
}
