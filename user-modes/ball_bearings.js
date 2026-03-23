/**
 * @name Ball Bearings
 * @author Tony Nacho
 * @hue 150
 * @sat 180
 * @param_label Bearings
 * @description Tilt rolls a tray of ball bearings around the grid. When left flat and still, they drift back to center. Knocks rattle them loose.
 * @sound Metallic Bell / Glass Pluck
 */

var MIN_BALLS = 3;
var MAX_BALLS = 9;
var BALL_R = 0.34;
var WALL_BOUNCE = 0.72;
var PAIR_BOUNCE = 0.84;
var GRAVITY = 0.0000011;
var CENTER_PULL = 0.0000014;
var SHAKE_THRESHOLD = 150;
var SHAKE_IMPULSE = 0.013;
var STILL_TILT_DEADZONE = 18.0;

var balls = [];
var ballCount = 0;
var smoothX = 0.0;
var smoothY = 0.0;
var lastMotion = 0;
var noteCooldown = 0;

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function abs(v) {
  return v < 0 ? -v : v;
}

function desiredBallCount(m) {
  return MIN_BALLS + Math.floor((m.density * (MAX_BALLS - MIN_BALLS)) / 255);
}

function seedRack(m, count) {
  var spacing = BALL_R * 2.35;
  var cols = Math.ceil(Math.sqrt(count));
  var rows = Math.ceil(count / cols);
  var startX = (m.COLS - 1) * 0.5 - ((cols - 1) * spacing) * 0.5;
  var startY = (m.ROWS - 1) * 0.5 - ((rows - 1) * spacing) * 0.5;

  balls = [];
  ballCount = count;

  for (var i = 0; i < count; i++) {
    var c = i % cols;
    var r = Math.floor(i / cols);
    var x = startX + c * spacing + (m.rnd(21) - 10) * 0.01;
    var y = startY + r * spacing + (m.rnd(21) - 10) * 0.01;
    balls[i] = {
      x: x,
      y: y,
      prevX: x,
      prevY: y,
      vx: 0.0,
      vy: 0.0
    };
  }
}

function activate(m) {
  smoothX = m.accelY;
  smoothY = -m.accelX;
  lastMotion = m.motion;
  noteCooldown = 0;
  seedRack(m, desiredBallCount(m));
  m.clear();
  m.show();
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

  var impulse = -(1.0 + PAIR_BOUNCE) * closing * 0.5;
  a.vx -= nx * impulse;
  a.vy -= ny * impulse;
  b.vx += nx * impulse;
  b.vy += ny * impulse;
}

function clampWalls(m, ball) {
  var hit = 0.0;

  if (ball.x < BALL_R) {
    ball.x = BALL_R;
    if (ball.vx < 0) {
      hit = -ball.vx;
      ball.vx = -ball.vx * WALL_BOUNCE;
    }
  } else if (ball.x > m.COLS - 1 - BALL_R) {
    ball.x = m.COLS - 1 - BALL_R;
    if (ball.vx > 0) {
      hit = ball.vx;
      ball.vx = -ball.vx * WALL_BOUNCE;
    }
  }

  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    if (ball.vy < 0) {
      if (-ball.vy > hit) hit = -ball.vy;
      ball.vy = -ball.vy * WALL_BOUNCE;
    }
  } else if (ball.y > m.ROWS - 1 - BALL_R) {
    ball.y = m.ROWS - 1 - BALL_R;
    if (ball.vy > 0) {
      if (ball.vy > hit) hit = ball.vy;
      ball.vy = -ball.vy * WALL_BOUNCE;
    }
  }

  return hit;
}

