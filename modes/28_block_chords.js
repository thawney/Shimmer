/**
 * @name Block Chords
 * @author Thawney
 * @hue 28
 * @sat 170
 * @param_label Voicing
 * @description Slow Minecrafty chords using the global scale. Tempo controls timing; density changes voicing.
 * @sound Soft stacked chords
 */

var chordIdx = 0;
var glow = 0;
var drift = 0;

// All notes are scale degrees, so they follow the device's internal/global scale.
var progression = [
  [0, 2, 4],
  [5, 7, 9],
  [3, 5, 7],
  [4, 6, 8],
  [0, 2, 4],
  [7, 9, 11],
  [5, 7, 9],
  [4, 6, 8]
];

function activate(m) {
  chordIdx = 0;
  glow = 0;
  drift = 0;
  m.clear();
  m.show();
}

function playChord(m, chord, voicing, dur) {
  var root = chord[0];
  var third = chord[1];
  var fifth = chord[2];

  // density = voicing, not speed
  if (voicing === 0) {
    // close + low
    m.note(root, 70, dur);
    m.note(third + 2, 52, dur);
    m.note(fifth + 4, 42, dur);
  } else if (voicing === 1) {
    // open
    m.note(root, 70, dur);
    m.note(third + 7, 54, dur);
    m.note(fifth + 14, 46, dur);
  } else {
    // high, airy
    m.note(root + 7, 62, dur);
    m.note(third + 14, 50, dur);
    m.note(fifth + 21, 40, dur);
  }
}

function update(m) {
  var beatMs = Math.max(80, Math.min(4000, m.beatMs));

  // Much slower: one chord every 4 beats
  var chordMs = beatMs * 4;

  // Density now chooses voicing only
  var voicing = Math.min(2, Math.floor(m.density / 86));

  if (m.tick(0, chordMs)) {
    playChord(m, progression[chordIdx], voicing, Math.floor(chordMs * 0.9));
    chordIdx = (chordIdx + 1) % progression.length;
    glow = 255;
  }

  if (m.tick(1, Math.max(120, Math.floor(beatMs)))) {
    drift = (drift + 1) % 12;
  }

  glow -= 6;
  if (glow < 0) glow = 0;

  m.clear();

  for (var x = 0; x < m.COLS; x++) {
    for (var y = 0; y < m.ROWS; y++) {
      var dx = x - 5.5;
      var dy = y - 5.5;
      var dist = Math.sqrt(dx * dx + dy * dy);

      var base = 92 - dist * 10;
      var wave = ((x + drift) % 6) * 4 + ((y + drift) % 5) * 2;
      var pulse = glow * 0.18;
      var v = base + wave + pulse;

      if (v < 0) v = 0;
      if (v > m.brightness) v = m.brightness;

      var hue = 18 + ((x + y) % 5) * 3;
      var sat = 130 + (y % 3) * 18;

      m.px(x, y, hue, sat, Math.floor(v));
    }
  }

  m.show();
}