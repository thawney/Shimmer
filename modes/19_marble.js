/**
 * @name Marble
 * @author Thawney
 * @hue 45
 * @sat 180
 * @param_label Ball Count
 * @description Balls roll under tilt gravity and bounce off walls, firing notes on impact.
 *              Density sets ball count (1–4). Shake to scatter. Most alive when tilted.
 * @sound Pluck / Marimba
 */

// Gravity signs confirmed from accel_check.js:
//   accelX positive → tilt right → ball should roll right → gx positive ✓
//   accelY positive → tilt top-down → ball should roll to bottom (row 11) → gy positive ✓

var MAX_B = 4;
var b = [];
var numBalls    = 1;
var initialized = false;
var lastMotionMb = 0;

function activate(m) {
  initialized  = false;
  lastMotionMb = 0;
  b = [];
  for (var i = 0; i < MAX_B; i++) {
    b[i] = { x: 0.0, y: 0.0, vx: 0.0, vy: 0.0,
             prevCol: 0, prevRow: 0, cooldown: 0 };
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var nb = 1 + Math.floor((m.density * (MAX_B - 1)) / 255);
  if (nb > MAX_B) nb = MAX_B;

  if (!initialized || nb !== numBalls) {
    numBalls = nb;
    for (var i = 0; i < numBalls; i++) {
      b[i].x  = 1.0 + m.rnd(m.COLS - 2);
      b[i].y  = 1.0 + m.rnd(m.ROWS - 2);
      var ang  = (m.rnd(255) / 255.0) * 6.283;
      var spd  = 0.002 + (m.rnd(255) / 255.0) * 0.003;
      b[i].vx  = spd * Math.cos(ang);
      b[i].vy  = spd * Math.sin(ang);
      b[i].cooldown = 0;
    }
    initialized = true;
  }

  // Shake: scatter all balls in random directions
  if (m.motion > 160 && lastMotionMb <= 160) {
    for (var i = 0; i < numBalls; i++) {
      var ang = (m.rnd(255) / 255.0) * 6.283;
      var spd = 0.006 + (m.rnd(255) / 255.0) * 0.005;
      b[i].vx = spd * Math.cos(ang);
      b[i].vy = spd * Math.sin(ang);
    }
  }
  lastMotionMb = m.motion;

  // Gravity from tilt — same signs as accel_check.js gravity ball
  var gx = m.accelX * 0.0000025;
  var gy = m.accelY * 0.0000025;

  m.clear();

  for (var i = 0; i < numBalls; i++) {
    if (b[i].cooldown > 0) {
      b[i].cooldown -= m.dt;
      if (b[i].cooldown < 0) b[i].cooldown = 0;
    }

    b[i].prevCol = Math.floor(b[i].x);
    b[i].prevRow = Math.floor(b[i].y);

    // Gravity + light friction (dt-scaled)
    var f = 1.0 - 0.004 * m.dt;
    if (f < 0.80) f = 0.80;
    b[i].vx = b[i].vx * f + gx * m.dt;
    b[i].vy = b[i].vy * f + gy * m.dt;

    b[i].x += b[i].vx * m.dt;
    b[i].y += b[i].vy * m.dt;

    // Bounce off edges — 25% energy loss on impact
    var bounced = false;
    if (b[i].x < 0) {
      b[i].x  = 0;
      b[i].vx =  Math.abs(b[i].vx) * 0.75;
      bounced  = true;
    } else if (b[i].x > m.COLS - 1) {
      b[i].x  = m.COLS - 1;
      b[i].vx = -Math.abs(b[i].vx) * 0.75;
      bounced  = true;
    }
    if (b[i].y < 0) {
      b[i].y  = 0;
      b[i].vy =  Math.abs(b[i].vy) * 0.75;
      bounced  = true;
    } else if (b[i].y > m.ROWS - 1) {
      b[i].y  = m.ROWS - 1;
      b[i].vy = -Math.abs(b[i].vy) * 0.75;
      bounced  = true;
    }

    // Fire note on bounce — pitch from column, velocity from impact speed
    if (bounced && b[i].cooldown === 0) {
      var spd = Math.sqrt(b[i].vx * b[i].vx + b[i].vy * b[i].vy);
      if (spd > 0.003) {
        var vel = Math.floor(45 + spd * 2000);
        if (vel > 110) vel = 110;
        var deg = Math.floor((Math.floor(b[i].x) * 6) / (m.COLS - 1));
        m.note(deg, vel, 260);
        b[i].cooldown = 220;
      }
    }

    // Trail at 25% brightness, ball at full
    var trailBr = Math.floor((m.brightness * 25) / 100);
    if (trailBr < 4) trailBr = 4;
    m.px(b[i].prevCol, b[i].prevRow, trailBr);
    m.px(Math.floor(b[i].x), Math.floor(b[i].y), m.brightness);
  }

  m.show();
}
