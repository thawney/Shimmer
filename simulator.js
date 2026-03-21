/**
 * Shimmer Simulator
 * Browser-side runtime that mimics the device's Duktape JS environment.
 * Renders scripts on a canvas LED grid and outputs via WebMIDI.
 *
 * © 2026 Thawney LTD — CC BY-NC-SA 4.0
 *
 * Depends on: CodeMirror 5 (loaded via <script> tag in simulator.html)
 */
'use strict';

// ── Constants (must match firmware defaults) ───────────────────────────────────

var COLS = 12;
var ROWS = 12;

var ALL_MODES = [
  { name: 'Rain',    file: '00_rain.js'    },
  { name: 'Euclid',  file: '01_euclid.js'  },
  { name: 'Breath',  file: '02_breath.js'  },
  { name: 'Stasis',  file: '03_stasis.js'  },
  { name: 'Drift',   file: '04_drift.js'   },
  { name: 'Spark',   file: '05_spark.js'   },
  { name: 'Cascade', file: '06_cascade.js' },
  { name: 'Shift',   file: '07_shift.js'   },
  { name: 'Cells',   file: '08_cells.js'   },
  { name: 'Loop',    file: '09_loop.js'    },
  { name: 'Weave',   file: '10_weave.js'   },
  { name: 'Flock',   file: '11_flock.js'   },
  { name: 'Scatter', file: '12_scatter.js' },
  { name: 'Walk',    file: '13_walk.js'    },
  { name: 'Pulse',   file: '14_pulse.js'   },
  { name: 'Suspend',  file: '15_suspend.js' },
  { name: 'Tilt',     file: '16_tilt.js'    },
  { name: 'Pendulum', file: '17_pendulum.js' },
  { name: 'Tides',    file: '18_tides.js'   },
  { name: 'Marble',   file: '19_marble.js'  },
  { name: 'Level',    file: '20_level.js'   },
];

var NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Scale interval bitmasks — bit N = semitone N is in scale, bit 0 = root.
// Matches MidiEngine::SCALES[] in firmware exactly.
var SCALES = [
  0b101011010101, // 0 Major
  0b101101011010, // 1 Minor
  0b101101010110, // 2 Dorian
  0b100010100101, // 3 Pentatonic (major)
  0b111111111111, // 4 Chromatic
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseScriptMeta(code) {
  function get(tag) {
    var m = code.match(new RegExp('@' + tag + '\\s+(.+)'));
    return m ? m[1].trim() : null;
  }
  var hueStr = get('hue');
  var satStr = get('sat');
  return {
    name:       get('name')        || 'Script',
    author:     get('author')      || '',
    paramLabel: get('param_label') || 'Amount',
    desc:       get('description') || '',
    hue:        hueStr != null ? parseInt(hueStr, 10) : 0,
    sat:        satStr != null ? parseInt(satStr, 10) : 255,
  };
}

// FastLED-compatible HSV→RGB. All inputs and outputs 0–255.
function hsvToRgb(h, s, v) {
  if (v === 0) return [0, 0, 0];
  if (s === 0) { var c = v & 0xFF; return [c, c, c]; }
  h = h & 0xFF; s = s & 0xFF; v = v & 0xFF;
  var region    = (h / 43) | 0;
  var remainder = (h - region * 43) * 6;
  var p = (v * (255 - s)) >> 8;
  var q = (v * (255 - ((s * remainder) >> 8))) >> 8;
  var t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8;
  switch (region) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// Matches MidiEngine::degreeToMidi() with default octave=4.
function degreeToMidi(degree, rootNote, scaleId, octave) {
  if (octave === undefined) octave = 4;
  var mask = SCALES[scaleId] != null ? SCALES[scaleId] : SCALES[3];
  var tones = 0;
  for (var i = 0; i < 12; i++) if (mask & (1 << i)) tones++;
  if (tones === 0) tones = 1;

  var octaveShift = (degree / tones) | 0;
  var wrapped     = degree % tones;

  var semitone = 0, count = 0;
  for (var s = 0; s < 12; s++) {
    if (mask & (1 << s)) {
      if (count === wrapped) { semitone = s; break; }
      count++;
    }
  }

  var midi = (octave * 12) + (rootNote % 12) + semitone + (octaveShift * 12);
  return Math.max(0, Math.min(127, midi));
}

// ── Pixel buffer & canvas renderer ────────────────────────────────────────────

var canvas = document.getElementById('grid-canvas');
var ctx2d  = canvas.getContext('2d');

// [row][col] = { h, s, v }  (0–255 each)
var pixelBuf = [];
for (var _r = 0; _r < ROWS; _r++) {
  pixelBuf[_r] = [];
  for (var _c = 0; _c < COLS; _c++) pixelBuf[_r][_c] = { h: 0, s: 0, v: 0 };
}

function clearPixelBuf() {
  for (var r = 0; r < ROWS; r++)
    for (var c = 0; c < COLS; c++)
      pixelBuf[r][c] = { h: 0, s: 0, v: 0 };
}

function drawGrid() {
  var W  = canvas.width;
  var H  = canvas.height;
  var cw = W / COLS;
  var ch = H / ROWS;
  var rad = Math.min(cw, ch) * 0.38;

  ctx2d.fillStyle = '#080808';
  ctx2d.fillRect(0, 0, W, H);

  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var px = pixelBuf[row][col];
      var cx = (col + 0.5) * cw;
      var cy = (row + 0.5) * ch;

      // Always draw a dim "off" dot so the grid shape is visible
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx2d.fillStyle = '#1c1c1c';
      ctx2d.fill();

      if (px.v > 0) {
        var rgb = hsvToRgb(px.h, px.s, px.v);
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx2d.fillStyle   = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        ctx2d.shadowColor = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        ctx2d.shadowBlur  = rad * 1.8;
        ctx2d.fill();
        ctx2d.shadowBlur = 0;
      }
    }
  }
}

