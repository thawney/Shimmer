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
  { name: 'Lean', file: '16_lean.js' },
  { name: 'Haze', file: '17_haze.js' },
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

  if (sim3D && sim3D.texture) sim3D.texture.needsUpdate = true;
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

function report3DError(msg) {
  if (enable3DEl) {
    enable3DEl.checked = false;
    enable3DEl.title = msg || '';
  }
  setStatus(msg, 'error');
}

// ── 3D simulator ───────────────────────────────────────────────────────────────

var sim3D = {
  ready: false,
  enabled: false,
  dragging: false,
  pointerId: null,
  lastClientX: 0,
  lastClientY: 0,
  pitch: 0,
  roll: 0,
  renderPitch: 0,
  renderRoll: 0,
  targetPitch: 0,
  targetRoll: 0,
  lastTiltPitch: 1,
  lastTiltRoll: 0,
  axisLock: null,
  shakeTime: 0,
  shakeDuration: 560,
  lastPitch: 0,
  lastRoll: 0,
  lastFrameTs: 0,
  renderer: null,
  scene: null,
  camera: null,
  deviceGroup: null,
  texture: null,
  raycaster: null,
  pointer: null,
  interactiveMeshes: [],
};

function focus3DStage() {
  if (!threeStageEl || threeStageEl.tabIndex < 0) return;
  try {
    threeStageEl.focus({ preventScroll: true });
  } catch (e) {
    threeStageEl.focus();
  }
}

function reset3DPose() {
  if (threeStageEl && sim3D.pointerId != null && threeStageEl.releasePointerCapture) {
    try {
      if (threeStageEl.hasPointerCapture && threeStageEl.hasPointerCapture(sim3D.pointerId)) {
        threeStageEl.releasePointerCapture(sim3D.pointerId);
      }
    } catch (e) {}
  }

  sim3D.dragging = false;
  sim3D.pointerId = null;
  sim3D.pitch = 0;
  sim3D.roll = 0;
  sim3D.renderPitch = 0;
  sim3D.renderRoll = 0;
  sim3D.targetPitch = 0;
  sim3D.targetRoll = 0;
  sim3D.lastTiltPitch = 1;
  sim3D.lastTiltRoll = 0;
  sim3D.axisLock = null;
  sim3D.shakeTime = 0;
  sim3D.lastPitch = 0;
  sim3D.lastRoll = 0;
  sim3D.lastFrameTs = 0;
  if (gridStageEl) gridStageEl.classList.remove('is-dragging');
}

function trigger3DShake() {
  sim3D.shakeTime = sim3D.shakeDuration;
}

function clear3DAxisLock() {
  sim3D.axisLock = null;
}

function updateTiltDirection(pitch, roll) {
  var mag = Math.sqrt(pitch * pitch + roll * roll);
  if (mag < 0.0001) return;
  sim3D.lastTiltPitch = pitch / mag;
  sim3D.lastTiltRoll = roll / mag;
}

function adjust3DZTilt(delta) {
  var curPitch = sim3D.targetPitch;
  var curRoll = sim3D.targetRoll;
  var radius = Math.sqrt(curPitch * curPitch + curRoll * curRoll);
  var nextRadius = clamp(radius + delta, 0, 1.45);
  var dirPitch = sim3D.lastTiltPitch;
  var dirRoll = sim3D.lastTiltRoll;

  if (radius >= 0.0001) {
    dirPitch = curPitch / radius;
    dirRoll = curRoll / radius;
  }

  sim3D.targetPitch = clamp(dirPitch * nextRadius, -1.45, 1.45);
  sim3D.targetRoll = clamp(dirRoll * nextRadius, -1.45, 1.45);
  updateTiltDirection(sim3D.targetPitch, sim3D.targetRoll);
}

