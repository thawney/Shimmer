/**
 * @name Kaleidoscope
 * @author Tony Nacho
 * @hue 175
 * @sat 210
 * @param_label Glass
 * @description Mirrored coloured shards drift like a kaleidoscope. When still, the pattern mutates gently in time with the beat and blooms into evolving chords; knocks reshuffle the glass and throw the harmony somewhere new. Tilt biases the shard spread and harmonic centre.
 * @sound Glass pad / choir
 */

var KMAX = 9;
var kN = 0;
var kX = [], kY = [], kTX = [], kTY = [], kH = [], kTH = [], kB = [];
var kHue = [], kSat = [], kVal = [];
var kPhase = 0.0, kCalmMs = 0.0, kShockMs = 0.0;
var kLastMotion = 0, kBeat = 0, kMel = 0, kRoot = 1, kFam = 0;
var kTiltX = 0.0, kTiltY = 0.0;
var KSH = [
  [0, 2, 4, 6, 8],
  [0, 2, 4, 5, 7],
  [0, 1, 4, 6, 7],
  [0, 2, 3, 5, 7],
  [0, 2, 5, 7, 9]
];

function kAbs(v) { return v < 0 ? -v : v; }
function kClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function kResetCanvas(m) {
  for (var i = 0, n = m.COLS * m.ROWS; i < n; i++) {
    kVal[i] = 0;
    kHue[i] = 0;
    kSat[i] = 0;
  }
}

function kPaint(m, c, r, h, s, v) {
  if (c < 0 || r < 0 || c >= m.COLS || r >= m.ROWS || v <= 0) return;
  if (v > 255) v = 255;
  if (s < 0) s = 0;
  if (s > 255) s = 255;
  var idx = r * m.COLS + c;
  if (v > kVal[idx]) {
    kVal[idx] = v;
    kHue[idx] = h & 255;
    kSat[idx] = s;
  }
}

function kKernel(m, x, y, h, s, v) {
  var ix = Math.floor(x), iy = Math.floor(y);
  for (var r = iy - 1; r <= iy + 1; r++) {
    for (var c = ix - 1; c <= ix + 1; c++) {
      var dx = c - x; if (dx < 0) dx = -dx;
      var dy = r - y; if (dy < 0) dy = -dy;
      var br = v - Math.floor((dx + dy) * 92);
      if (br > 0) kPaint(m, c, r, h, s, br);
    }
  }
}

function kBurst(m, x, y, h, s, v) {
  kKernel(m, x, y, h, s, v);
  kKernel(m, 5.5 + (x - 5.5) * 0.56, 5.5 + (y - 5.5) * 0.56,
          (h + 8) & 255, s - 45, Math.floor(v * 0.45));
}

function kPlot8(m, x, y, h, s, v) {
  kBurst(m, x, y, h, s, v);
  kBurst(m, 11 - x, y, h, s, v);
  kBurst(m, x, 11 - y, h, s, v);
  kBurst(m, 11 - x, 11 - y, h, s, v);
  kBurst(m, y, x, h, s, v);
  kBurst(m, 11 - y, x, h, s, v);
  kBurst(m, y, 11 - x, h, s, v);
  kBurst(m, 11 - y, 11 - x, h, s, v);
}

function kInitPiece(i, m) {
  kX[i] = 1.5 + i * 0.35;
  kY[i] = 2.8 + i * 0.22;
  kTX[i] = kX[i];
  kTY[i] = kY[i];
  kH[i] = (160 + i * 17) & 255;
  kTH[i] = kH[i];
  kB[i] = 190;
  kRetarget(i, m, 1);
  kX[i] = kTX[i];
  kY[i] = kTY[i];
  kH[i] = kTH[i];
}

function kResize(m) {
  var want = 4 + Math.floor(m.density * 5 / 255);
  if (want < 4) want = 4;
  if (want > KMAX) want = KMAX;
  while (kN < want) {
    kInitPiece(kN, m);
    kN++;
  }
  while (kN > want) kN--;
}