// Keep internal canvas resolution in sync with its CSS display size.
if (window.ResizeObserver) {
  new ResizeObserver(function() {
    var rect = canvas.getBoundingClientRect();
    var dpr  = window.devicePixelRatio || 1;
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    drawGrid();
  }).observe(canvas);
}

// ── Shared state ───────────────────────────────────────────────────────────────

var settings = {
  scale:       3,   // 0=Major 1=Minor 2=Dorian 3=Pentatonic 4=Chromatic
  rootNote:    0,   // 0-11 pitch class (C=0)
  tempo:       120, // BPM
  brightness:  200, // 0-255
  density:     128, // 0-255 (the per-script "amount" parameter)
  midiChannel: 0,   // 0-based, 0=ch1
};

// Script @hue / @sat — updated on each script load
var meta = { hue: 0, sat: 255 };

// Current WebMIDI output port (null = visual only)
var midiOut = null;

// Frame delta in ms for m.dt (updated each rAF tick)
var _dt = 16;

// ── m object factory ───────────────────────────────────────────────────────────

function makeM() {
  var ticks = {};

  return {
    get COLS()       { return COLS; },
    get ROWS()       { return ROWS; },
    get dt()         { return _dt; },
    get beatMs()     { return 60000 / settings.tempo; },
    get density()    { return settings.density; },
    get brightness() { return settings.brightness; },

    // Sensor stubs — static defaults so sensor-aware scripts run without errors.
    // On real hardware these are updated every frame from the LIS3DH / AHT20.
    accelX:   0,
    accelY:   0,
    accelZ:   64,   // ~+64 = 1g pointing down when device is flat/upright
    motion:   0,
    temp:     22.0,
    humidity: 55.0,

    // m.px(col, row, brightness)       — uses @hue/@sat defaults
    // m.px(col, row, hue, sat, val)    — explicit HSV
    px: function(col, row) {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      var extra = Array.prototype.slice.call(arguments, 2);
      if (extra.length === 1) {
        var v = Math.max(0, Math.min(255, extra[0] | 0));
        pixelBuf[row][col] = { h: meta.hue, s: meta.sat, v: v };
      } else if (extra.length >= 3) {
        pixelBuf[row][col] = {
          h: (extra[0] | 0) & 0xFF,
          s: (extra[1] | 0) & 0xFF,
          v: Math.max(0, Math.min(255, extra[2] | 0)),
        };
      }
    },

    fade: function(amount) {
      if (amount === undefined) amount = 3;
      for (var r = 0; r < ROWS; r++)
        for (var c = 0; c < COLS; c++) {
          var p = pixelBuf[r][c];
          pixelBuf[r][c] = { h: p.h, s: p.s, v: Math.max(0, p.v - (amount | 0)) };
        }
    },

    clear: function() { clearPixelBuf(); },
    show:  function() { drawGrid(); },

    note: function(degree, velocity, durationMs) {
      if (velocity  === undefined) velocity  = 80;
      if (durationMs == null)      durationMs = this.beatMs;
      var note = degreeToMidi(degree | 0, settings.rootNote, settings.scale);
      var ch   = settings.midiChannel & 0x0F;
      if (midiOut) {
        midiOut.send([0x90 | ch, note, (velocity | 0) & 0x7F]);
        var out = midiOut;
        setTimeout(function() { out.send([0x80 | ch, note, 0]); }, durationMs);
      }
    },

    allOff: function() {
      if (!midiOut) return;
      midiOut.send([0xB0 | (settings.midiChannel & 0x0F), 123, 0]);
    },

    tick: function(id, intervalMs) {
      var now = performance.now();
      if (ticks[id] === undefined) { ticks[id] = now; return true; }
      if (now - ticks[id] >= intervalMs) { ticks[id] = now; return true; }
      return false;
    },

    // m.rnd()      → integer 0–255
    // m.rnd(max)   → integer 0..max-1
    rnd: function(max) {
      return max === undefined
        ? (Math.random() * 256) | 0
        : (Math.random() * max)  | 0;
    },

    // Integer truncation — matches firmware ScriptedModeRunner.cpp
    degreeToCol: function(degree) { return ((degree * (COLS - 1)) / 6) | 0; },
    colToDegree: function(col)    { return ((col * 6) / (COLS - 1)) | 0; },

    map: function(v, inLo, inHi, outLo, outHi) {
      return outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo);
    },
  };
}

