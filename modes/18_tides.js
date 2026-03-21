/**
 * @name Tides
 * @author Thawney
 * @hue 128
 * @sat 180
 * @param_label Pulse Rate
 * @description Ambient breathing driven by device orientation. Lay flat for slow tides,
 *              tilt upright for faster pulses. Tilt left/right drifts the hue.
 *              Shake for a flash.
 * @sound Pad / Drone
 */

var smoothZ      = 64.0;  // follows accelZ with a 3s lag
var smoothHueX   = 0.0;   // follows accelX with a 6s lag
var smoothHueY   = 0.0;   // follows accelY with a 6s lag
var phase        = 0.0;   // 0..1 breath cycle
var flashBright  = 0;
var lastMotionTd = 0;
var lastPhase    = 0.0;

function activate(m) {
  smoothZ     = m.accelZ;
  smoothHueX  = m.accelX;
  smoothHueY  = m.accelY;
  phase       = 0.0;
  lastPhase   = 0.0;
  flashBright = 0;
  lastMotionTd = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // Smooth orientation — changes feel gradual, not jittery
  smoothZ    += (m.accelZ - smoothZ)    * (m.dt / 3000.0);
  smoothHueX += (m.accelX - smoothHueX) * (m.dt / 6000.0);
  smoothHueY += (m.accelY - smoothHueY) * (m.dt / 6000.0);

  // Breath period: flat (+64) = slow ~4s cycle; vertical (~0) = faster ~1.5s cycle
  // density shifts it further: 0 = slowest, 255 = fastest
  var tilt01 = 1.0 - smoothZ / 64.0;
  if (tilt01 < 0.0) tilt01 = 0.0;
  if (tilt01 > 1.0) tilt01 = 1.0;
  var densityShift = Math.floor(m.density * 1000 / 255);
  var period = Math.floor(4000 - tilt01 * 2500 - densityShift);
  if (period < 400) period = 400;

  // Advance breath phase 0..1
  lastPhase = phase;
  phase += m.dt / period;
  if (phase >= 1.0) phase -= 1.0;

  // Fire a held note at the start of each breath cycle (phase rollover)
  if (phase < lastPhase) {
    var deg = Math.floor(6 + smoothHueX * 6 / 127);
    if (deg < 0) deg = 0;
    if (deg > 13) deg = 13;
    var vel = 45 + Math.floor(tilt01 * 45);
    m.note(deg, vel, period);
  }

  // Triangle wave: 0→1 (inhale) then 1→0 (exhale)
  var amp = (phase < 0.5) ? phase * 2.0 : (1.0 - phase) * 2.0;
  var br = Math.floor(amp * m.brightness);

  // Flash on shake — decays over ~500ms
  if (m.motion > 150 && lastMotionTd <= 150) {
    flashBright = m.brightness;
  }
  lastMotionTd = m.motion;
  if (flashBright > 0) {
    var decay = Math.floor((8 * m.dt + 8) / 16);
    if (decay < 1) decay = 1;
    flashBright -= decay;
    if (flashBright < 0) flashBright = 0;
  }

  var eff = br;
  if (flashBright > eff) eff = flashBright;

  // Hue from tilt — X shifts hue, Y adds a secondary push
  var h = (Math.floor(smoothHueX * 100 / 127) + Math.floor(smoothHueY * 40 / 127) + 256) & 255;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (eff > 0)
        m.px(c, r, h, 180, eff);
      else
        m.px(c, r, 0);
    }
  }

  m.show();
}
