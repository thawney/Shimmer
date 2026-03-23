/**
 * @name Lean
 * @author Thawney
 * @hue 28
 * @sat 200
 * @param_label Sparkle
 * @description A point of light rests at the low corner of your tilt — left/right sets the note, up/down sets the velocity. Each beat it rings once from wherever it has settled, then a playful echo sparkles around it.
 * @sound Bell / Marimba
 */

var smoothX = 0.0;
var smoothY = 0.0;
var pix     = [];
var flashBr = 0;
var lastCol = 0;
var lastRow = 0;
var moveGlow = 0;
var echoPending = false;
var echoDelay = 0;
var echoDeg = 0;
var echoVel = 0;
var echoCol = 0;
var echoRow = 0;
var sparkStep = 0;
var SPARK_DX = [1, 0, -1, 0];
var SPARK_DY = [0, 1, 0, -1];
var SPARK_DX2 = [1, -1, -1, 1];
var SPARK_DY2 = [1, 1, -1, -1];

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function activate(m) {
  smoothX =  m.accelY;
  smoothY = -m.accelX;
  pix     = [];
  for (var r = 0; r < m.ROWS; r++) {
    pix[r] = [];
    for (var c = 0; c < m.COLS; c++) pix[r][c] = 0;
  }
  flashBr = 0;
  lastCol = Math.floor((m.COLS - 1) / 2);
  lastRow = Math.floor((m.ROWS - 1) / 2);
  moveGlow = 0;
  echoPending = false;
  echoDelay = 0;
  sparkStep = 0;
  m.clear();
  m.show();
}

function update(m) {
  var sparkle = m.density / 255.0;

  // Steeper tilt = faster response
  var tiltX = m.accelY < 0 ? -m.accelY : m.accelY;
  var tiltY = m.accelX < 0 ? -m.accelX : m.accelX;
  var lagX = 600 - Math.floor(tiltX * 5);
  var lagY = 600 - Math.floor(tiltY * 5);
  if (lagX < 100) lagX = 100;
  if (lagY < 100) lagY = 100;
  smoothX += (m.accelY  - smoothX) * (m.dt / lagX);
  smoothY += (-m.accelX - smoothY) * (m.dt / lagY);

  var col = Math.floor(m.map(smoothX, -80, 80, 0, m.COLS - 1));
  if (col < 0)           col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  var row = Math.floor(m.map(smoothY, -80, 80, 0, m.ROWS - 1));
  if (row < 0)           row = 0;
  if (row > m.ROWS - 1) row = m.ROWS - 1;

  var stepMove = (col > lastCol ? col - lastCol : lastCol - col) +
                 (row > lastRow ? row - lastRow : lastRow - row);
  if (stepMove > 0) {
    moveGlow += stepMove * (10 + Math.floor(18 * sparkle));
    if (moveGlow > 180) moveGlow = 180;
  }
  lastCol = col;
  lastRow = row;

  if (m.tick(0, m.beatMs)) {
    var deg = m.colToDegree(col);
    // Row position shades velocity: top (row 0) = soft, bottom = loud
    var rowFrac = (m.ROWS > 1) ? row / (m.ROWS - 1) : 0.5;
    var vel = 40 + Math.floor(rowFrac * 50) +
              Math.floor(moveGlow * 0.12) +
              Math.floor((m.density * 16) / 255);
    if (vel > 120) vel = 120;
    var dur = Math.floor(m.beatMs * (0.55 + rowFrac * 0.25));
    if (dur < 120) dur = 120;
    m.note(deg, vel, dur);
    pix[row][col] = m.brightness;
    flashBr = Math.floor(m.brightness * (0.28 + 0.24 * sparkle));

    if (sparkle > 0.08) {
      echoPending = true;
      echoDelay = Math.floor(m.beatMs * (0.22 - 0.08 * sparkle));
      if (echoDelay < 70) echoDelay = 70;
      echoDeg = deg + 2 + Math.floor(sparkle * 3) + (stepMove > 1 ? 1 : 0);
      echoVel = vel - 18 + Math.floor(moveGlow / 24);
      if (echoVel < 35) echoVel = 35;
      if (echoVel > 110) echoVel = 110;
      echoCol = clamp(col + (col < m.COLS / 2 ? 1 : -1), 0, m.COLS - 1);
      echoRow = clamp(row + (row < m.ROWS / 2 ? 1 : -1), 0, m.ROWS - 1);
      sparkStep = (sparkStep + 1 + (stepMove > 1 ? 1 : 0)) & 3;
    } else {
      echoPending = false;
    }
  }

  if (echoPending) {
    if (echoDelay > m.dt) echoDelay -= m.dt;
    else {
      m.note(echoDeg, echoVel, Math.floor(m.beatMs * 0.35));
      pix[echoRow][echoCol] = Math.floor(m.brightness * (0.45 + 0.25 * sparkle));
      flashBr += Math.floor(m.brightness * 0.10);
      if (flashBr > m.brightness) flashBr = m.brightness;
      echoPending = false;
    }
  }

  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  if (flashBr > fadeAmt) flashBr -= fadeAmt;
  else flashBr = 0;
  if (moveGlow > fadeAmt + 1) moveGlow -= (fadeAmt + 1);
  else moveGlow = 0;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (pix[r][c] > fadeAmt) pix[r][c] -= fadeAmt;
      else pix[r][c] = 0;
    }
  }

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var br = pix[r][c];
      var dist = (r > row ? r - row : row - r) +
                 (c > col ? c - col : col - c);
      if (dist === 0) {
        var live = Math.floor(m.brightness * 0.34) +
                   flashBr +
                   Math.floor(moveGlow * 0.45);
        if (live > br) br = live;
      } else if (dist === 1) {
        var adj = Math.floor(m.brightness * (0.10 + 0.12 * sparkle)) +
                  Math.floor(moveGlow * 0.16);
        if (adj > br) br = adj;
      } else if (dist === 2 && sparkle > 0.35 && (r === row || c === col)) {
        var halo = Math.floor(m.brightness * (0.04 + 0.06 * sparkle));
        if (halo > br) br = halo;
      }
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  var sparkColA = clamp(col + SPARK_DX[sparkStep], 0, m.COLS - 1);
  var sparkRowA = clamp(row + SPARK_DY[sparkStep], 0, m.ROWS - 1);
  var sparkBrA = 18 + Math.floor(m.brightness * (0.08 + 0.22 * sparkle)) +
                 Math.floor(moveGlow * 0.18);
  if (sparkBrA > 160) sparkBrA = 160;
  m.px(sparkColA, sparkRowA, 38, 220, sparkBrA);

  if (sparkle > 0.35) {
    var sparkColB = clamp(col + SPARK_DX2[sparkStep], 0, m.COLS - 1);
    var sparkRowB = clamp(row + SPARK_DY2[sparkStep], 0, m.ROWS - 1);
    var sparkBrB = 16 + Math.floor(m.brightness * (0.06 + 0.16 * sparkle));
    m.px(sparkColB, sparkRowB, 52, 220, sparkBrB);
  }

  m.show();
}
