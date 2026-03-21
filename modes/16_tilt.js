/**
 * @name Tilt
 * @author Thawney
 * @hue 16
 * @sat 200
 * @param_label Density
 * @description 2D pitch surface: tilt left/right to select pitch, tilt forward/back for
 *              velocity. A gated note fires on each 16th beat at your current position.
 *              Shake to strum a chord upward from the current pitch.
 * @sound Lead / Whistle
 */

var strumStep    = -1;   // -1 = idle; 0..3 = strum in progress
var strumElapsed = 0;
var strumDegs    = [0, 0, 0, 0];
var lastMotionTl = 0;
var lastTickCol  = -1;

function activate(m) {
  strumStep    = -1;
  strumElapsed = 0;
  lastMotionTl = 0;
  lastTickCol  = -1;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // Map tilt to column (pitch) and row (velocity)
  var col = Math.floor(m.map(m.accelX, -100, 100, 0, m.COLS - 1));
  if (col < 0) col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  var row = Math.floor(m.map(m.accelY, -100, 100, 0, m.ROWS - 1));
  if (row < 0) row = 0;
  if (row > m.ROWS - 1) row = m.ROWS - 1;

  var deg = Math.floor((col * 6) / (m.COLS - 1));
  var vel = 50 + Math.floor((row * 77) / (m.ROWS - 1));

  // 16th-note gated note at current tilt position
  if (m.tick(0, Math.floor(m.beatMs / 4))) {
    m.note(deg, vel, Math.floor(m.beatMs / 4));
  }

  // Shake: strum 4 notes upward from current pitch
  if (m.motion > 150 && lastMotionTl <= 150 && strumStep < 0) {
    strumDegs[0] = deg;
    strumDegs[1] = deg + 2;
    strumDegs[2] = deg + 4;
    strumDegs[3] = deg + 6;
    for (var i = 0; i < 4; i++) {
      if (strumDegs[i] > 13) strumDegs[i] = 13;
    }
    strumStep    = 0;
    strumElapsed = 0;
  }
  lastMotionTl = m.motion;

  // Advance strum — one note every beatMs/8
  if (strumStep >= 0) {
    strumElapsed += m.dt;
    var strumInterval = Math.floor(m.beatMs / 8);
    if (strumInterval < 40) strumInterval = 40;
    while (strumElapsed >= strumInterval && strumStep < 4) {
      strumElapsed -= strumInterval;
      m.note(strumDegs[strumStep], vel + 20 > 127 ? 127 : vel + 20, Math.floor(m.beatMs / 2));
      strumStep++;
    }
    if (strumStep >= 4) strumStep = -1;
  }

  // Draw: crosshair at (col, row)
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (c === col && r === row) {
        // Centre: full brightness
        m.px(c, r, m.brightness);
      } else if (c === col || r === row) {
        // Arms: dim
        m.px(c, r, Math.floor(m.brightness / 5));
      } else {
        m.px(c, r, 0);
      }
    }
  }

  m.show();
}