function apply3DDrag(dx, dy) {
  var lock = sim3D.axisLock;

  if (lock === 'x') {
    sim3D.targetPitch = clamp(sim3D.targetPitch + dy * 0.0085, -1.45, 1.45);
    updateTiltDirection(sim3D.targetPitch, sim3D.targetRoll);
    return;
  }

  if (lock === 'y') {
    sim3D.targetRoll = clamp(sim3D.targetRoll + dx * 0.0085, -1.45, 1.45);
    updateTiltDirection(sim3D.targetPitch, sim3D.targetRoll);
    return;
  }

  if (lock === 'z') {
    adjust3DZTilt((Math.abs(dy) >= Math.abs(dx) ? dy : dx) * 0.0085);
    return;
  }

  sim3D.targetRoll  = clamp(sim3D.targetRoll  + dx * 0.0085, -1.45, 1.45);
  sim3D.targetPitch = clamp(sim3D.targetPitch + dy * 0.0085, -1.45, 1.45);
  updateTiltDirection(sim3D.targetPitch, sim3D.targetRoll);
}

function set3DEnabled(enabled) {
  sim3D.enabled = !!enabled && sim3D.ready;
  if (enable3DEl) enable3DEl.checked = sim3D.enabled;
  if (gridStageEl) gridStageEl.classList.toggle('is-3d', sim3D.enabled);
  if (threeStageEl) threeStageEl.tabIndex = sim3D.enabled ? 0 : -1;

  if (!sim3D.enabled) {
    reset3DPose();
    if (threeStageEl && document.activeElement === threeStageEl) threeStageEl.blur();
    resetSensorState();
  } else {
    sim3D.lastFrameTs = 0;
    focus3DStage();
  }

  render3DScene();
}

function sync3DSensorState(dtMs) {
  var dt = Math.max(1, dtMs || 16);
  var smoothing = sim3D.dragging ? 1 : Math.min(1, dt / 24);

  sim3D.pitch += (sim3D.targetPitch - sim3D.pitch) * smoothing;
  sim3D.roll += (sim3D.targetRoll - sim3D.roll) * smoothing;

  if (Math.abs(sim3D.targetPitch - sim3D.pitch) < 0.0001) sim3D.pitch = sim3D.targetPitch;
  if (Math.abs(sim3D.targetRoll - sim3D.roll) < 0.0001) sim3D.roll = sim3D.targetRoll;

  var shakePitch = 0;
  var shakeRoll = 0;
  if (sim3D.shakeTime > 0) {
    var progress = 1.0 - (sim3D.shakeTime / sim3D.shakeDuration);
    var envelope = (sim3D.shakeTime / sim3D.shakeDuration);
    var time = progress * 0.72;
    shakePitch = Math.sin(time * 32.0) * 0.18 * envelope;
    shakeRoll  = Math.sin(time * 41.0 + 0.9) * 0.16 * envelope;
    sim3D.shakeTime = Math.max(0, sim3D.shakeTime - dt);
  }

  sim3D.renderPitch = clamp(sim3D.pitch + shakePitch, -1.45, 1.45);
  sim3D.renderRoll  = clamp(sim3D.roll + shakeRoll, -1.45, 1.45);

  var sinPitch = Math.sin(sim3D.renderPitch);
  var cosPitch = Math.cos(sim3D.renderPitch);
  var sinRoll  = Math.sin(sim3D.renderRoll);
  var cosRoll  = Math.cos(sim3D.renderRoll);

  sensorState.accelX = clamp(Math.round(-sinPitch * 64), -128, 127);
  sensorState.accelY = clamp(Math.round(sinRoll * cosPitch * 64), -128, 127);
  sensorState.accelZ = clamp(Math.round(cosRoll * cosPitch * 64), -128, 127);

  var deltaPitch = sim3D.renderPitch - sim3D.lastPitch;
  var deltaRoll  = sim3D.renderRoll  - sim3D.lastRoll;
  var angularSpeed = Math.sqrt(deltaPitch * deltaPitch + deltaRoll * deltaRoll) / (dt / 1000);
  var motionBoost = clamp(Math.round(angularSpeed * 36), 0, 255);
  var decayedMotion = Math.round(sensorState.motion * Math.exp(-dt / 170));
  sensorState.motion = motionBoost > decayedMotion ? motionBoost : decayedMotion;

  sim3D.lastPitch = sim3D.renderPitch;
  sim3D.lastRoll  = sim3D.renderRoll;

  updateSensorReadout();
}

