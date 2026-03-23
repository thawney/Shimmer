/**
 * @name Flock
 * @author Thawney
 * @hue 150
 * @sat 200
 * @param_label Boid Count
 * @description 1D boids flock and cluster. Dense clusters fire stacked chords on a tempo grid.
 * @sound Choir / Ensemble
 */

var MAX_BOIDS = 8;

var boids          = [];
var numBoids       = 4;
var colBright      = [];
var colDebounce    = [];
var eventElapsed   = 0;
var driftPhase     = 0.0;
var initialized    = false;
var smoothWind     = 0;    // slow-drift accelX → flock centroid bias (~15s lag)
var lastMotionFl   = 0;
var MAX_CATCHUP_STEPS = 6;

function activate(m) {
  initialized  = false;
  eventElapsed = 0;
  driftPhase   = 0.0;
  smoothWind   = 0;
  lastMotionFl = 0;
  boids = [];
  for (var i = 0; i < MAX_BOIDS; i++) {
    boids[i] = {
      pos: (i * (m.COLS - 1)) / (MAX_BOIDS - 1),
      vel: 0.0
    };
  }
  colBright   = [];
  colDebounce = [];
  for (var c = 0; c < m.COLS; c++) {
    colBright[c]   = 0;
    colDebounce[c] = 0;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var tempoScale = 500.0 / m.beatMs;  // 1.0 at 120bpm
  var dt = m.dt / 1000.0;

  // Tilt slowly pulls the flock's home position left/right over ~15 seconds
  smoothWind += (m.accelY - smoothWind) * (m.dt / 15000.0);

  if (!initialized) {
    numBoids = 2 + Math.floor((m.density * 6) / 255);
    if (numBoids > MAX_BOIDS) numBoids = MAX_BOIDS;
    initialized = true;
  }

  var nb = 2 + Math.floor((m.density * 6) / 255);
  if (nb > MAX_BOIDS) nb = MAX_BOIDS;
  numBoids = nb;

  // speed: use density as proxy for speed seed
  var spd = (0.5 + (m.density / 255.0) * 4.0) * tempoScale;
  if (spd < 0.35) spd = 0.35;

  // Knock scatters the flock — they re-converge naturally over a few seconds
  if (m.motion > 160 && lastMotionFl <= 160) {
    for (var i = 0; i < nb; i++)
      boids[i].vel = (m.rnd(255) < 128 ? 1.0 : -1.0) * spd;
  }
  lastMotionFl = m.motion;

  // Tick debounce
  for (var c = 0; c < m.COLS; c++) {
    if (colDebounce[c] > m.dt) colDebounce[c] -= m.dt;
    else colDebounce[c] = 0;
  }

  // Centroid and average velocity
  var centroid = 0.0, avgVel = 0.0;
  for (var i = 0; i < nb; i++) centroid += boids[i].pos;
  for (var i = 0; i < nb; i++) avgVel   += boids[i].vel;
  centroid /= nb;
  avgVel   /= nb;

  driftPhase += dt * (1.1 + tempoScale * 0.7);

  // 1D boid physics
  for (var i = 0; i < nb; i++) {
    var sep = 0.0;
    for (var j = 0; j < nb; j++) {
      if (i === j) continue;
      var diff = boids[i].pos - boids[j].pos;
      var dist = diff < 0 ? -diff : diff;
      if (dist < 4.0 && dist > 0.001)
        sep += (diff / dist) * (4.0 - dist);
    }
    var tiltTarget = Math.floor(m.COLS / 2) + Math.floor(smoothWind * 4 / 127);
    if (tiltTarget < 0) tiltTarget = 0;
    if (tiltTarget > m.COLS - 1) tiltTarget = m.COLS - 1;
    var biasedCentroid = centroid * 0.7 + tiltTarget * 0.3;
    var cohere = (biasedCentroid - boids[i].pos) * 0.12;
    var align  = (avgVel  - boids[i].vel)  * 0.22;
    var drift  = Math.sin(driftPhase + i * 1.17) * 0.06 * tempoScale;

    boids[i].vel = (boids[i].vel + sep * 0.16 + cohere + align + drift) * 0.96;
    if (boids[i].vel >  spd) boids[i].vel =  spd;
    if (boids[i].vel < -spd) boids[i].vel = -spd;

    // Prevent dead-stops
    var absVel = boids[i].vel < 0 ? -boids[i].vel : boids[i].vel;
    var minVel = 0.10 + tempoScale * 0.04;
    if (absVel < minVel) {
      var dir = (boids[i].pos <= centroid) ? 1.0 : -1.0;
      boids[i].vel = dir * minVel;
    }

    var np = boids[i].pos + boids[i].vel * dt;
    if (np < 0.0)           { np = 0.0;          boids[i].vel =  Math.abs(boids[i].vel) * 0.8; }
    if (np > m.COLS - 1.0)  { np = m.COLS - 1.0; boids[i].vel = -Math.abs(boids[i].vel) * 0.8; }
    boids[i].pos = np;
  }

  // Count boids per column
  var counts = [];
  for (var c = 0; c < m.COLS; c++) counts[c] = 0;
  for (var i = 0; i < nb; i++) {
    var col = Math.floor(boids[i].pos + 0.5);
    if (col < m.COLS) counts[col]++;
  }

  // Rhythm-locked cluster events every beatMs/2
  eventElapsed += m.dt;
  var eventStepMs = Math.floor(m.beatMs / 2);
  if (eventStepMs < 90) eventStepMs = 90;

  var catchUps = 0;
  while (eventElapsed >= eventStepMs && catchUps < MAX_CATCHUP_STEPS) {
    eventElapsed -= eventStepMs;
    catchUps++;

    var bestCol = -1, bestNearby = 0;
    for (var col = 0; col < m.COLS; col++) {
      var nearby = counts[col];
      if (col > 0) nearby += counts[col - 1];
      if (col + 1 < m.COLS) nearby += counts[col + 1];
      if (nearby > bestNearby) { bestNearby = nearby; bestCol = col; }
    }

    if (bestCol >= 0 && bestNearby >= 2 && colDebounce[bestCol] === 0) {
      var baseDeg = Math.floor((bestCol * 6) / (m.COLS - 1));
      var vel     = 55 + m.rnd(64);
      var voices  = bestNearby < 4 ? bestNearby : 4;
      for (var vi = 0; vi < voices; vi++) {
        var deg = baseDeg + vi * 2;
        if (deg > 13) deg = 13;
        m.note(deg, vel, m.beatMs);
      }
      colBright[bestCol]   = m.brightness;
      colDebounce[bestCol] = eventStepMs;
    }
  }
  if (catchUps === MAX_CATCHUP_STEPS && eventElapsed >= eventStepMs) eventElapsed = eventStepMs - 1;

  // Fade: (3*dt+8)/16
  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;
  }

  // Boid column presence
  var boidCols = [];
  for (var c = 0; c < m.COLS; c++) boidCols[c] = 0;
  for (var i = 0; i < nb; i++) {
    var col = Math.floor(boids[i].pos + 0.5);
    if (col < m.COLS) boidCols[col] = 1;
  }

  for (var col = 0; col < m.COLS; col++) {
    var br = colBright[col];
    if (boidCols[col]) {
      var boidBr = Math.floor(m.brightness / 2);
      if (boidBr > br) br = boidBr;
    }
    for (var row = 0; row < m.ROWS; row++) {
      if (br > 0) m.px(col, row, br);
      else        m.px(col, row, 0);
    }
  }

  m.show();
}
