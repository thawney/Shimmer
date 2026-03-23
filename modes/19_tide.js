/**
 * @name Tide
 * @author Thawney
 * @hue 200
 * @sat 200
 * @param_label Choppiness
 * @description Water fills the grid. Tilt tips the surface like a tank — left tilts the water left, right tilts it right. Density adds choppiness: waves appear on the surface and notes fire as crests move across columns.
 * @sound Rhodes / Pad
 */

var sloshAngle  = 0.0;   // current surface tilt (radians; + = right side up)
var sloshVel    = 0.0;   // rate of change
var wavePhase   = 0.0;   // travelling wave phase
var prevLevel   = [];    // waterline row per column last frame

// Natural sloshing frequency ω² = g/L; for aesthetic period ~ 2s
var OMEGA_SQ = 0.0000025;   // per ms² (period ≈ 2.5s)
var DAMP     = 0.0008;

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
  sloshAngle = 0.0;
  sloshVel   = 0.0;
  wavePhase  = 0.0;
  prevLevel  = [];
  for (var c = 0; c < m.COLS; c++) prevLevel[c] = Math.floor(m.ROWS / 2);
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function update(m) {
  var dt = safeDt(m);
  var beatMs = safeBeatMs(m);
  // Physics: tilt acts as a driving force on the slosh angle
  var targetSlosh = m.accelY * (0.015);   // accelY ≈ ±80 → ±1.2 rad of slope
  sloshVel   += (-OMEGA_SQ * (sloshAngle - targetSlosh) - DAMP * sloshVel) * dt;
  sloshAngle += sloshVel * dt;

  // Travelling wave on surface: speed and amplitude from density
  var waveAmp   = (m.density / 255.0) * 1.8;   // rows of wave height
  var waveSpeed = 0.002 + (m.density / 255.0) * 0.004;   // rad/ms
  wavePhase    += waveSpeed * dt;

  var centre = (m.COLS - 1) / 2.0;
  var midRow = (m.ROWS - 1) / 2.0;

  // Compute waterline row per column:
  // Positive sloshAngle → right side higher (lower row index)
  // slope: how many rows per column
  var slope = sloshAngle * (m.ROWS / m.COLS);

  m.clear();

  for (var c = 0; c < m.COLS; c++) {
    var surfY = midRow
              - slope * (c - centre)
              - waveAmp * Math.sin(wavePhase + (c / m.COLS) * 6.28318);
    var surfRow = Math.round(surfY);
    if (surfRow < 0)       surfRow = 0;
    if (surfRow > m.ROWS)  surfRow = m.ROWS;   // off bottom = fully submerged

    // Note when surface rises to cover a new row
    if (surfRow < prevLevel[c]) {
      // Newly submerged — surface came up in this column
      var deg = m.colToDegree(c);
      var vel = 40 + Math.floor(waveAmp * 25) + m.rnd(22);
      if (vel > 110) vel = 110;
      m.note(deg, vel, Math.floor(beatMs * 1.2));
    }
    prevLevel[c] = surfRow;

    // Draw: fill from surfRow downward (water below surface)
    for (var r = 0; r < m.ROWS; r++) {
      if (r < surfRow) {
        // Above water — empty
      } else if (r === surfRow) {
        // Surface row — bright
        m.px(c, r, m.brightness);
      } else {
        // Submerged — dim, deeper = dimmer
        var depth = r - surfRow;
        var dimmed = Math.floor(m.brightness * (0.55 - depth * 0.12));
        if (dimmed < 8) dimmed = 8;
        m.px(c, r, dimmed);
      }
    }
  }

  m.show();
}
