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

var _thawneyModes = [];
var _userModes = [];

function loadThawneyModes() {
  var GITHUB_REPO = 'thawney/shimmer';
  return fetch(
    'https://api.github.com/repos/' + GITHUB_REPO + '/contents/modes',
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  ).then(function(res) {
    return res.ok ? res.json() : [];
  }).then(function(files) {
    if (!Array.isArray(files)) return [];
    var fileNames = files
      .filter(function(f) { return f.type === 'file' && /^\d{2}_/.test(f.name) && f.name.endsWith('.js'); })
      .sort(function(a, b) { return a.name < b.name ? -1 : 1; })
      .map(function(f) { return f.name; });

    return Promise.all(fileNames.map(function(filename) {
      return fetch('modes/' + filename)
        .then(function(r) { return r.ok ? r.text() : Promise.reject(); })
        .then(function(code) {
          var meta = parseScriptMeta(code);
          return { name: meta.name, file: filename, desc: meta.desc, sound: meta.sound };
        }).catch(function() {
          return { name: filename, file: filename, desc: '', sound: '' };
        });
    }));
  }).catch(function() { return []; });
}

function loadUserModes() {
  var GITHUB_REPO = 'thawney/shimmer';
  return fetch(
    'https://api.github.com/repos/' + GITHUB_REPO + '/contents/user-modes',
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  ).then(function(res) {
    return res.ok ? res.json() : [];
  }).then(function(files) {
    return Array.isArray(files)
      ? files
          .filter(function(f) { return f.type === 'file' && f.name.endsWith('.js'); })
          .map(function(f) {
            return {
              name: f.name.replace(/\.js$/, '').replace(/[_-]/g, ' ')
                          .replace(/\b\w/g, function(c) { return c.toUpperCase(); }),
              file: f.name, desc: '', sound: '',
            };
          })
      : [];
  }).catch(function() { return []; });
}

var NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Scale interval bitmasks — bit N = semitone N is in scale, bit 0 = root.
// Matches MidiEngine::SCALES[] in firmware exactly.
var SCALES = [
  0b101010110101, // 0 Major
  0b010110101101, // 1 Minor
  0b011010101101, // 2 Dorian
  0b001010010101, // 3 Pentatonic (major)
  0b111111111111, // 4 Chromatic
  0b011010110101, // 5 Mixolydian
  0b101011010101, // 6 Lydian
  0b010110101011, // 7 Phrygian
  0b100110101101, // 8 Harmonic Minor
  0b010101010101, // 9 Whole Tone
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function formatSignedInt(v, width) {
  var abs = String(Math.abs(v | 0)).padStart(width || 3, '0');
  return (v >= 0 ? '+' : '-') + abs;
}

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
var gridStageEl = document.getElementById('sim-grid-stage');
var threeStageEl = document.getElementById('sim-3d-stage');
var enable3DEl = document.getElementById('sim-enable-3d');
var sensorReadoutEl = document.getElementById('sim-sensor-readout');

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

  if (sim3DController) sim3DController.notifyTextureUpdate();
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

// ── MIDI IN state (written by WebMIDI input handler, consumed per tick) ────────

var _midiIn = { type: 0, channel: 0, byte1: 255, byte2: 0, bend: 0 };
var MIDI_CLOCK = 0xF8;
var MIDI_START = 0xFA;
var MIDI_CONTINUE = 0xFB;
var MIDI_STOP = 0xFC;
var MIDI_CLOCK_TIMEOUT_MS = 750;

var _clockIn = {
  beatMs: 0,
  pulseMs: 0,
  lastClockAt: 0,
  lastRealtimeAt: 0,
  running: false,
};

var _clockOutTimer = null;
var _clockOutNextAt = 0;
var _clockOutStarted = false;

function midiInputMatchesSelection(input) {
  var selectedId = selMidiInEl ? selMidiInEl.value : '';
  return !selectedId || (input && input.id === selectedId);
}

function externalClockActive(now) {
  if (!now) now = performance.now();
  return _clockIn.lastRealtimeAt > 0 && (now - _clockIn.lastRealtimeAt) <= MIDI_CLOCK_TIMEOUT_MS && _clockIn.beatMs > 0;
}

function effectiveBeatMs(now) {
  if (externalClockActive(now)) return _clockIn.beatMs;
  return 60000 / Math.max(1, settings.tempo);
}

function resetClockIn() {
  _clockIn.beatMs = 0;
  _clockIn.pulseMs = 0;
  _clockIn.lastClockAt = 0;
  _clockIn.lastRealtimeAt = 0;
  _clockIn.running = false;
}

function sendRealtime(status) {
  if (midiOut) midiOut.send([status & 0xFF]);
}

function stopClockOut(sendStop) {
  if (_clockOutTimer !== null) {
    clearTimeout(_clockOutTimer);
    _clockOutTimer = null;
  }
  _clockOutNextAt = 0;
  if (sendStop && _clockOutStarted && midiOut) sendRealtime(MIDI_STOP);
  _clockOutStarted = false;
}

function scheduleClockOut(resetPhase) {
  if (_clockOutTimer !== null) {
    clearTimeout(_clockOutTimer);
    _clockOutTimer = null;
  }
  if (!_handlers || !midiOut || externalClockActive()) {
    _clockOutNextAt = 0;
    return;
  }

  var intervalMs = (60000 / Math.max(1, settings.tempo)) / 24;
  if (resetPhase || !_clockOutNextAt) _clockOutNextAt = performance.now();

  function tickClockOut() {
    if (!_handlers || !midiOut) {
      stopClockOut(false);
      return;
    }
    if (externalClockActive()) {
      _clockOutTimer = setTimeout(tickClockOut, 50);
      return;
    }

    var now = performance.now();
    var pulseInterval = (60000 / Math.max(1, settings.tempo)) / 24;
    if (!_clockOutStarted) {
      sendRealtime(MIDI_START);
      _clockOutStarted = true;
    }
    if (!_clockOutNextAt || _clockOutNextAt < now - pulseInterval * 4) _clockOutNextAt = now;
    while (_clockOutNextAt <= now + 0.5) {
      sendRealtime(MIDI_CLOCK);
      _clockOutNextAt += pulseInterval;
    }
    _clockOutTimer = setTimeout(tickClockOut, Math.max(1, _clockOutNextAt - performance.now()));
  }

  _clockOutTimer = setTimeout(tickClockOut, Math.max(1, intervalMs));
}

function handleRealtime(status, now) {
  if (!now) now = performance.now();
  if (status === MIDI_CLOCK) {
    if (_clockIn.lastClockAt > 0) {
      var delta = now - _clockIn.lastClockAt;
      if (delta > 0 && delta < 250) {
        _clockIn.pulseMs = _clockIn.pulseMs > 0 ? (_clockIn.pulseMs * 0.8) + (delta * 0.2) : delta;
        _clockIn.beatMs = _clockIn.pulseMs * 24;
      }
    }
    _clockIn.lastClockAt = now;
    _clockIn.lastRealtimeAt = now;
    return;
  }
  if (status === MIDI_START || status === MIDI_CONTINUE) {
    _clockIn.running = true;
    _clockIn.lastRealtimeAt = now;
    return;
  }
  if (status === MIDI_STOP) {
    _clockIn.running = false;
    _clockIn.lastRealtimeAt = now;
  }
}

function _attachMidiInputs(access) {
  access.inputs.forEach(function(input) {
    input.onmidimessage = function(ev) {
      var d = ev.data;
      if (!midiInputMatchesSelection(input) || !d || d.length < 1) return;
      var now = (typeof ev.timeStamp === 'number' && ev.timeStamp > 0) ? ev.timeStamp : performance.now();
      if (d[0] >= 0xF8) {
        handleRealtime(d[0], now);
        return;
      }
      if (d.length < 3) return;
      var type = d[0] >> 4;
      var ch   = (d[0] & 0x0F) + 1;
      if (type === 0x9 && d[2] > 0) {
        _midiIn.type = 1; _midiIn.channel = ch; _midiIn.byte1 = d[1]; _midiIn.byte2 = d[2]; _midiIn.bend = 0;
      } else if (type === 0x8 || (type === 0x9 && d[2] === 0)) {
        _midiIn.type = 2; _midiIn.channel = ch; _midiIn.byte1 = d[1]; _midiIn.byte2 = 0; _midiIn.bend = 0;
      } else if (type === 0xB) {
        _midiIn.type = 3; _midiIn.channel = ch; _midiIn.byte1 = d[1]; _midiIn.byte2 = d[2]; _midiIn.bend = 0;
      } else if (type === 0xE) {
        _midiIn.type = 4; _midiIn.channel = ch; _midiIn.byte1 = 255; _midiIn.byte2 = 0;
        _midiIn.bend = ((d[2] << 7) | d[1]) - 8192;
      }
    };
  });
}

// ── Shared state ───────────────────────────────────────────────────────────────

var settings = {
  scale:       3,   // 0=Major 1=Minor 2=Dorian 3=Pentatonic 4=Chromatic 5=Mixolydian 6=Lydian 7=Phrygian 8=HarmonicMinor 9=WholeTone
  rootNote:    0,   // 0-11 pitch class (C=0)
  tempo:       120, // BPM
  brightness:  200, // 0-255
  density:     128, // 0-255 (the per-script "amount" parameter)
  midiChannel: 0,   // 0-based, 0=ch1
  midiInChannel: 0, // 0-based, 0=ch1
};

// Script @hue / @sat — updated on each script load
var meta = { hue: 0, sat: 255 };

// Current WebMIDI output port (null = visual only)
var midiOut = null;

// Frame delta in ms for m.dt (updated each rAF tick)
var _dt = 16;

// Shared mock sensor values, read by every running script.
var sensorState = {
  accelX: 0,
  accelY: 0,
  accelZ: 64,
  motion: 0,
};

function updateSensorReadout() {
  if (!sensorReadoutEl) return;
  sensorReadoutEl.textContent =
    'X ' + formatSignedInt(sensorState.accelX, 3) +
    ' · Y ' + formatSignedInt(sensorState.accelY, 3) +
    ' · Z ' + formatSignedInt(sensorState.accelZ, 3) +
    ' · M ' + String(sensorState.motion | 0).padStart(3, '0');
}

function resetSensorState() {
  sensorState.accelX = 0;
  sensorState.accelY = 0;
  sensorState.accelZ = 64;
  sensorState.motion = 0;
  updateSensorReadout();
}

// Optional Three.js layer lives in its own file so the original canvas simulator
// logic stays compact and readable.
var sim3DController = window.createShimmerSimulator3D
  ? window.createShimmerSimulator3D({
      canvas: canvas,
      gridStageEl: gridStageEl,
      threeStageEl: threeStageEl,
      enable3DEl: enable3DEl,
      sensorState: sensorState,
      clamp: clamp,
      setStatus: setStatus,
      updateSensorReadout: updateSensorReadout,
      resetSensorState: resetSensorState,
    })
  : null;

function init3DSimulatorControls() {
  if (sim3DController) {
    sim3DController.initControls();
    return;
  }
  if (enable3DEl) enable3DEl.title = '3D view unavailable: simulator-3d.js failed to load';
}

// ── m object factory ───────────────────────────────────────────────────────────

function makeM() {
  var ticks = {};
  function sendRaw(status, d1, d2) {
    if (!midiOut) return;
    midiOut.send([status, d1 & 0x7F, d2 & 0x7F]);
  }
  function currentChannel() {
    return settings.midiChannel & 0x0F;
  }

  return {
    get COLS()       { return COLS; },
    get ROWS()       { return ROWS; },
    get dt()         { return _dt; },
    get beatMs()     { return effectiveBeatMs(); },
    get density()    { return settings.density; },
    get brightness() { return settings.brightness; },
    get rootNote()   { return settings.rootNote; },
    get scale()      { return settings.scale; },

    // Sensor stubs — static defaults so sensor-aware scripts run without errors.
    // On real hardware these are updated every frame from the LIS3DH / AHT20.
    get accelX()   { return sensorState.accelX; },
    get accelY()   { return sensorState.accelY; },
    get accelZ()   { return sensorState.accelZ; },   // ~+64 = 1g pointing down when device is flat/upright
    get motion()   { return sensorState.motion; },
    temp:     22.0,
    humidity: 55.0,

    // MIDI IN — overwritten each tick from _midiIn before update() runs.
    // type: 0=none 1=noteOn 2=noteOff 3=CC 4=pitchBend. Consumed after each frame.
    midiType:    0,
    midiChannel: 0,
    midiNote:    255,
    midiVel:     0,
    midiCC:      255,
    midiCCVal:   0,
    midiBend:    0,

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
      this.noteMidi(note, velocity, durationMs);
    },

    noteMidi: function(note, velocity, durationMs) {
      if (velocity  === undefined) velocity  = 80;
      if (durationMs == null)      durationMs = this.beatMs;
      var ch   = currentChannel();
      sendRaw(0x90 | ch, note | 0, velocity | 0);
      if (midiOut) {
        var out = midiOut;
        var offNote = note | 0;
        setTimeout(function() { out.send([0x80 | ch, offNote & 0x7F, 0]); }, durationMs);
      }
    },

    noteOn: function(note, velocity) {
      if (velocity === undefined) velocity = 80;
      sendRaw(0x90 | currentChannel(), note | 0, velocity | 0);
    },

    noteOff: function(note) {
      sendRaw(0x80 | currentChannel(), note | 0, 0);
    },

    cc: function(cc, value) {
      sendRaw(0xB0 | currentChannel(), cc | 0, value | 0);
    },

    pitchBend: function(value) {
      value = Math.max(-8192, Math.min(8191, value | 0));
      var bend14 = value + 8192;
      sendRaw(0xE0 | currentChannel(), bend14 & 0x7F, (bend14 >> 7) & 0x7F);
    },

    allOff: function() {
      sendRaw(0xB0 | currentChannel(), 123, 0);
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
  scheduleClockOut(true);
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
  stopClockOut(true);

  if (clearGrid) { clearPixelBuf(); drawGrid(); }
}

function _tick(ts) {
  if (_lastTs !== null) _dt = ts - _lastTs;
  _lastTs = ts;
  if (!externalClockActive(ts)) {
    _clockIn.beatMs = 0;
    _clockIn.pulseMs = 0;
    _clockIn.lastClockAt = 0;
    if (_handlers && !_clockOutTimer && midiOut) scheduleClockOut(true);
  }

  // Push MIDI IN state into the running script's m object, then consume.
  var configuredInCh = (settings.midiInChannel & 0x0F) + 1;
  var midiMatches = _midiIn.type !== 0 && _midiIn.channel === configuredInCh;
  _curM.midiType = midiMatches ? _midiIn.type : 0;
  _curM.midiChannel = midiMatches ? _midiIn.channel : 0;
  _curM.midiNote = midiMatches ? _midiIn.byte1 : 255;
  _curM.midiVel = midiMatches ? _midiIn.byte2 : 0;
  _curM.midiCC = midiMatches ? _midiIn.byte1 : 255;
  _curM.midiCCVal = midiMatches ? _midiIn.byte2 : 0;
  _curM.midiBend = midiMatches ? _midiIn.bend : 0;
  _midiIn.type = 0;
  _midiIn.channel = 0;
  _midiIn.byte1 = 255;
  _midiIn.byte2 = 0;
  _midiIn.bend = 0;

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

var selMidiInEl = document.getElementById('sim-midi-in-port');
var selMidiEl   = document.getElementById('sim-midi-port');
var _midiAccess = null;

function initMidi() {
  if (!navigator.requestMIDIAccess) {
    selMidiInEl.innerHTML = '<option value="">WebMIDI not supported in this browser</option>';
    selMidiEl.innerHTML = '<option value="">WebMIDI not supported in this browser</option>';
    return;
  }
  navigator.requestMIDIAccess({ sysex: false }).then(function(access) {
    _midiAccess = access;
    populateMidiPorts();
    _attachMidiInputs(access);
    access.onstatechange = function() {
      populateMidiPorts();
      _attachMidiInputs(access);
    };
  }).catch(function() {
    selMidiInEl.innerHTML = '<option value="">MIDI access denied</option>';
    selMidiEl.innerHTML = '<option value="">MIDI access denied</option>';
  });
}

function populateMidiPorts() {
  var prevIn = selMidiInEl.value;
  var prev = selMidiEl.value;
  selMidiInEl.innerHTML = '<option value="">-- any --</option>';
  selMidiEl.innerHTML = '<option value="">-- none (visual only) --</option>';
  _midiAccess.inputs.forEach(function(port, id) {
    var optIn = document.createElement('option');
    optIn.value = id;
    optIn.textContent = port.name;
    selMidiInEl.appendChild(optIn);
  });
  _midiAccess.outputs.forEach(function(port, id) {
    var opt = document.createElement('option');
    opt.value = id;
    opt.textContent = port.name;
    selMidiEl.appendChild(opt);
  });
  if (prevIn && selMidiInEl.querySelector('option[value="' + prevIn + '"]')) {
    selMidiInEl.value = prevIn;
  }
  if (prev && selMidiEl.querySelector('option[value="' + prev + '"]')) {
    selMidiEl.value = prev;
  }
  updateMidiOut();
}

function updateMidiOut() {
  var id = selMidiEl.value;
  midiOut = (id && _midiAccess) ? (_midiAccess.outputs.get(id) || null) : null;
  stopClockOut(false);
  if (_handlers) scheduleClockOut(true);
}

selMidiEl.addEventListener('change', updateMidiOut);
selMidiInEl.addEventListener('change', function() {
  resetClockIn();
  if (_handlers) scheduleClockOut(true);
});

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

// ── Script search (mirrors app.js) ─────────────────────────────────────────────

function buildSimScriptIndex() {
  var thawney = _thawneyModes.map(function(m) {
    return { name: m.name, file: 'modes/' + m.file, desc: m.desc || '', sound: m.sound || '', community: false };
  });
  var community = _userModes.map(function(m) {
    return { name: m.name, file: 'user-modes/' + m.file, desc: '', sound: '', community: true };
  });
  return thawney.concat(community);
}

function filterSimScripts(query) {
  var index = buildSimScriptIndex();
  if (!query.trim()) return index;
  var q = query.toLowerCase();
  return index.filter(function(m) {
    return m.name.toLowerCase().indexOf(q) !== -1 ||
           m.desc.toLowerCase().indexOf(q) !== -1 ||
           m.sound.toLowerCase().indexOf(q) !== -1;
  });
}

function renderSimSearchResults(results) {
  var ul = document.getElementById('sim-script-results');
  if (!ul) return;
  ul.innerHTML = '';
  if (!results.length) {
    ul.innerHTML = '<li class="script-result-empty">no scripts found</li>';
    ul.classList.add('open');
    return;
  }
  results.forEach(function(m) {
    var li = document.createElement('li');
    li.className = 'script-result' + (m.community ? ' script-result--community' : '');
    li.innerHTML =
      '<span class="script-result-name">' + m.name + '</span>' +
      (m.community ? '<span class="script-result-badge">community</span>' : '') +
      (m.desc  ? '<span class="script-result-desc">'  + m.desc  + '</span>' : '') +
      (m.sound ? '<span class="script-result-sound">' + m.sound + '</span>' : '');
    li.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var input = document.getElementById('sim-script-search');
      if (input) input.value = '';
      hideSimSearchResults();
      fetch(m.file).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function(code) {
        editor.setValue(code);
        runCurrentScript();
      }).catch(function() {
        setStatus('Script loading needs a web server — run: python3 -m http.server', 'error');
      });
    });
    ul.appendChild(li);
  });
  ul.classList.add('open');
}

