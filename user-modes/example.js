/**
 * @name Example Pulse
 * @author Thawney But Example
 * @hue 24
 * @sat 220
 * @param_label Motion
 * @description Tempo-synced bouncing pulse. Motion controls step speed.
 * @sound Soft marimba
 */

var x = 0;
var y = 0;
var dir = 1;

function activate(m) {
  x = 0;
  y = Math.floor(m.ROWS / 2);
  dir = 1;
  m.clear();
  m.show();
}

function update(m) {
  // density=0 -> slower movement, density=255 -> faster movement
  var stepMs = Math.floor(m.map(m.density, 0, 255, m.beatMs * 0.9, m.beatMs * 0.2));
  if (stepMs < 28) stepMs = 28;

  if (m.tick(0, stepMs)) {
    x += dir;
    if (x >= m.COLS - 1) {
      x = m.COLS - 1;
      dir = -1;
      m.note(m.colToDegree(x), 98, Math.floor(m.beatMs * 0.35));
      y = (y + 1) % m.ROWS;
    } else if (x <= 0) {
      x = 0;
      dir = 1;
      m.note(m.colToDegree(x), 98, Math.floor(m.beatMs * 0.35));
      y = (y + m.ROWS - 1) % m.ROWS;
    }
  }

  m.fade(12);
  // Head with explicit HSV + a simple orange trail using @hue/@sat
  m.px(x, y, 24, 220, 255);
  if (x - dir >= 0 && x - dir < m.COLS) m.px(x - dir, y, 150);
  if (x - dir * 2 >= 0 && x - dir * 2 < m.COLS) m.px(x - dir * 2, y, 90);
  m.show();
}