function render3DScene() {
  if (!sim3D.ready) return;

  sim3D.deviceGroup.rotation.x = sim3D.renderPitch;
  sim3D.deviceGroup.rotation.z = -sim3D.renderRoll;
  sim3D.renderer.render(sim3D.scene, sim3D.camera);
}

function resize3DScene() {
  if (!sim3D.ready || !threeStageEl) return;

  var rect = threeStageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  sim3D.camera.aspect = rect.width / rect.height;
  sim3D.camera.updateProjectionMatrix();
  sim3D.renderer.setPixelRatio(window.devicePixelRatio || 1);
  sim3D.renderer.setSize(rect.width, rect.height, false);
  render3DScene();
}

function isPointerOnDevice(event) {
  if (!sim3D.ready || !threeStageEl) return false;

  var rect = threeStageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;

  sim3D.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sim3D.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  sim3D.raycaster.setFromCamera(sim3D.pointer, sim3D.camera);

  return sim3D.raycaster.intersectObjects(sim3D.interactiveMeshes, false).length > 0;
}

function on3DPointerDown(event) {
  if (!sim3D.enabled || event.button !== 0) return;

  focus3DStage();
  if (!isPointerOnDevice(event)) return;

  sim3D.dragging = true;
  sim3D.pointerId = event.pointerId;
  sim3D.lastClientX = event.clientX;
  sim3D.lastClientY = event.clientY;

  if (gridStageEl) gridStageEl.classList.add('is-dragging');
  if (threeStageEl && threeStageEl.setPointerCapture) {
    try { threeStageEl.setPointerCapture(event.pointerId); } catch (e) {}
  }

  event.preventDefault();
}

function on3DPointerMove(event) {
  if (!sim3D.dragging || event.pointerId !== sim3D.pointerId) return;

  var dx = event.clientX - sim3D.lastClientX;
  var dy = event.clientY - sim3D.lastClientY;
  sim3D.lastClientX = event.clientX;
  sim3D.lastClientY = event.clientY;

  apply3DDrag(dx, dy);
}

function end3DDrag(event) {
  if (!sim3D.dragging) return;
  if (event && event.pointerId != null && sim3D.pointerId != null && event.pointerId !== sim3D.pointerId) return;

  if (threeStageEl && sim3D.pointerId != null && threeStageEl.releasePointerCapture) {
    try {
      if (threeStageEl.hasPointerCapture && threeStageEl.hasPointerCapture(sim3D.pointerId)) {
        threeStageEl.releasePointerCapture(sim3D.pointerId);
      }
    } catch (e) {}
  }

  sim3D.dragging = false;
  sim3D.pointerId = null;
  if (gridStageEl) gridStageEl.classList.remove('is-dragging');
}

function on3DKeyDown(event) {
  if (!sim3D.enabled) return;

  var key = event.key ? event.key.toLowerCase() : '';
  if (key === 'x' || key === 'y' || key === 'z') {
    sim3D.axisLock = key;
    event.preventDefault();
    return;
  }

  if (event.repeat) return;

  if (key === 'r') {
    reset3DPose();
    resetSensorState();
    render3DScene();
    event.preventDefault();
    return;
  }

  if (key === 's') {
    trigger3DShake();
    event.preventDefault();
  }
}

function on3DKeyUp(event) {
  var key = event.key ? event.key.toLowerCase() : '';
  if (key === sim3D.axisLock) {
    clear3DAxisLock();
    event.preventDefault();
  }
}

function on3DBlur() {
  clear3DAxisLock();
}

function step3DScene(ts) {
  if (sim3D.ready && sim3D.enabled) {
    var dt = sim3D.lastFrameTs ? Math.min(48, ts - sim3D.lastFrameTs) : 16;
    sim3D.lastFrameTs = ts;
    sync3DSensorState(dt);
    render3DScene();
  }

  requestAnimationFrame(step3DScene);
}