function update(m) {
  var targetCount = desiredBallCount(m);
  if (targetCount !== ballCount) seedRack(m, targetCount);

  smoothX += (m.accelY - smoothX) * (m.dt / 140.0);
  smoothY += (-m.accelX - smoothY) * (m.dt / 140.0);

  var tilt = 1.0 - m.accelZ / 64.0;
  tilt = clamp(tilt, 0.0, 1.0);
  var tiltMag = Math.sqrt(smoothX * smoothX + smoothY * smoothY);
  var flatness = clamp(m.accelZ / 64.0, 0.0, 1.0);
  var stillness = 1.0 - clamp((tiltMag - 8.0) / 20.0, 0.0, 1.0);
  var quiet = 1.0 - clamp((m.motion - 18.0) / 72.0, 0.0, 1.0);
  var centerPull = stillness * quiet * flatness;
  var centerX = Math.floor(m.COLS / 2);
  var centerY = Math.floor(m.ROWS / 2);

  var drag = 1.0 - (0.0019 - tilt * 0.0008) * m.dt;
  if (drag < 0.90) drag = 0.90;

  var maxSpeed = 0.032 + tilt * 0.02;
  var strongestHit = 0.0;
  var strongestCol = Math.floor((m.COLS - 1) * 0.5);

  if (noteCooldown > 0) noteCooldown -= m.dt;
  else noteCooldown = 0;

  if (m.motion > SHAKE_THRESHOLD && lastMotion <= SHAKE_THRESHOLD) {
    var kick = SHAKE_IMPULSE + (m.motion / 255.0) * 0.014;
    for (var k = 0; k < ballCount; k++) {
      var ang = (m.rnd(256) / 255.0) * 6.28318;
      balls[k].vx += Math.cos(ang) * kick;
      balls[k].vy += Math.sin(ang) * kick;
    }
    strongestHit = kick * 0.7;
  }
  lastMotion = m.motion;

  var gravityMix = clamp((tiltMag - STILL_TILT_DEADZONE) / 28.0, 0.0, 1.0);
  var gx = smoothX * GRAVITY * gravityMix;
  var gy = smoothY * GRAVITY * gravityMix;

  for (var i = 0; i < ballCount; i++) {
    var b = balls[i];
    b.prevX = b.x;
    b.prevY = b.y;

    b.vx += gx * m.dt;
    b.vy += gy * m.dt;
    b.vx += (centerX - b.x) * CENTER_PULL * centerPull * m.dt;
    b.vy += (centerY - b.y) * CENTER_PULL * centerPull * m.dt;
    b.vx *= drag;
    b.vy *= drag;

    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > maxSpeed && speed > 0.0) {
      var sc = maxSpeed / speed;
      b.vx *= sc;
      b.vy *= sc;
    }

    b.x += b.vx * m.dt;
    b.y += b.vy * m.dt;
  }

  for (var a = 0; a < ballCount; a++) {
    for (var j = a + 1; j < ballCount; j++) {
      collidePair(balls[a], balls[j]);
    }
  }

  for (var n = 0; n < ballCount; n++) {
    var hit = clampWalls(m, balls[n]);
    if (hit > strongestHit) {
      strongestHit = hit;
      strongestCol = Math.floor(balls[n].x + 0.5);
    }
  }

  if (strongestHit > 0.007 && noteCooldown <= 0) {
    var deg = m.colToDegree(clamp(strongestCol, 0, m.COLS - 1));
    var vel = 44 + Math.floor(strongestHit * 1900.0);
    if (vel > 118) vel = 118;
    m.note(deg, vel, Math.floor(m.beatMs * 0.28));
    noteCooldown = 70;
  }

  var fadeAmt = 22 - Math.floor(tilt * 6);
  if (fadeAmt < 10) fadeAmt = 10;
  m.fade(fadeAmt);

  for (var q = 0; q < ballCount; q++) {
    var ball = balls[q];
    var col = Math.floor(ball.x + 0.5);
    var row = Math.floor(ball.y + 0.5);
    var trailCol = Math.floor(ball.prevX + 0.5);
    var trailRow = Math.floor(ball.prevY + 0.5);
    var energy = abs(ball.vx) + abs(ball.vy);
    var trailBr = 24 + Math.floor(energy * 2600.0);
    if (trailBr > 112) trailBr = 112;

    if (trailCol !== col || trailRow !== row) {
      m.px(trailCol, trailRow, trailBr);
    }

    var rimBr = Math.floor(m.brightness * 0.38);
    m.px(col - 1, row, 180, 80, rimBr);
    m.px(col + 1, row, 180, 80, rimBr);
    m.px(col, row - 1, 180, 80, rimBr);
    m.px(col, row + 1, 180, 80, rimBr);
    m.px(col, row, 0, 0, m.brightness);
  }

  m.show();
}