function hideSimSearchResults() {
  var ul = document.getElementById('sim-script-results');
  if (ul) ul.classList.remove('open');
}

function initSimSearch() {
  var input = document.getElementById('sim-script-search');
  if (!input) return;
  input.addEventListener('focus', function() {
    renderSimSearchResults(filterSimScripts(input.value));
  });
  input.addEventListener('input', function() {
    renderSimSearchResults(filterSimScripts(input.value));
  });
  input.addEventListener('blur', function() {
    setTimeout(hideSimSearchResults, 150);
  });
  input.addEventListener('keydown', function(e) {
    var ul = document.getElementById('sim-script-results');
    if (!ul) return;
    var items = ul.querySelectorAll('.script-result');
    var active = ul.querySelector('.script-result--active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = active ? active.nextElementSibling : items[0];
      if (active) active.classList.remove('script-result--active');
      if (next && next.classList.contains('script-result')) next.classList.add('script-result--active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = active ? active.previousElementSibling : null;
      if (active) active.classList.remove('script-result--active');
      if (prev && prev.classList.contains('script-result')) prev.classList.add('script-result--active');
    } else if (e.key === 'Enter') {
      if (active) { active.dispatchEvent(new MouseEvent('mousedown')); input.blur(); }
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
}

// Boot — discover Thawney + community scripts in parallel, then wire up search
Promise.all([loadThawneyModes(), loadUserModes()]).then(function(results) {
  _thawneyModes = results[0];
  _userModes    = results[1];
  initSimSearch();
});

var selRootEl = document.getElementById('sim-root');
NOTE_NAMES.forEach(function(name, i) {
  var opt = document.createElement('option');
  opt.value = i;
  opt.textContent = name;
  selRootEl.appendChild(opt);
});

var selChanEl = document.getElementById('sim-channel');
var selInChanEl = document.getElementById('sim-in-channel');
for (var ch = 0; ch < 16; ch++) {
  var opt = document.createElement('option');
  opt.value = ch;
  opt.textContent = ch + 1;
  selChanEl.appendChild(opt);
  var inOpt = document.createElement('option');
  inOpt.value = ch;
  inOpt.textContent = ch + 1;
  selInChanEl.appendChild(inOpt);
}

// ── UI event wiring ────────────────────────────────────────────────────────────

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
    if (key === 'tempo' && _handlers) scheduleClockOut(true);
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
selInChanEl.addEventListener('change', function(e) {
  settings.midiInChannel = parseInt(e.target.value, 10);
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
resetSensorState();
init3DSimulatorControls();
drawGrid();