// ── Animation loop ─────────────────────────────────────────────────────────────

var _rafId    = null;
var _lastTs   = null;
var _curM     = null;
var _handlers = null;

function startLoop(m, handlers) {
  stopLoop(false);
  _curM     = m;
  _handlers = handlers;
  _lastTs   = null;
  setStatus('Running', 'running');
  _rafId = requestAnimationFrame(_tick);
}

function stopLoop(clearGrid) {
  if (clearGrid === undefined) clearGrid = true;
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }

  var m        = _curM;
  var handlers = _handlers;
  _curM     = null;
  _handlers = null;
  _lastTs   = null;

  if (m && handlers && handlers.deactivate) {
    try { handlers.deactivate(m); } catch (e) {}
  }
  if (m) try { m.allOff(); } catch (e) {}

  if (clearGrid) { clearPixelBuf(); drawGrid(); }
}

function _tick(ts) {
  if (_lastTs !== null) _dt = ts - _lastTs;
  _lastTs = ts;

  try {
    _handlers.update(_curM);
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    _handlers = null;
    stopLoop(false);
    return;
  }

  _rafId = requestAnimationFrame(_tick);
}

// ── Script parsing & execution ─────────────────────────────────────────────────

function parseHandlers(code) {
  // Wrap in a function scope so var declarations are isolated per run.
  // eslint-disable-next-line no-new-func
  var factory = new Function(
    code + '\n' +
    'return {\n' +
    '  activate:   typeof activate   !== "undefined" ? activate   : null,\n' +
    '  update:     typeof update     !== "undefined" ? update     : null,\n' +
    '  deactivate: typeof deactivate !== "undefined" ? deactivate : null,\n' +
    '};\n'
  );
  return factory();
}

function runCurrentScript() {
  var code = editor.getValue().trim();
  if (!code) { setStatus('Editor is empty', 'error'); return; }

  var newMeta = parseScriptMeta(code);
  meta.hue = newMeta.hue;
  meta.sat = newMeta.sat;
  document.getElementById('sim-param-label').textContent = newMeta.paramLabel;

  var handlers;
  try {
    handlers = parseHandlers(code);
  } catch (err) {
    setStatus('Parse error: ' + err.message, 'error');
    return;
  }

  if (!handlers.update) {
    setStatus('Script must export an update(m) function', 'error');
    return;
  }

  clearPixelBuf();
  var m = makeM();

  if (handlers.activate) {
    try {
      handlers.activate(m);
    } catch (err) {
      setStatus('activate() error: ' + err.message, 'error');
      return;
    }
  }

  startLoop(m, handlers);
}

// ── WebMIDI ────────────────────────────────────────────────────────────────────

var selMidiEl   = document.getElementById('sim-midi-port');
var _midiAccess = null;

function initMidi() {
  if (!navigator.requestMIDIAccess) {
    selMidiEl.innerHTML = '<option value="">WebMIDI not supported in this browser</option>';
    return;
  }
  navigator.requestMIDIAccess({ sysex: false }).then(function(access) {
    _midiAccess = access;
    populateMidiPorts();
    access.onstatechange = populateMidiPorts;
  }).catch(function() {
    selMidiEl.innerHTML = '<option value="">MIDI access denied</option>';
  });
}

function populateMidiPorts() {
  var prev = selMidiEl.value;
  selMidiEl.innerHTML = '<option value="">-- none (visual only) --</option>';
  _midiAccess.outputs.forEach(function(port, id) {
    var opt = document.createElement('option');
    opt.value = id;
    opt.textContent = port.name;
    selMidiEl.appendChild(opt);
  });
  if (prev && selMidiEl.querySelector('option[value="' + prev + '"]')) {
    selMidiEl.value = prev;
  }
  updateMidiOut();
}

