/**
 * @name Tombola
 * @author Tony Nacho
 * @hue 36
 * @sat 220
 * @param_label Mass
 * @description Tilt spins a tombola cage. Knock or MIDI note to add a ball, shake hard to clear the drum.
 * @sound Bell Pluck / Glass Keys
 */

var MAX_BALLS = 12;
var BALL_R = 0.30;
var BASE_GRAVITY = 0.0000011;
var EXTRA_GRAVITY = 0.0000018;
var SPIN_ACCEL = 0.000000022;
var SPIN_FRICTION = 0.00022;
var SPIN_VEL_MAX = 0.0085;
var KNOCK_THRESHOLD = 150;
var SHAKE_THRESHOLD = 220;
var PICKUP_ARC = 0.42;
var CLOCK_PPQN = 24.0;
var WALL_SIDES = 6;
var WALL_HALF_W = 0.42;
var WALL_SOFT = 0.95;
var SCALE_MASKS = [0xAB5, 0x5AD, 0x6AD, 0x295, 0xFFF, 0x6B5, 0xAD5, 0x5AB, 0x9AD, 0x555];

var balls = [];
var smoothSpin = 0.0;
var smoothGrav = 0.0;
var spinVel = 0.0;
var phase = -1.57079;
var lastMotion = 0;

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

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

function wrapAngle(a) {
  while (a <= -3.14159) a += 6.28318;
  while (a > 3.14159) a -= 6.28318;
  return a;
}

function radiusFor(m) {
  var smaller = m.COLS < m.ROWS ? m.COLS : m.ROWS;
  return smaller * 0.42;
}

function centerX(m) {
  return (m.COLS - 1) * 0.5;
}

function centerY(m) {
  return (m.ROWS - 1) * 0.5;
}

function distToSeg(px, py, x0, y0, x1, y1) {
  var vx = x1 - x0;
  var vy = y1 - y0;
  var lenSq = vx * vx + vy * vy;
  var t = 0.0;

  if (lenSq > 0.000001) {
    t = ((px - x0) * vx + (py - y0) * vy) / lenSq;
    t = clamp(t, 0.0, 1.0);
  }

  var sx = x0 + vx * t;
  var sy = y0 + vy * t;
  var dx = px - sx;
  var dy = py - sy;
  return Math.sqrt(dx * dx + dy * dy);
}

function scaleMaskFor(m) {
  var scale = m.scale | 0;
  return SCALE_MASKS[scale] !== undefined ? SCALE_MASKS[scale] : SCALE_MASKS[3];
}

function scaleToneCount(mask) {
  var count = 0;
  for (var i = 0; i < 12; i++) {
    if (mask & (1 << i)) count++;
  }
  return count > 0 ? count : 1;
}

function degreeFromMidiNote(m, note) {
  var mask = scaleMaskFor(m);
  var tones = scaleToneCount(mask);
  var root = m.rootNote | 0;
  var rel = (note | 0) - 48 - ((root % 12 + 12) % 12);
  var baseOct = Math.floor(rel / 12);
  var bestDegree = 0;
  var bestDist = 9999;

  for (var oct = baseOct - 1; oct <= baseOct + 1; oct++) {
    var degreeInOct = 0;

    for (var semi = 0; semi < 12; semi++) {
      if (!(mask & (1 << semi))) continue;

      var pitch = oct * 12 + semi;
      var dist = Math.abs(pitch - rel);
      if (dist < bestDist) {
        bestDist = dist;
        bestDegree = oct * tones + degreeInOct;
      }
      degreeInOct++;
    }
  }

  if (bestDegree < 0) bestDegree = 0;
  return bestDegree;
}

function drawWall(m, cx, cy, radius, rot, br) {
  var verts = [];
  var stepAng = 6.28318 / WALL_SIDES;
  var reach = WALL_HALF_W + WALL_SOFT;

  for (var i = 0; i < WALL_SIDES; i++) {
    var ang = rot + i * stepAng;
    verts[i] = {
      x: cx + Math.cos(ang) * radius,
      y: cy + Math.sin(ang) * radius
    };
  }

  for (var row = 0; row < m.ROWS; row++) {
    for (var col = 0; col < m.COLS; col++) {
      var best = 0.0;

      for (var side = 0; side < WALL_SIDES; side++) {
        var a = verts[side];
        var b = verts[(side + 1) % WALL_SIDES];
        var dist = distToSeg(col, row, a.x, a.y, b.x, b.y);
        var mix = 1.0 - dist / reach;
        if (mix <= 0.0) continue;
        mix = mix * mix * (3.0 - 2.0 * mix);
        if (mix > best) best = mix;
      }

      if (best > 0.03) {
        m.px(col, row, 0, 0, Math.floor(br * best + 0.5));
      }
    }
  }
}

