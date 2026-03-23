/**
 * @name Snake
 * @author Thawney
 * @hue 100
 * @sat 200
 * @param_label Speed
 * @description Classic snake on a wrapped grid — edges connect, so no wall death. Tilt to steer. Eat the cross-shaped food to grow; each bite plays a note. Hit yourself to restart. Density controls speed.
 * @sound Pluck / Marimba
 */

var DX = [1, 0, -1,  0];
var DY = [0, 1,  0, -1];

var snakeX     = [];
var snakeY     = [];
var snakeLen   = 0;
var snakeDir   = 0;
var foodX      = 0;
var foodY      = 0;
var snakeMs    = 0;
var growing    = 0;
var isDead     = false;
var deadMs     = 0;
var foodPhase  = 0.0;
var snakeScore = 0;
var MAX_CATCHUP_STEPS = 6;

function snakeSpawnFood(m) {
  var tries = 150;
  while (tries-- > 0) {
    var fx = m.rnd(m.COLS);
    var fy = m.rnd(m.ROWS);
    var ok = true;
    for (var i = 0; i < snakeLen; i++) {
      if (snakeX[i] === fx && snakeY[i] === fy) { ok = false; break; }
    }
    if (ok) { foodX = fx; foodY = fy; return; }
  }
}

function activate(m) {
  snakeLen   = 3;
  snakeX     = []; snakeY = [];
  var sx = Math.floor(m.COLS / 2);
  var sy = Math.floor(m.ROWS / 2);
  for (var i = 0; i < snakeLen; i++) {
    snakeX[i] = (sx - i + m.COLS) % m.COLS;
    snakeY[i] = sy;
  }
  snakeDir   = 0;
  growing    = 0;
  isDead     = false;
  deadMs     = 0;
  snakeMs    = 0;
  snakeScore = 0;
  foodPhase  = 0.0;
  snakeSpawnFood(m);
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function update(m) {
  foodPhase += m.dt * 0.010;

  if (isDead) {
    deadMs -= m.dt;
    m.clear();
    if (Math.floor(deadMs / 100) % 2 === 0) {
      for (var i = 0; i < snakeLen; i++)
        m.px(snakeX[i], snakeY[i], Math.floor(m.brightness * 0.55));
    }
    m.show();
    if (deadMs <= 0) activate(m);
    return;
  }

  // Steer: dominant tilt axis, threshold=18
  var T  = 18;
  var ax = m.accelX, ay = m.accelY;
  var nd = snakeDir;
  if (Math.abs(ay) >= Math.abs(ax)) {
    if (ay >  T) nd = 0;
    if (ay < -T) nd = 2;
  } else {
    if (ax > T)  nd = 3;
    if (ax < -T) nd = 1;
  }
  if ((nd + 2) % 4 !== snakeDir) snakeDir = nd;

  var stepMs = Math.floor(320 - (m.density / 255.0) * 265);
  if (stepMs < 55) stepMs = 55;

  snakeMs += m.dt;
  var catchUps = 0;
  while (snakeMs >= stepMs && catchUps < MAX_CATCHUP_STEPS) {
    snakeMs -= stepMs;
    catchUps++;

    // New head — wrap edges
    var hx = (snakeX[0] + DX[snakeDir] + m.COLS) % m.COLS;
    var hy = (snakeY[0] + DY[snakeDir] + m.ROWS) % m.ROWS;

    // Self-collision (skip tail cell if not growing)
    var checkEnd = growing > 0 ? snakeLen : snakeLen - 1;
    var hit = false;
    for (var i = 0; i < checkEnd; i++) {
      if (snakeX[i] === hx && snakeY[i] === hy) { hit = true; break; }
    }
    if (hit) { isDead = true; deadMs = 650; m.note(0, 70, 300); break; }

    // Shift body
    for (var i = snakeLen - 1; i > 0; i--) {
      snakeX[i] = snakeX[i-1];
      snakeY[i] = snakeY[i-1];
    }
    snakeX[0] = hx; snakeY[0] = hy;

    if (growing > 0) {
      growing--;
      snakeLen++;
      snakeX[snakeLen-1] = snakeX[snakeLen-2];
      snakeY[snakeLen-1] = snakeY[snakeLen-2];
    }

    // Eat food?
    if (hx === foodX && hy === foodY) {
      var deg = m.colToDegree(hx);
      var vel = 64 + (snakeScore % 10) * 5 + m.rnd(18);
      if (vel > 120) vel = 120;
      m.note(deg, vel, Math.floor(m.beatMs * 0.5));
      growing += 2;
      snakeScore++;
      snakeSpawnFood(m);
    }
  }
  if (catchUps === MAX_CATCHUP_STEPS && snakeMs >= stepMs) snakeMs = stepMs - 1;

  // Draw
  m.clear();

  // Snake body: gradient tail
  for (var i = 0; i < snakeLen; i++) {
    var frac = 1.0 - (i / snakeLen) * 0.75;
    m.px(snakeX[i], snakeY[i], Math.floor(m.brightness * frac));
  }
  if (snakeLen > 0) m.px(snakeX[0], snakeY[0], m.brightness);

  // Food: cross shape at distinct high brightness (always brighter than snake body)
  var fb = Math.floor(m.brightness * (0.65 + 0.35 * Math.sin(foodPhase)));
  m.px(foodX, foodY, m.brightness);   // centre always full
  // Arms of the cross (dimmer so it reads as a + shape)
  var armBr = Math.floor(fb * 0.7);
  m.px((foodX + 1) % m.COLS, foodY, armBr);
  m.px((foodX - 1 + m.COLS) % m.COLS, foodY, armBr);
  m.px(foodX, (foodY + 1) % m.ROWS, armBr);
  m.px(foodX, (foodY - 1 + m.ROWS) % m.ROWS, armBr);

  m.show();
}