function kRetarget(i, m, strong) {
  var nx = kTX[i], ny = kTY[i];
  if (strong || ny == null || m.rnd(4) === 0) {
    ny = 0.7 + m.rnd(46) / 10;
    nx = 0.2 + m.rnd(48) / 10;
    if (strong) ny += 0.45;
  } else {
    nx += (m.rnd(3) - 1) * (strong ? 1.2 : 0.55);
    ny += (m.rnd(3) - 1) * (strong ? 1.35 : 0.65);
  }
  nx += kTiltY * 0.28;
  ny += kTiltX * 0.18;
  if (m.accelZ < 32) ny += 0.35;
  nx = kClamp(nx, 0.1, 5.1);
  ny = kClamp(ny, 0.6, 5.35);
  if (nx > ny - 0.12) nx = ny - 0.12;
  if (nx < 0.1) nx = 0.1;
  kTX[i] = nx;
  kTY[i] = ny;
  kTH[i] = ((kTH[i] == null ? (170 + i * 17) : Math.floor(kTH[i])) +
            (strong ? 24 + m.rnd(92) : 8 + m.rnd(28)) +
            Math.floor(kAbs(kTiltY) * 22)) & 255;
  kB[i] = strong ? 255 : (170 + m.rnd(80));
}

function kComplex() {
  if (kN < 1) return 0.0;
  var spread = 0.0;
  for (var i = 0; i < kN; i++) spread += (kY[i] - kX[i]) + kY[i] * 0.55;
  spread = spread / (kN * 6.4);
  var v = ((kN - 4) / 5.0) * 0.45 + spread * 0.55;
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function kVoices(comp) {
  var v = 3 + Math.floor(comp * 2.9);
  return v > 5 ? 5 : v;
}

function kAdvanceHarmony(m, hard) {
  var drift = 0;
  if (kTiltY > 0.28) drift = 1;
  else if (kTiltY < -0.28) drift = -1;
  else if (hard || m.rnd(3) === 0) drift = (m.rnd(2) === 0) ? -1 : 1;
  if (m.rnd(hard ? 2 : 5) === 0) kFam = (kFam + 1 + m.rnd(2)) % KSH.length;
  kRoot += drift;
  if (kRoot < 0) kRoot = 0;
  if (kRoot > 4) kRoot = 4;
}

function kChord(m, comp, still, accent) {
  var sh = KSH[kFam];
  var voices = kVoices(comp + (accent ? 0.18 : 0.0));
  var vel = 50 + Math.floor(comp * 30) + (accent ? 18 : 0);
  var dur = Math.floor(m.beatMs * (still ? 1.35 : 0.95));
  if (dur < 140) dur = 140;
  for (var i = 0; i < voices; i++) {
    var deg = kRoot + sh[i];
    if (deg > 13) deg = 13;
    var noteVel = vel - i * 7 + m.rnd(8);
    if (noteVel < 34) noteVel = 34;
    if (noteVel > 120) noteVel = 120;
    m.note(deg, noteVel, dur);
  }
}

function kMelody(m, comp) {
  if (kN < 1) return;
  var sh = KSH[kFam];
  var voices = kVoices(comp);
  var idx = kMel % kN;
  kMel++;
  var span = Math.floor((kY[idx] - kX[idx]) * 1.7);
  if (span < 0) span = 0;
  var a = span % voices;
  var b = voices - 1 - a;
  var degA = kRoot + sh[a];
  var degB = kRoot + sh[b];
  if (degA > 13) degA = 13;
  if (degB > 13) degB = 13;
  var velA = 38 + Math.floor(comp * 28) + Math.floor(kY[idx] * 4) + m.rnd(12);
  var velB = velA - 10 + Math.floor((kX[idx] + 0.5) * 3);
  var dur = Math.floor(m.beatMs * (0.42 + comp * 0.18));
  if (dur < 80) dur = 80;
  m.note(degA, velA, dur);
  if (voices > 3 || b !== a) {
    if (velB < 26) velB = 26;
    m.note(degB, velB, dur);
  }
}

function kShock(m) {
  kShockMs = 900;
  kAdvanceHarmony(m, 1);
  kFam = (kFam + 1 + m.rnd(KSH.length - 1)) % KSH.length;
  for (var i = 0; i < kN; i++) kRetarget(i, m, 1);
  kChord(m, kComplex(), 0, 1);
}

function activate(m) {
  kN = 0;
  kPhase = 0.0;
  kCalmMs = 0.0;
  kShockMs = 0.0;
  kLastMotion = 0;
  kBeat = 0;
  kMel = 0;
  kRoot = 1 + m.rnd(3);
  kFam = m.rnd(KSH.length);
  kTiltX = m.accelX / 72.0;
  kTiltY = m.accelY / 72.0;
  kResize(m);
  m.clear();
  m.show();
}

function deactivate(m) { m.allOff(); }

function update(m) {
  kResize(m);
  kTiltX += ((m.accelX / 72.0) - kTiltX) * (m.dt / 900.0);
  kTiltY += ((m.accelY / 72.0) - kTiltY) * (m.dt / 900.0);

  if (m.motion < 16) kCalmMs += m.dt;
  else               kCalmMs = 0;
  var still = kCalmMs > 320;

  if (m.motion > 148 && kLastMotion <= 148) kShock(m);
  kLastMotion = m.motion;
  if (kShockMs > 0) {
    kShockMs -= m.dt;
    if (kShockMs < 0) kShockMs = 0;
  }

  var comp = kComplex();
  var subMs = Math.floor(m.beatMs / (2 + Math.floor(comp * 2.2)));
  if (subMs < 70) subMs = 70;

  if (m.tick(0, subMs)) {
    var edits = still ? 1 : (2 + (m.motion > 80 ? 1 : 0));
    for (var n = 0; n < edits; n++) kRetarget((kMel + n + m.rnd(kN)) % kN, m, 0);
    kMelody(m, comp);
  }

  if (m.tick(1, m.beatMs)) {
    kBeat++;
    if ((kBeat & 3) === 0 || m.motion > 60) kAdvanceHarmony(m, 0);
    kChord(m, comp, still, 0);
  }

  kResetCanvas(m);
  kPhase += m.dt / m.beatMs;
  while (kPhase >= 1.0) kPhase -= 1.0;
  var beatGlow = 0.55 + 0.45 * Math.sin(kPhase * 6.28318);
  var shock = kShockMs > 0 ? kShockMs / 900.0 : 0.0;

  kKernel(m, 5.5, 5.5,
          24 + Math.floor(beatGlow * 28),
          120,
          Math.floor(m.brightness * (0.10 + 0.14 * beatGlow + 0.28 * shock)));

  for (var i = 0; i < kN; i++) {
    var lag = still ? 850.0 : 280.0;
    var hLag = still ? 1600.0 : 420.0;
    kX[i] += (kTX[i] - kX[i]) * (m.dt / lag);
    kY[i] += (kTY[i] - kY[i]) * (m.dt / lag);
    var dh = kTH[i] - kH[i];
    if (dh > 128) dh -= 256;
    if (dh < -128) dh += 256;
    kH[i] += dh * (m.dt / hLag);
    if (kH[i] < 0) kH[i] += 256;
    if (kH[i] >= 256) kH[i] -= 256;

    var hue = (Math.floor(kH[i]) + Math.floor(kPhase * 24) + i * 9) & 255;
    var sat = 170 + Math.floor(comp * 56) + Math.floor(shock * 25);
    var br = Math.floor(kB[i] * (0.42 + 0.36 * beatGlow) + comp * 40 + shock * 70);
    if (i >= kVoices(comp) && still) br -= 18;
    if (br > 255) br = 255;
    kPlot8(m, kX[i], kY[i], hue, sat, br);
  }

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var idx = r * m.COLS + c;
      if (kVal[idx] > 0) m.px(c, r, kHue[idx], kSat[idx], kVal[idx]);
      else               m.px(c, r, 0);
    }
  }

  m.show();
}
