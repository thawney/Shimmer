/**
 * @name Rain
 * @author Thawney
 * @hue 128
 * @sat 180
 * @param_label Drop Density
 * @description Drops fall from top to bottom. Tilt the device to add wind — each drop drifts sideways as it falls and the note it plays depends on where it lands. MIDI IN notes spawn targeted drops at the pitch column.
 * @midi_in true
 * @sound Kalimba / Bell
 */

var MAX_DROPS    = 24;
var drops        = [];   // {x, y} — both floats; x wraps horizontally
var grid         = [];   // persistent brightness for fade trails
var smoothWind   = 0.0;
var spawnElapsed = 0;

function activate(m) {
  drops        = [];
  spawnElapsed = 0;
  smoothWind   = m.accelY;
  grid         = [];
  for (var r = 0; r < m.ROWS; r++) {
    grid[r] = [];
    for (var c = 0; c < m.COLS; c++) grid[r][c] = 0;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // Wind: 3s lag — noticeably responds to tilt within a few seconds
  smoothWind += (m.accelY - smoothWind) * (m.dt / 3000.0);
  // At full tilt (~80), drops drift ~5 columns over a full fall
  var wind = smoothWind * 0.000030;  // columns per millisecond

  // Fall speed scales with tempo
  var tempoScale = 500.0 / m.beatMs;
  var fallSpeed  = 5.25 * tempoScale;  // rows per second
  var dy         = fallSpeed * m.dt / 1000.0;

  // Spawn new drops
  // spawnMs: density=0 -> ~1500ms, density=255 -> ~80ms
  var spawnMs = Math.floor(1500 / (1 + Math.floor((m.density * (m.COLS - 1)) / 255)));
  spawnMs = Math.floor(spawnMs * m.beatMs / 500);
  if (spawnMs < 80) spawnMs = 80;

  spawnElapsed += m.dt;
  while (spawnElapsed >= spawnMs && drops.length < MAX_DROPS) {
    spawnElapsed -= spawnMs;
    drops.push({ x: m.rnd(m.COLS), y: 0.0 });
  }

  // MIDI IN: NoteOn spawns a targeted drop at the pitch-mapped column
  if (m.midiType === 1 && drops.length < MAX_DROPS) {
    drops.push({ x: Math.floor(m.midiNote * m.COLS / 128) + 0.5, y: 0.0 });
  }

  // Fade persistent grid (trails and landing splashes)
  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (grid[r][c] > fadeAmt) grid[r][c] -= fadeAmt;
      else grid[r][c] = 0;
    }
  }

  // Update drops and stamp into grid
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    d.x += wind * m.dt;
    d.y += dy;

    // Wrap horizontally
    if (d.x < 0)       d.x += m.COLS;
    if (d.x >= m.COLS) d.x -= m.COLS;

    var col = Math.floor(d.x);
    if (col < 0)           col = 0;
    if (col > m.COLS - 1) col = m.COLS - 1;

    if (d.y >= m.ROWS - 1) {
      // Landed — note pitch comes from landing column, so tilt changes the melody
      var deg = Math.floor((col * 6) / (m.COLS - 1));
      m.note(deg, 65 + m.rnd(64), Math.floor(m.beatMs / 2));
      grid[m.ROWS - 1][col] = m.brightness;
      drops.splice(i, 1);
      continue;
    }

    var row = Math.floor(d.y);
    if (row < 0)           row = 0;
    if (row > m.ROWS - 1) row = m.ROWS - 1;

    // Head at full brightness; short trail one row above
    grid[row][col] = m.brightness;
    if (row > 0) {
      var trail = Math.floor(m.brightness * 40 / 100);
      if (trail > grid[row - 1][col]) grid[row - 1][col] = trail;
    }
  }

  // Render
  for (var r = 0; r < m.ROWS; r++)
    for (var c = 0; c < m.COLS; c++)
      m.px(c, r, grid[r][c]);

  m.show();
}
