/**
 * @name Veil
 * @author Thawney
 * @hue 160
 * @sat 155
 * @param_label Drift Rate
 * @description A soft haze pools at the low edge, breathing in and out.
 *              Tilt draws it slowly across the grid. Each full breath fires a
 *              held tone from wherever the haze has settled.
 * @sound Pad / Choir
 */

var smoothX   = 0.0;
var smoothZ   = 64.0;
var phase     = 0.0;
var lastPhase = 0.0;
var centreCol = 0.0;

function activate(m) {
  smoothX   = m.accelY;
  smoothZ   = m.accelZ;
  phase     = 0.0;
  lastPhase = 0.0;
  centreCol = m.map(m.accelY, -80, 80, 0, m.COLS - 1);
  if (centreCol < 0)           centreCol = 0;
  if (centreCol > m.COLS - 1) centreCol = m.COLS - 1;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // ~12s lag — haze drifts very slowly toward the low side
  // density scales the lag: 0 -> 18s, 255 -> 6s
  var lag = 18000 - Math.floor((m.density * 12000) / 255);
  if (lag < 6000) lag = 6000;
  smoothX += (m.accelY - smoothX) * (m.dt / lag);

  // accelZ: flat (+64) = slow breath, tilted toward 0 = faster
  smoothZ += (m.accelZ - smoothZ) * (m.dt / 5000.0);
  var tilt01 = 1.0 - smoothZ / 64.0;
  if (tilt01 < 0.0) tilt01 = 0.0;
  if (tilt01 > 1.0) tilt01 = 1.0;
  var period = Math.floor(5000 - tilt01 * 3200);
  if (period < 1800) period = 1800;

  // Advance breath phase 0..1
  lastPhase = phase;
  phase += m.dt / period;
  if (phase >= 1.0) phase -= 1.0;

  // Update haze centroid from tilt
  centreCol = m.map(smoothX, -80, 80, 0, m.COLS - 1);
  if (centreCol < 0)           centreCol = 0;
  if (centreCol > m.COLS - 1) centreCol = m.COLS - 1;

  // Fire a held note when the breath cycle rolls over
  if (phase < lastPhase) {
    var deg = m.colToDegree(Math.floor(centreCol + 0.5));
    var vel = 45 + Math.floor(tilt01 * 40) + Math.floor((m.density * 20) / 255);
    if (vel > 120) vel = 120;
    m.note(deg, vel, period);
  }

  // Triangle wave breath: 0->1 (inhale) then 1->0 (exhale)
  var amp = (phase < 0.5) ? phase * 2.0 : (1.0 - phase) * 2.0;
  var maxBr = Math.floor(amp * m.brightness);

  // accelZ: wider haze when flat, narrower when sharply tilted
  var absTilt01 = tilt01 < 0.5 ? tilt01 * 2.0 : 1.0;
  var sigma = Math.floor(2 + (1.0 - absTilt01) * 4 + (m.density / 64));
  if (sigma < 2)  sigma = 2;
  if (sigma > 10) sigma = 10;

  // Draw haze: linear falloff from centreCol, scaled by breath amplitude
  for (var c = 0; c < m.COLS; c++) {
    var dist = c - centreCol;
    if (dist < 0) dist = -dist;
    var br = maxBr - Math.floor(dist * maxBr / sigma);
    if (br < 0) br = 0;
    for (var r = 0; r < m.ROWS; r++) {
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}
