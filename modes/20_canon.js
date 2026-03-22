/**
 * @name Canon
 * @author Thawney
 * @hue 55
 * @sat 200
 * @param_label Phrase Length
 * @description A melody plays then echoes in 2-3 staggered voices like a musical round. The phrase shape is a constellation of dots — pitch=row, step=col. Voices sweep through it and light each note. Phrase mutates and restarts differently each cycle.
 * @sound Arp / Plucked String
 */

var CN_MAX  = 12;
var CN_OFF  = 4;

var cnPhrase    = [];
var cnLen       = 8;
var cnStep      = 0;
var cnElapsed   = 0;
var cnMut       = 0;
var cnReady     = false;
var cnFlash     = [];   // flat [COLS * ROWS]

function cnDegToRow(deg, ROWS) {
  return (ROWS - 1) - Math.floor(deg * (ROWS - 1) / 13);
}

function cnInit(m) {
  cnLen = 4 + Math.floor((m.density * (CN_MAX - 4)) / 255);
  if (cnLen > CN_MAX) cnLen = CN_MAX;

  // Vary starting position and step sizes each time for different sequences
  cnPhrase = [];
  var pos  = m.rnd(10);   // 0-9 starting degree
  for (var i = 0; i < CN_MAX; i++) {
    cnPhrase[i] = pos;
    // Mix of small steps and occasional larger ones
    var roll = m.rnd(6);
    var d = (roll < 3) ? (m.rnd(2) === 0 ? 1 : -1)
          : (roll < 5) ? (m.rnd(2) === 0 ? 2 : -2)
                       : 0;
    pos += d;
    if (pos < 0) pos = 0;
    if (pos > 13) pos = 13;
  }

  // Reset cnFlash
  cnFlash = [];
  for (var j = 0; j < 144; j++) cnFlash[j] = 0;

  cnStep   = 0;
  cnElapsed = 0;
  cnMut    = 0;
  cnReady  = true;
}

function activate(m) {
  cnReady = false;
  cnFlash = [];
  for (var j = 0; j < 144; j++) cnFlash[j] = 0;
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function update(m) {
  if (!cnReady) cnInit(m);

  // Update len from density (without re-initialising)
  var newLen = 4 + Math.floor((m.density * (CN_MAX - 4)) / 255);
  if (newLen > CN_MAX) newLen = CN_MAX;
  cnLen = newLen;

  var nv = (m.density < 128) ? 2 : 3;

  cnElapsed += m.dt;
  var steps = 0;
  while (cnElapsed >= m.beatMs && steps < 8) {
    cnElapsed -= m.beatMs;
    steps++;
    cnStep++;

    for (var v = 0; v < nv; v++) {
      var vs = cnStep - v * CN_OFF;
      if (vs <= 0) continue;
      var pp  = (vs - 1) % cnLen;
      var deg = cnPhrase[pp] + v * 2;
      if (deg > 13) deg = 13;

      var vel = 88 - v * 12 + m.rnd(16);
      if (vel < 35)  vel = 35;
      if (vel > 127) vel = 127;
      m.note(deg, vel, Math.floor(m.beatMs * 0.82));

      var col = Math.floor((pp * m.COLS) / cnLen);
      if (col >= m.COLS) col = m.COLS - 1;
      var row = cnDegToRow(deg, m.ROWS);
      if (row < 0) row = 0;
      if (row >= m.ROWS) row = m.ROWS - 1;
      var idx = row * m.COLS + col;
      if (idx >= 0 && idx < 144) {
        cnFlash[idx] = Math.floor(m.brightness * (1.0 - v * 0.2));
      }
    }

    // Mutate and re-randomise phrase every full cycle
    cnMut++;
    if (cnMut >= cnLen * 4) {
      cnMut = 0;
      // Mutate one step
      var idx2 = m.rnd(cnLen);
      cnPhrase[idx2] += (m.rnd(2) === 0) ? m.rnd(3) + 1 : -(m.rnd(3) + 1);
      if (cnPhrase[idx2] < 0) cnPhrase[idx2] = 0;
      if (cnPhrase[idx2] > 13) cnPhrase[idx2] = 13;
    }

    // Wrap cnStep to avoid unbounded growth
    if (cnStep > 10000) cnStep = cnStep % (cnLen * 4);
  }

  // Fade flashes
  var fd = Math.floor((3 * m.dt + 8) / 16);
  if (fd < 1) fd = 1;
  for (var j = 0; j < m.COLS * m.ROWS; j++) {
    if (cnFlash[j] > fd) cnFlash[j] -= fd; else cnFlash[j] = 0;
  }

  m.clear();

  // Phrase constellation: dim dots
  for (var step = 0; step < cnLen; step++) {
    var col = Math.floor((step * m.COLS) / cnLen);
    if (col >= m.COLS) col = m.COLS - 1;
    var row = cnDegToRow(cnPhrase[step], m.ROWS);
    if (row >= 0 && row < m.ROWS) m.px(col, row, Math.floor(m.brightness * 0.10));
  }

  // Connecting lines
  for (var step = 0; step + 1 < cnLen; step++) {
    var c0 = Math.floor((step * m.COLS) / cnLen);
    var c1 = Math.floor(((step + 1) * m.COLS) / cnLen);
    if (c1 > c0 + 1) {
      var r0 = cnDegToRow(cnPhrase[step], m.ROWS);
      var r1 = cnDegToRow(cnPhrase[step + 1], m.ROWS);
      for (var c = c0 + 1; c < c1 && c < m.COLS; c++) {
        var t = (c - c0) / (c1 - c0);
        var r = Math.round(r0 + t * (r1 - r0));
        if (r >= 0 && r < m.ROWS) m.px(c, r, Math.floor(m.brightness * 0.05));
      }
    }
  }

  // Active flashes
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var v2 = cnFlash[r * m.COLS + c];
      if (v2 > 0) m.px(c, r, v2);
    }
  }

  m.show();
}