function strikeBall(m, ball, vel, beatMs) {
  if (ball.cool > 0) return;
  if (vel < 44) vel = 44;
  if (vel > 118) vel = 118;
  m.note(ball.deg, vel, Math.floor(beatMs * 0.28));
  ball.cool = 90;
}

function kickRimBalls(m, cx, cy, innerR, wallTurn, beatMs) {
  var edgeBand = innerR - 0.22;
  var launchSpeed = 0.0105 + (m.density / 255.0) * 0.0065;
  var inwardMin = launchSpeed * 0.28;
  var launchInset = 0.14;

  for (var i = 0; i < balls.length; i++) {
    var ball = balls[i];
    var dx = ball.x - cx;
    var dy = ball.y - cy;
    var radial = Math.sqrt(dx * dx + dy * dy);
    if (radial < edgeBand || radial < 0.0001) continue;

    var nx = dx / radial;
    var ny = dy / radial;
    var tx = -ny;
    var ty = nx;
    var radialVel = ball.vx * nx + ball.vy * ny;
    var tangentialVel = ball.vx * tx + ball.vy * ty;
    if (radialVel < -inwardMin) continue;
    var carry = wallTurn * 0.16;
    var targetTangential = tangentialVel * 0.18 + carry;

    // Re-seat the ball just inside the rim, then fire it across the cage.
    ball.x -= nx * launchInset;
    ball.y -= ny * launchInset;
    ball.vx = tx * targetTangential - nx * launchSpeed;
    ball.vy = ty * targetTangential - ny * launchSpeed;
    strikeBall(m, ball, 72 + Math.floor(launchSpeed * 2600.0), beatMs);
  }
}

function addBall(m, degree) {
  if (balls.length >= MAX_BALLS) return;

  var cx = centerX(m);
  var cy = centerY(m);
  var ang = (m.rnd(256) / 255.0) * 6.28318;
  var rad = (m.rnd(100) / 100.0) * radiusFor(m) * 0.28;
  var x = cx + Math.cos(ang) * rad;
  var y = cy + Math.sin(ang) * rad;
  var tang = ang + 1.57079;
  var speed = 0.003 + (m.rnd(24) / 4000.0);

  balls.push({
    x: x,
    y: y,
    prevX: x,
    prevY: y,
    vx: Math.cos(tang) * speed,
    vy: Math.sin(tang) * speed,
    deg: degree,
    cool: 120
  });
}

function seedBalls(m) {
  balls = [];
  addBall(m, 0);
  addBall(m, 2 + m.rnd(3));
  addBall(m, 4 + m.rnd(3));
  addBall(m, 7 + m.rnd(4));
}

function collidePair(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var minDist = BALL_R * 2.0;
  var distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return;

  if (distSq < 0.000001) {
    dx = 0.01;
    dy = 0.0;
    distSq = dx * dx + dy * dy;
  }

  var dist = Math.sqrt(distSq);
  var nx = dx / dist;
  var ny = dy / dist;
  var overlap = minDist - dist;
  var sep = overlap * 0.5;

  a.x -= nx * sep;
  a.y -= ny * sep;
  b.x += nx * sep;
  b.y += ny * sep;

  var rvx = b.vx - a.vx;
  var rvy = b.vy - a.vy;
  var closing = rvx * nx + rvy * ny;
  if (closing >= 0) return;

  var impulse = -closing * 0.92 * 0.5;
  a.vx -= nx * impulse;
  a.vy -= ny * impulse;
  b.vx += nx * impulse;
  b.vy += ny * impulse;
}

function activate(m) {
  smoothSpin = m.accelY;
  smoothGrav = m.accelX;
  spinVel = 0.0;
  phase = -1.57079;
  lastMotion = m.motion;
  seedBalls(m);
  m.clear();
  m.show();
}

