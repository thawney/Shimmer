/**
 * @name Spark
 * @author Thawney
 * @hue 0
 * @sat 240
 * @param_label Particle Count
 * @description Particles bounce off walls. Left/right bounces fire notes pitched from vertical position.
 * @sound Plucked String / Pizzicato
 */

var NOTE_DUR_MS = 180;
var MAX_P = 4;

var p = [];
var numParticles  = 2;
var particleSpeed = 0.0;
var initialized   = false;
var lastMotionSp  = 0;

function safeDt(m) {
  var dt = m.dt;
  if (dt < 1) dt = 1;
  if (dt > 96) dt = 96;
  return dt;
}

function safeBeatMs(m) {
  var beatMs = m.beatMs;
  if (beatMs < 40) beatMs = 40;
  if (beatMs > 4000) beatMs = 4000;
  return beatMs;
}

function activate(m) {
  initialized  = false;
  particleSpeed = 0.0;
  lastMotionSp  = 0;
  p = [];
  for (var i = 0; i < MAX_P; i++) {
    p[i] = {
      x: ((i * 7 + 3) % m.COLS),
      y: (i % m.ROWS),
      vx: 0.01 * (i % 2 === 0 ? 1.0 : -1.0),
      vy: 0.008 * (i % 2 === 0 ? 1.0 : -1.0),
      prevCol: 0,
      prevRow: 0
    };
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var dt = safeDt(m);
  var beatMs = safeBeatMs(m);
  var tempoScale = 500.0 / beatMs;
  var targetSpeed = (0.008 + (m.density / 255.0) * 0.032) * tempoScale;

  if (!initialized) {
    numParticles = 2 + Math.floor((m.density * 2) / 255);
    if (numParticles > MAX_P) numParticles = MAX_P;

    for (var i = 0; i < numParticles; i++) {
      p[i].x = 2 + m.rnd(m.COLS - 4);
      p[i].y = m.rnd(m.ROWS);
      var ang = (m.rnd(255) / 255.0) * 6.28318;
      p[i].vx = targetSpeed * Math.cos(ang);
      p[i].vy = targetSpeed * Math.sin(ang) * 0.5;
    }
    particleSpeed = targetSpeed;
    initialized = true;
  } else if (Math.abs(targetSpeed - particleSpeed) > 0.0001) {
    var ratio = (particleSpeed > 0.0001) ? (targetSpeed / particleSpeed) : 1.0;
    for (var i = 0; i < numParticles; i++) {
      var magSq = p[i].vx * p[i].vx + p[i].vy * p[i].vy;
      if (magSq > 0.000001) {
        p[i].vx *= ratio;
        p[i].vy *= ratio;
      } else {
        var ang2 = (m.rnd(255) / 255.0) * 6.28318;
        p[i].vx = targetSpeed * Math.cos(ang2);
        p[i].vy = targetSpeed * Math.sin(ang2) * 0.5;
      }
    }
    particleSpeed = targetSpeed;
  }

  // Knock scatters all particles in random directions
  if (m.motion > 160 && lastMotionSp <= 160) {
    for (var i = 0; i < numParticles; i++) {
      var ang = (m.rnd(255) / 255.0) * 6.28318;
      p[i].vx = particleSpeed * 2.0 * Math.cos(ang);
      p[i].vy = particleSpeed * 2.0 * Math.sin(ang) * 0.5;
    }
  }
  lastMotionSp = m.motion;

  // Clear display
  m.clear();

  // accelY = left/right tilt → horizontal gravity; accelX = forward/back → vertical gravity
  // Negate accelX for gy: forward tilt (accelX+, top dips) should pull particles UP (row 0)
  var gx = m.accelY * 0.000006;
  var gy = -m.accelX * 0.000006;

  for (var i = 0; i < numParticles; i++) {
    p[i].prevCol = Math.floor(p[i].x);
    p[i].prevRow = Math.floor(p[i].y);

    p[i].vx += gx * dt;
    p[i].vy += gy * dt;
    p[i].x += p[i].vx * dt;
    p[i].y += p[i].vy * dt;

    // Horizontal bounce → fire note
    var bouncedX = false;
    if (p[i].x < 0) {
      p[i].x  = 0;
      p[i].vx = Math.abs(p[i].vx);
      bouncedX = true;
    } else if (p[i].x > m.COLS - 1) {
      p[i].x  = m.COLS - 1;
      p[i].vx = -Math.abs(p[i].vx);
      bouncedX = true;
    }

    // Vertical bounce — no note
    if (p[i].y < 0)          { p[i].y = 0;          p[i].vy =  Math.abs(p[i].vy); }
    if (p[i].y > m.ROWS - 1) { p[i].y = m.ROWS - 1; p[i].vy = -Math.abs(p[i].vy); }

    if (bouncedX) {
      var row = Math.floor(p[i].y + 0.5);
      if (row >= m.ROWS) row = m.ROWS - 1;
      var deg = Math.floor((row * 6) / (m.ROWS - 1));
      var vel = 70 + m.rnd(31);
      m.note(deg, vel, NOTE_DUR_MS);
    }

    var col = Math.floor(p[i].x);
    var row = Math.floor(p[i].y);

    // Trail at 30% brightness
    var trailBr = Math.floor((m.brightness * 30) / 100);
    if (trailBr < 6) trailBr = 6;
    m.px(p[i].prevCol, p[i].prevRow, trailBr);

    // Current at full brightness
    m.px(col, row, m.brightness);
  }

  m.show();
}
