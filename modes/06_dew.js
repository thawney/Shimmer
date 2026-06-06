/**
 * @name Dew
 * @author Thawney
 * @hue 142
 * @sat 150
 * @param_label Surface Tension
 * @description Humidity forms a quiet film of beads that bloom in place. Surface Tension changes bead size, spacing, and how long the soft notes hang.
 * @sound Glass pad / muted bell
 */

var beads = [];
var humSmooth = 55.0;
var filmPhase = 0.0;
var MAX_BEADS = 16;

function safeDt(m) {
  var dt = m.dt;
  if (dt < 1) dt = 1;
  if (dt > 96) dt = 96;
  return dt;
}

function safeBeatMs(m) {
  var beatMs = m.beatMs;
  if (beatMs < 80) beatMs = 80;
  if (beatMs > 4000) beatMs = 4000;
  return beatMs;
}

function readHumidity(m) {
  var h = m.humidity;
  if (!(h >= 0 && h <= 100)) h = 55.0;
  return h;
}

function activate(m) {
  beads = [];
  humSmooth = readHumidity(m);
  filmPhase = m.rnd(256) / 64.0;
  for (var i = 0; i < MAX_BEADS; i++) {
    beads.push({
      c: m.rnd(m.COLS),
      r: m.rnd(m.ROWS),
      age: m.rnd(255) / 255.0,
      life: 4500 + m.rnd(8000),
      fired: false
    });
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function resetBead(m, i, wet, tension) {
  var gap = 1 + Math.floor(tension * 3);
  beads[i].c = (m.rnd(m.COLS) + i * gap) % m.COLS;
  beads[i].r = (m.rnd(m.ROWS) + Math.floor(i / 2)) % m.ROWS;
  beads[i].age = 0.0;
  beads[i].life = 3600 + Math.floor((1.0 - wet) * 5000) + Math.floor(tension * 6500) + m.rnd(3000);
  beads[i].fired = false;
}

function update(m) {
  var dt = safeDt(m);
  var beatMs = safeBeatMs(m);

  humSmooth += (readHumidity(m) - humSmooth) * (dt / 13000.0);
  var wet = humSmooth / 100.0;
  if (wet < 0) wet = 0;
  if (wet > 1) wet = 1;
  var tension = m.density / 255.0;

  filmPhase += dt * (0.00016 + wet * 0.00032);

  var activeCount = 4 + Math.floor(wet * 8) + Math.floor((1.0 - tension) * 4);
  if (activeCount > MAX_BEADS) activeCount = MAX_BEADS;

  m.clear();

  var film = Math.floor(m.brightness * (0.04 + wet * 0.16));
  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var wave = Math.sin(filmPhase + c * 0.36 + r * 0.21);
      var v = film + Math.floor(wave * wet * 10);
      if (v < 0) v = 0;
      if (v > m.brightness) v = m.brightness;
      m.px(c, r, v);
    }
  }

  for (var i = 0; i < activeCount; i++) {
    var b = beads[i];
    b.age += dt / b.life;
    if (b.age >= 1.0) resetBead(m, i, wet, tension);

    var amp = b.age < 0.5 ? b.age * 2.0 : (1.0 - b.age) * 2.0;
    if (amp > 0.68 && !b.fired) {
      var deg = m.colToDegree(b.c);
      var vel = 26 + Math.floor(wet * 36) + Math.floor(tension * 24) + m.rnd(12);
      m.note(deg, vel, Math.floor(beatMs * (0.8 + tension * 1.8)));
      if (tension > 0.62) m.note(deg + 4, Math.floor(vel * 0.45), Math.floor(beatMs * 1.2));
      b.fired = true;
    }

    var radius = 0 + Math.floor(tension * 2.6);
    var peak = Math.floor(m.brightness * (0.30 + wet * 0.46) * amp);
    for (var rr = b.r - radius; rr <= b.r + radius; rr++) {
      for (var cc = b.c - radius; cc <= b.c + radius; cc++) {
        if (rr < 0 || rr >= m.ROWS || cc < 0 || cc >= m.COLS) continue;
        var d = Math.abs(rr - b.r) + Math.abs(cc - b.c);
        var br = peak - d * 34;
        if (br > 0) m.px(cc, rr, br);
      }
    }
  }

  m.show();
}
