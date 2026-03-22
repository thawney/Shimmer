/**
 * @name Pressure
 * @author Thawney
 * @hue 0
 * @sat 220
 * @param_label Release Speed
 * @description Shake to build energy. Release as a burst of notes. Density = burst speed.
 * @sound Pad / Brass
 */

var energy      = 0.0;   // 0–255 stored pressure
var releasing   = false;
var releaseQueue = [];   // scheduled note positions (cols) to fire
var releaseIdx  = 0;
var releaseTimer = 0;
var breathPhase = 0.0;
var lastMotion  = 0;
var glowCols    = [];    // per-column glow brightness

function activate(m) {
  energy       = 0.0;
  releasing    = false;
  releaseQueue = [];
  releaseIdx   = 0;
  releaseTimer = 0;
  breathPhase  = 0.0;
  lastMotion   = 0;
  glowCols = [];
  for (var c = 0; c < m.COLS; c++) glowCols[c] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function buildReleaseQueue(m, storedEnergy) {
  // Number of notes proportional to energy: 1 note per 12 units, min 1 max 20
  var count = Math.floor(storedEnergy / 12);
  if (count < 1)  count = 1;
  if (count > 20) count = 20;
  releaseQueue = [];
  var center = Math.floor(m.COLS / 2);
  for (var i = 0; i < count; i++) {
    // Spread outward from center in a wave pattern
    var spread = Math.floor((i * m.COLS) / (count * 2));
    var side   = (i % 2 === 0) ? 1 : -1;
    var col    = center + side * spread;
    if (col < 0)        col = 0;
    if (col >= m.COLS)  col = m.COLS - 1;
    releaseQueue.push(col);
  }
  releaseIdx   = 0;
  releasing    = true;
  releaseTimer = 0;
}

function update(m) {
  // ── Absorb motion into energy ──
  var motionDelta = m.motion - lastMotion;
  if (motionDelta < 0) motionDelta = -motionDelta;
  lastMotion = m.motion;

  if (!releasing) {
    // Charge: motion drives energy up, natural leak when still
    var charge = (m.motion > 30) ? (m.motion / 255.0) * 3.5 * (m.dt / 16.0) : 0.0;
    var leak   = 0.4 * (m.dt / 16.0);
    energy += charge - leak;
    if (energy < 0)   energy = 0;
    if (energy > 255) energy = 255;

    // Release trigger: motion drops from high to low
    if (m.motion < 25 && energy > 18) {
      buildReleaseQueue(m, energy);
      energy = 0.0;
    }
  }

  // ── Fire release notes ──
  if (releasing) {
    // density → how fast notes fire: 255=fast(30ms), 0=slow(200ms)
    var noteInterval = Math.floor(200 - (m.density / 255.0) * 170);
    if (noteInterval < 30) noteInterval = 30;

    releaseTimer += m.dt;
    while (releaseTimer >= noteInterval && releaseIdx < releaseQueue.length) {
      releaseTimer -= noteInterval;
      var col = releaseQueue[releaseIdx];
      var deg = m.colToDegree(col);
      // Louder for earlier notes (the burst front)
      var frac = 1.0 - releaseIdx / releaseQueue.length;
      var vel  = Math.floor(55 + frac * 72);
      if (vel > 127) vel = 127;
      m.note(deg, vel, Math.floor(m.beatMs * 0.35));
      // Light up that column
      glowCols[col] = Math.floor(m.brightness * (0.6 + frac * 0.4));
      releaseIdx++;
    }

    if (releaseIdx >= releaseQueue.length) {
      releasing = false;
      releaseQueue = [];
    }
  }

  // ── Idle breath: sparse, very soft pad chord every 4 beats ──
  if (!releasing && energy < 8) {
    breathPhase += m.dt;
    if (breathPhase >= m.beatMs * 4) {
      breathPhase -= m.beatMs * 4;
      // Play a quiet spread chord: root, fifth, octave equivalent
      var root = 1 + m.rnd(6);
      var degs = [root, (root + 4) % 14, (root + 7) % 14];
      for (var d = 0; d < 3; d++) {
        m.note(degs[d], 16 + m.rnd(10), Math.floor(m.beatMs * 6.0));
        var idleCol = m.degreeToCol(degs[d]);
        if (idleCol >= 0 && idleCol < m.COLS)
          glowCols[idleCol] = Math.floor(m.brightness * 0.12);
      }
    }
  }

  // ── Fade glow columns ──
  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (glowCols[c] > fadeAmt) glowCols[c] -= fadeAmt;
    else glowCols[c] = 0;
  }

  // ── Draw ──
  m.clear();
  var center = Math.floor(m.COLS / 2);

  // Central pressure glow when charging
  if (!releasing && energy > 0) {
    var halfW = Math.floor((energy / 255.0) * 10);
    var peakBr = Math.floor((energy / 255.0) * m.brightness);
    for (var c = 0; c < m.COLS; c++) {
      var dist = c - center;
      if (dist < 0) dist = -dist;
      if (dist <= halfW) {
        var dimmed = Math.floor(peakBr * (halfW - dist + 1) / (halfW + 1));
        for (var r = 0; r < m.ROWS; r++) m.px(c, r, dimmed);
      }
    }
  }

  // Release burst columns
  for (var c = 0; c < m.COLS; c++) {
    if (glowCols[c] > 0) {
      for (var r = 0; r < m.ROWS; r++) m.px(c, r, glowCols[c]);
    }
  }

  m.show();
}