function ensure3DSimulator() {
  if (sim3D.ready) return true;
  if (!gridStageEl || !threeStageEl || !enable3DEl) return false;

  if (!window.THREE) {
    report3DError('3D view unavailable: Three.js failed to load');
    return false;
  }

  try {
    threeStageEl.innerHTML = '';

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    threeStageEl.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(3.0, 2.45, 3.1);
    camera.lookAt(0, 0.22, 0);

    scene.add(new THREE.HemisphereLight(0xf7edc9, 0x090909, 1.5));

    var keyLight = new THREE.DirectionalLight(0xffe2a1, 1.35);
    keyLight.position.set(3.4, 5.0, 2.2);
    scene.add(keyLight);

    var rimLight = new THREE.DirectionalLight(0x8db7ff, 0.35);
    rimLight.position.set(-3.0, 2.0, -2.5);
    scene.add(rimLight);

    // Keep the "floor" as a background-only shadow so it never clips the device.
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 64),
      new THREE.MeshBasicMaterial({
        color: 0x110f0d,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -1.9, 0.18);
    shadow.renderOrder = -10;
    scene.add(shadow);

    var deviceGroup = new THREE.Group();
    deviceGroup.position.y = 0.22;
    scene.add(deviceGroup);

    var body = new THREE.Mesh(
      new THREE.BoxGeometry(2.36, 0.28, 2.36),
      new THREE.MeshStandardMaterial({
        color: 0x171717,
        metalness: 0.12,
        roughness: 0.74,
      })
    );
    deviceGroup.add(body);

    var bezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.12, 0.04, 2.12),
      new THREE.MeshStandardMaterial({
        color: 0x060606,
        metalness: 0.08,
        roughness: 0.92,
      })
    );
    bezel.position.y = 0.14;
    deviceGroup.add(bezel);

    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.36, 0.28, 2.36)),
      new THREE.LineBasicMaterial({ color: 0x55451a, transparent: true, opacity: 0.55 })
    );
    deviceGroup.add(edges);

    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    var panel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    panel.rotation.x = -Math.PI / 2;
    panel.position.y = 0.161;
    deviceGroup.add(panel);

    sim3D.renderer = renderer;
    sim3D.scene = scene;
    sim3D.camera = camera;
    sim3D.deviceGroup = deviceGroup;
    sim3D.texture = texture;
    sim3D.raycaster = new THREE.Raycaster();
    sim3D.pointer = new THREE.Vector2();
    sim3D.interactiveMeshes = [body, bezel, panel];
    sim3D.ready = true;
    enable3DEl.title = '';

    threeStageEl.addEventListener('pointerdown', on3DPointerDown);
    threeStageEl.addEventListener('pointermove', on3DPointerMove);
    threeStageEl.addEventListener('pointerup', end3DDrag);
    threeStageEl.addEventListener('pointercancel', end3DDrag);
    threeStageEl.addEventListener('lostpointercapture', end3DDrag);
    threeStageEl.addEventListener('keydown', on3DKeyDown);
    threeStageEl.addEventListener('keyup', on3DKeyUp);
    threeStageEl.addEventListener('blur', on3DBlur);

    if (window.ResizeObserver) {
      new ResizeObserver(resize3DScene).observe(threeStageEl);
    } else {
      window.addEventListener('resize', resize3DScene);
    }

    resize3DScene();
    render3DScene();
    requestAnimationFrame(step3DScene);
    return true;
  } catch (err) {
    sim3D.ready = false;
    sim3D.renderer = null;
    sim3D.scene = null;
    sim3D.camera = null;
    sim3D.deviceGroup = null;
    sim3D.texture = null;
    sim3D.raycaster = null;
    sim3D.pointer = null;
    sim3D.interactiveMeshes = [];
    threeStageEl.innerHTML = '';
    report3DError('3D view unavailable: ' + (err && err.message ? err.message : 'WebGL init failed'));
    return false;
  }
}

function init3DSimulatorControls() {
  if (!enable3DEl) return;

  enable3DEl.addEventListener('change', function() {
    if (enable3DEl.checked) {
      if (!ensure3DSimulator()) return;
      set3DEnabled(true);
      return;
    }

    set3DEnabled(false);
  });
}

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
    get accelX()   { return sensorState.accelX; },
    get accelY()   { return sensorState.accelY; },
    get accelZ()   { return sensorState.accelZ; },   // ~+64 = 1g pointing down when device is flat/upright
    get motion()   { return sensorState.motion; },
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
resetSensorState();
init3DSimulatorControls();
drawGrid();
