/**
 * @name All On
 * @author Robin
 * @hue 0
 * @sat 0
 * @param_label Brightness
 * @description All LEDs at full brightness.
 * @sound None
 */

function activate(m) {
  m.clear();
  m.show();
}

function update(m) {
  for (var col = 0; col < m.COLS; col++) {
    for (var row = 0; row < m.ROWS; row++) {
      m.px(col, row, 255);
    }
  }
  m.show();
}
