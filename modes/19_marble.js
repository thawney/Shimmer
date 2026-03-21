/**
 * @name Ember
 * @author Thawney
 * @hue 12
 * @sat 240
 * @param_label Spark Rate
 * @description Hot embers drift in the direction the device leans. When enough
 *              settle into a column they trigger a note. Shake to scatter.
 * @sound Pluck / Pizzicato
 */

var MAX_EMBERS = 20;
var embers     = [];
var spawnTimer = 0;
var lastMotionEm = 0;
var smoothX    = 0.0;
var smoothY    = 0.0;

function activate(m) {
  embers       = [];
  spawnTimer   = 0;
  lastMotionEm = 0;
  smoothX      = m.accelY;
  smoothY      = m.accelX;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // ~3s lag — embers respond to sustained lean, not instant flicks
  smoothX += (m.accelY - smoothX) * (m.dt / 3000.0);
  // Negate X so "tilt up" drifts embers toward row 0 (top of display)
  smoothY += (-m.accelX - smoothY) * (m.dt / 3000.0);

  // Horizontal drift from tilt; vertical from Y
  var driftX = smoothX * 0.0000030;
  var driftY = smoothY * 0.0000030;

  // Shake: scatter all embers
  if (m.motion > 160 && lastMotionEm <= 160) {
    for (var i = 0; i < embers.length; i++) {
      embers[i].vx = (m.rnd(255) - 127) * 0.000025;
      embers[i].vy = (m.rnd(255) - 127) * 0.000025;
      embers[i].age = 0;
    }
  }
  lastMotionEm = m.motion;

  // Spawn new embers
  // density=0 -> 2000ms interval, density=255 -> 200ms
  var spawnMs = 2000 - Math.floor((m.density * 1800) / 255);
  if (spawnMs < 200) spawnMs = 200;
  spawnTimer += m.dt;
  while (spawnTimer >= spawnMs && embers.length < MAX_EMBERS) {
    spawnTimer -= spawnMs;
    // Spawn row biased toward the Y low side
    var spawnRow = Math.floor(m.ROWS * 0.5 + (smoothY * m.ROWS * 0.3) / 80);
    if (spawnRow < 0)           spawnRow = 0;
    if (spawnRow > m.ROWS - 1) spawnRow = m.ROWS - 1;
    var maxAge = 2000 + m.rnd(1500);
    embers.push({
      x:      m.rnd(m.COLS),
      y:      spawnRow,
      vx:     0.0,
      vy:     0.0,
      age:    0,
      maxAge: maxAge
    });
  }

  // Count embers per column for note triggering
  var colCount = [];
  for (var c = 0; c < m.COLS; c++) colCount[c] = 0;

  m.clear();

  // Update and draw embers
  for (var i = embers.length - 1; i >= 0; i--) {
    var e = embers[i];
    e.vx += driftX * m.dt;
    e.vy += driftY * m.dt;
    e.x  += e.vx * m.dt;
    e.y  += e.vy * m.dt;
    e.age += m.dt;

    // Wrap horizontally; clamp vertically
    if (e.x < 0)           e.x += m.COLS;
    if (e.x >= m.COLS)     e.x -= m.COLS;
    if (e.y < 0)           { e.y = 0;          e.vy =  (e.vy < 0 ? -e.vy : e.vy) * 0.5; }
    if (e.y > m.ROWS - 1)  { e.y = m.ROWS - 1; e.vy = -(e.vy > 0 ? e.vy : -e.vy) * 0.5; }

    var col = Math.floor(e.x);
    var row = Math.floor(e.y);
    if (col < 0) col = 0;
    if (col > m.COLS - 1) col = m.COLS - 1;
    if (row < 0) row = 0;
    if (row > m.ROWS - 1) row = m.ROWS - 1;

    if (e.age >= e.maxAge) {
      // Ember expires — fire note from final column
      var deg = m.colToDegree(col);
      var vel = 40 + m.rnd(35);
      m.note(deg, vel, 300);
      embers.splice(i, 1);
      continue;
    }

    // Brightness fades as ember ages: bright when fresh, dim at end
    var life = 1.0 - e.age / e.maxAge;
    var br = Math.floor(life * m.brightness);
    if (br < 4) br = 4;
    m.px(col, row, br);
    colCount[col]++;
  }

  m.show();
}
