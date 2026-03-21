/**
 * @name Pendulum
 * @author Thawney
 * @hue 45
 * @sat 220
 * @param_label Friction
 * @description A virtual pendulum swings under the gravity of your tilt. Notes
 *              fire as it crosses columns. Density controls friction (low = long swing).
 *              Shake to kick it.
 * @sound Marimba / Vibraphone
 */

var pendAngle    = 0.0;   // radians, -1.5..+1.5
var pendVel      = 0.0;
var colBright    = [];
var lastCol      = -1;
var lastMotionPd = 0;
var lastDeg      = -1;

function activate(m) {
  // Seed starting angle from tilt so it immediately swings from where you're holding it
  pendAngle    = m.accelX / 127.0 * 1.2;
  pendVel      = 0.0;
  lastCol      = -1;
  lastDeg      = -1;
  lastMotionPd = 0;
  colBright = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var dt = m.dt / 1000.0;

  // Damped oscillator — accelX shifts the equilibrium point (gravity well)
  // gEff > 0: tilt right → pulls pendulum right → faster oscillation
  var gEff = 8.0 + m.accelX * 0.06;
  if (gEff < 2.0) gEff = 2.0;

  pendVel   += -gEff * pendAngle * dt;
  pendAngle += pendVel * dt;

  // Soft bounce at rails
  if (pendAngle > 1.5)  { pendAngle = 1.5;  pendVel = -Math.abs(pendVel) * 0.6; }
  if (pendAngle < -1.5) { pendAngle = -1.5; pendVel =  Math.abs(pendVel) * 0.6; }

  // Friction from density: density=0 → almost no friction; density=255 → heavy damping
  var friction = 1.0 - (0.002 + m.density * 0.010 / 255.0);
  pendVel *= friction;

  // Minimum velocity to keep it alive (avoids dead stop)
  var absVel = pendVel < 0 ? -pendVel : pendVel;
  if (absVel < 0.04 && absVel > 0.0) {
    pendVel = pendVel > 0 ? 0.04 : -0.04;
  }

  // Knock: kick in a direction based on current position
  if (m.motion > 140 && lastMotionPd <= 140) {
    var kick = (m.rnd(255) < 128 ? 1.0 : -1.0) * 0.8;
    pendVel += kick;
  }
  lastMotionPd = m.motion;

  // Map angle to column
  var colF = m.map(pendAngle, -1.5, 1.5, 0, m.COLS - 1);
  var col = Math.floor(colF + 0.5);
  if (col < 0) col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  // Fire note on column change; velocity from swing speed
  if (col !== lastCol) {
    var deg = Math.floor((col * 6) / (m.COLS - 1));
    if (deg !== lastDeg) {
      var velMag = pendVel < 0 ? -pendVel : pendVel;
      var vel = Math.floor(55 + velMag * 80);
      if (vel < 55)  vel = 55;
      if (vel > 120) vel = 120;
      m.note(deg, vel, Math.floor(m.beatMs));
      colBright[col] = Math.floor((m.brightness * vel) / 120);
      lastDeg = deg;
    }
    lastCol = col;
  }

  // Fade column glow
  var fadeAmt = Math.floor((2 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;
  }

  // Pendulum position indicator: brighter dot at current column
  var pendBr = Math.floor(m.brightness * 0.7);

  for (var c = 0; c < m.COLS; c++) {
    var br = colBright[c];
    if (c === col) {
      if (pendBr > br) br = pendBr;
    }
    for (var r = 0; r < m.ROWS; r++) {
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}