function update(m) {
  var frameDt = safeDt(m);
  var beatMs = safeBeatMs(m);
  var cx = centerX(m);
  var cy = centerY(m);
  var drumR = radiusFor(m);
  var innerR = drumR - BALL_R;
  var bounce = 0.62 + (m.density / 255.0) * 0.34;
  var minRebound = 0.0012 + (m.density / 255.0) * 0.0008;

  if (m.motion > SHAKE_THRESHOLD && lastMotion <= SHAKE_THRESHOLD) {
    balls = [];
  } else if (m.motion > KNOCK_THRESHOLD && lastMotion <= KNOCK_THRESHOLD) {
    addBall(m, m.rnd(14));
  }
  if (m.midiType === 1 && m.midiNote !== 255) {
    addBall(m, degreeFromMidiNote(m, m.midiNote));
  }
  lastMotion = m.motion;

  var clockPulseMs = beatMs / CLOCK_PPQN;
  var clockPulse = m.tick(7, clockPulseMs > 6.0 ? clockPulseMs : 6.0);
  var simRemaining = frameDt;
  var substeps = 0;
  var wallTurn = spinVel * drumR;

  m.fade(18);
  while (simRemaining > 0 && substeps < 6) {
    var dt = simRemaining > 16 ? 16 : simRemaining;
    var drag = 1.0 - (0.0017 - (m.density / 255.0) * 0.0005) * dt;
    if (drag < 0.965) drag = 0.965;

    smoothSpin += (m.accelY - smoothSpin) * (dt / 130.0);
    smoothGrav += (m.accelX - smoothGrav) * (dt / 130.0);
    spinVel += smoothSpin * SPIN_ACCEL * dt;
    spinVel *= 1.0 - SPIN_FRICTION * dt;
    spinVel = clamp(spinVel, -SPIN_VEL_MAX, SPIN_VEL_MAX);
    phase = wrapAngle(phase + spinVel * dt);

    var gravMix = clamp((smoothGrav + 128.0) / 255.0, 0.0, 1.0);
    var gy = BASE_GRAVITY + gravMix * EXTRA_GRAVITY;
    wallTurn = spinVel * drumR;

    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (substeps === 0) {
        b.prevX = b.x;
        b.prevY = b.y;
      }
      if (b.cool > 0) b.cool -= dt;
      else b.cool = 0;

      var rx = b.x - cx;
      var ry = b.y - cy;
      var radial = Math.sqrt(rx * rx + ry * ry);
      var wallMix = clamp((radial / innerR - 0.35) / 0.65, 0.0, 1.0);
      var targetVx = -ry * spinVel;
      var targetVy = rx * spinVel;
      var carry = (0.00045 + wallMix * 0.0022) * dt;
      b.vx += (targetVx - b.vx) * carry;
      b.vy += (targetVy - b.vy) * carry;
      b.vy += gy * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    for (var a = 0; a < balls.length; a++) {
      for (var j = a + 1; j < balls.length; j++) {
        collidePair(balls[a], balls[j]);
      }
    }

    for (var n = 0; n < balls.length; n++) {
      var ball = balls[n];
      var dx = ball.x - cx;
      var dy = ball.y - cy;
      var distSq = dx * dx + dy * dy;

      if (distSq >= innerR * innerR) {
        var dist = Math.sqrt(distSq);
        var nx = dx / dist;
        var ny = dy / dist;
        var ang2 = Math.atan2(dy, dx);
        var vn = ball.vx * nx + ball.vy * ny;

        ball.x = cx + nx * innerR;
        ball.y = cy + ny * innerR;

        if (vn > 0) {
          var rebound = -vn * bounce;
          if (rebound < minRebound) rebound = minRebound;

          ball.vx -= (1.0 + bounce) * vn * nx;
          ball.vy -= (1.0 + bounce) * vn * ny;

          // The rotating cage drags the ball tangentially at the rim.
          var tx = -ny;
          var ty = nx;
          var vt = ball.vx * tx + ball.vy * ty;
          var wallVt = wallTurn;
          ball.vx += tx * (wallVt - vt) * 0.82;
          ball.vy += ty * (wallVt - vt) * 0.82;

          // Give slow wall contacts a small inward kick so they do not dead-stick to the rim.
          var rimVt = ball.vx * tx + ball.vy * ty;
          ball.vx = tx * rimVt - nx * rebound;
          ball.vy = ty * rimVt - ny * rebound;

          if (ball.cool <= 0 && wrapAngle(ang2 - phase) < PICKUP_ARC && wrapAngle(ang2 - phase) > -PICKUP_ARC) {
            var vel = 56 + Math.floor(vn * 2600.0);
            strikeBall(m, ball, vel, beatMs);
          }
        }
      }
    }

    simRemaining -= dt;
    substeps++;
  }

  if (clockPulse) {
    kickRimBalls(m, cx, cy, innerR, wallTurn, beatMs);
  }

  drawWall(m, cx, cy, drumR, phase, m.brightness);

  for (var q = 0; q < balls.length; q++) {
    var draw = balls[q];
    var col = Math.floor(draw.x + 0.5);
    var row = Math.floor(draw.y + 0.5);
    var trailCol = Math.floor(draw.prevX + 0.5);
    var trailRow = Math.floor(draw.prevY + 0.5);
    var hue = (draw.deg * 18) & 255;

    if (trailCol !== col || trailRow !== row) {
      m.px(trailCol, trailRow, hue, 180, 72);
    }

    m.px(col, row, hue, 220, m.brightness);
  }

  if (!balls.length) {
    m.px(Math.floor(cx + 0.5), Math.floor(cy + 0.5), 20, 80, 100);
  }

  m.show();
}
