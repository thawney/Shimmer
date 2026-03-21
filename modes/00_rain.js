/**
 * @name Rain
 * @author Thawney
 * @hue 128
 * @sat 180
 * @param_label Drop Density
 * @description Columns of notes fall like rain. Density controls how many drops fall simultaneously.
 * @sound Kalimba / Bell
 */

// Grid state — brightness per cell
var grid = [];
var drops = [];      // {col, rowPos, degree}
var colWeight = [];  // weighted column selection map (built once from density)
var seedBuilt = false;
var spawnElapsed = 0;
var smoothWind = 0;  // slow-drift accelX → column bias (wind effect, ~12s lag)
var windBias   = 0;

function activate(m) {
  grid = [];
  for (var r = 0; r < m.ROWS; r++) {
    grid[r] = [];
    for (var c = 0; c < m.COLS; c++) grid[r][c] = 0;
  }
  drops = [];
  colWeight = [];
  seedBuilt    = false;
  spawnElapsed = 0;
  smoothWind   = 0;
  windBias     = 0;
  m.clear();
  m.show();
}

function update(m) {
  // Wind slowly drifts toward tilt over ~12 seconds — rain shifts left/right gradually
  smoothWind += (m.accelX - smoothWind) * (m.dt / 12000.0);
  windBias    = Math.floor(smoothWind / 16);  // ~-8..+7

  // Build column weight map once from density seed
  if (!seedBuilt) {
    var s = m.density;
    for (var c = 0; c < m.COLS; c++) {
      s = ((s * 167 + c * 37 + 13) & 0xFF);
      colWeight[c] = s ? s : 1;
    }
    seedBuilt = true;
  }

  // maxDrops: density=0 -> 1, density=255 -> 27 (COLS-1)
  var maxDrops = 1 + Math.floor((m.density * (m.COLS - 1)) / 255);

  // fallSpeed: C++ mid-speed (speed=128) = 1.5 + (128/255)*7.5 ≈ 5.25 rows/s
  var tempoScale = 500 / m.beatMs;
  var fallSpeed = 5.25 * tempoScale;

  var delta = fallSpeed * (m.dt / 1000);

  // Advance drops
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    d.rowPos += delta;

    if (d.rowPos >= m.ROWS - 1) {
      // Landing: fire note, record splash brightness
      m.note(d.degree, 65 + m.rnd(64), Math.floor(m.beatMs / 2));
      grid[m.ROWS - 1][d.col] = m.brightness;
      drops.splice(i, 1);
    } else {
      var row = Math.floor(d.rowPos);
      grid[row][d.col] = m.brightness;
      if (row > 0)
        grid[row - 1][d.col] = Math.floor(m.brightness * 40 / 100);
    }
  }

  // Spawn timer
  // spawnMs: density=0 -> 1500ms, density=255 -> 53ms (clamped min 80)
  var spawnMs = Math.floor(1500 / (1 + Math.floor(m.density * (m.COLS - 1) / 255)));
  spawnMs = Math.floor(spawnMs * m.beatMs / 500);  // tempo-scale vs 120bpm
  if (spawnMs < 80) spawnMs = 80;

  spawnElapsed += m.dt;
  while (spawnElapsed >= spawnMs) {
    spawnElapsed -= spawnMs;
    if (drops.length < maxDrops) {
      // Weighted column selection — windBias tilts the distribution left/right
      var total = 0;
      var mid = Math.floor(m.COLS / 2);
      for (var j = 0; j < m.COLS; j++) {
        var effW = colWeight[j] + (j - mid) * windBias;
        if (effW < 1) effW = 1;
        total += effW;
      }
      var target = Math.floor(m.rnd() * total / 256);
      var col = m.COLS - 1;
      var cum = 0;
      for (var k = 0; k < m.COLS; k++) {
        var ew = colWeight[k] + (k - mid) * windBias;
        if (ew < 1) ew = 1;
        cum += ew;
        if (cum > target) { col = k; break; }
      }
      var degree = Math.floor((col * 6) / (m.COLS - 1));
      drops.push({ col: col, rowPos: 0, degree: degree });
    }
  }

  // Fade grid
  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (grid[r][c] > fadeAmt) grid[r][c] -= fadeAmt;
      else grid[r][c] = 0;

      if (grid[r][c] > 0)
        m.px(c, r, grid[r][c]);
      else
        m.px(c, r, 0);
    }
  }

  // Overdraw active drops at full brightness
  for (var di = 0; di < drops.length; di++) {
    var dr = drops[di];
    var row = Math.floor(dr.rowPos);
    if (row < m.ROWS)
      m.px(dr.col, row, m.brightness);
  }

  m.show();
}