function updateMidiOut() {
  var id = selMidiEl.value;
  midiOut = (id && _midiAccess) ? (_midiAccess.outputs.get(id) || null) : null;
}

selMidiEl.addEventListener('change', updateMidiOut);

// ── CodeMirror 5 editor ────────────────────────────────────────────────────────

var editor = CodeMirror(document.getElementById('editor-container'), {
  value:          '',
  mode:           'javascript',
  theme:          'shimmer',
  lineNumbers:    true,
  tabSize:        2,
  indentWithTabs: false,
  lineWrapping:   false,
  autofocus:      false,
});

// ── Populate UI dropdowns ──────────────────────────────────────────────────────

var selModeEl = document.getElementById('sim-mode-select');

function buildModeDropdown(userModes) {
  // Built-in modes
  var builtinGroup = document.createElement('optgroup');
  builtinGroup.label = 'Built-in';
  ALL_MODES.forEach(function(m) {
    var opt = document.createElement('option');
    opt.value = 'modes/' + m.file;
    opt.textContent = m.name;
    builtinGroup.appendChild(opt);
  });
  selModeEl.appendChild(builtinGroup);

  // Community/user modes (if any discovered from GitHub)
  if (userModes && userModes.length) {
    var userGroup = document.createElement('optgroup');
    userGroup.label = '⚠ Community (not by Thawney — use at own risk)';
    userModes.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = 'user-modes/' + m.file;
      opt.textContent = m.name + (m.author ? ' — ' + m.author : '');
      userGroup.appendChild(opt);
    });
    selModeEl.appendChild(userGroup);
  }
}

// Discover user modes from GitHub API (same as app.js), then build dropdown.
// Silently skips if network is unavailable.
(function() {
  var GITHUB_REPO = 'thawney/shimmer';
  fetch(
    'https://api.github.com/repos/' + GITHUB_REPO + '/contents/user-modes',
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  ).then(function(res) {
    return res.ok ? res.json() : [];
  }).then(function(files) {
    var userModes = Array.isArray(files)
      ? files
          .filter(function(f) { return f.type === 'file' && f.name.endsWith('.js'); })
          .map(function(f) {
            return {
              name: f.name.replace(/\.js$/, '').replace(/[_-]/g, ' ')
                          .replace(/\b\w/g, function(c) { return c.toUpperCase(); }),
              file: f.name,
            };
          })
      : [];
    buildModeDropdown(userModes);
  }).catch(function() {
    buildModeDropdown([]);
  });
}());

var selRootEl = document.getElementById('sim-root');
NOTE_NAMES.forEach(function(name, i) {
  var opt = document.createElement('option');
  opt.value = i;
  opt.textContent = name;
  selRootEl.appendChild(opt);
});

var selChanEl = document.getElementById('sim-channel');
for (var ch = 0; ch < 16; ch++) {
  var opt = document.createElement('option');
  opt.value = ch;
  opt.textContent = ch + 1;
  selChanEl.appendChild(opt);
}

// ── UI event wiring ────────────────────────────────────────────────────────────

selModeEl.addEventListener('change', function() {
  var file = selModeEl.value;
  if (!file) return;

  fetch(file).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(function(code) {
    editor.setValue(code);
    runCurrentScript();
  }).catch(function() {
    setStatus('Script loading needs a web server — run: python3 -m http.server', 'error');
    selModeEl.value = '';
  });
});

document.getElementById('btn-run').addEventListener('click', runCurrentScript);

document.getElementById('btn-stop').addEventListener('click', function() {
  stopLoop(true);
  setStatus('Stopped', 'idle');
});

function wireSlider(sliderId, outputId, key) {
  var sl  = document.getElementById(sliderId);
  var out = document.getElementById(outputId);
  sl.addEventListener('input', function() {
    settings[key] = parseInt(sl.value, 10);
    out.textContent = sl.value;
  });
}

wireSlider('sim-tempo',      'sim-tempo-val',      'tempo');
wireSlider('sim-brightness', 'sim-brightness-val', 'brightness');
wireSlider('sim-param',      'sim-param-val',      'density');

document.getElementById('sim-scale').addEventListener('change', function(e) {
  settings.scale = parseInt(e.target.value, 10);
});
selRootEl.addEventListener('change', function(e) {
  settings.rootNote = parseInt(e.target.value, 10);
});
selChanEl.addEventListener('change', function(e) {
  settings.midiChannel = parseInt(e.target.value, 10);
});

// ── Status display ─────────────────────────────────────────────────────────────

function setStatus(msg, state) {
  if (!state) state = 'idle';
  var el = document.getElementById('sim-status');
  el.textContent = msg;
  el.className   = 'sim-status-' + state;
}

// ── Init ───────────────────────────────────────────────────────────────────────

initMidi();
drawGrid();
