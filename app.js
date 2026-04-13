'use strict';

// Default scripts for the 4 slots (matches data/scripts/ initial LittleFS image)
// slot 0 = Rain, slot 1 = Lean, slot 2 = Tide, slot 3 = Canon
const DEFAULT_FILES = [
  'modes/00_rain.js',
  'modes/16_lean.js',
  'modes/19_tide.js',
  'modes/20_canon.js',
];
const SCRIPTS_VIEW_STORAGE_KEY = 'shimmer-scripts-view';

const NUM_SLOTS      = 4;    // UI-visible slots
const NUM_MODES_TOTAL = 16;  // firmware struct size (always 16)

const SCALE_NAMES = [
  'Major',
  'Minor',
  'Dorian',
  'Pentatonic',
  'Chromatic',
  'Mixolydian',
  'Lydian',
  'Phrygian',
  'Harmonic Minor',
  'Whole Tone',
];
const NOTE_NAMES  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// SysEx constants
const MFR       = 0x7D;
const VER       = 0x01;
const CMD_GET   = 0x01;
const CMD_DUMP  = 0x02;
const CMD_SET   = 0x03;
const CMD_SAVE  = 0x05;
const CMD_ACK   = 0x06;
const CMD_KEY   = 0x08;
const CMD_MODE  = 0x09;
const CMD_CLOCK = 0x0A;

// Firmware OTA SysEx commands
const SYSEX_FW_BEGIN  = 0x30;
const SYSEX_FW_CHUNK  = 0x31;
const SYSEX_FW_END    = 0x32;
const SYSEX_FW_ABORT  = 0x33;
const SYSEX_FW_STATUS = 0x34;

const FW_STATUS_READY    = 0;
const FW_STATUS_PROGRESS = 1;
const FW_STATUS_DONE     = 2;
const FW_STATUS_ERROR    = 3;

const FW_CHUNK_BYTES = 7000; // 1000 complete 7-byte groups → 8000 encoded bytes → 8007-byte SysEx msg
const MAX_SCRIPT_BYTES = 12288;
const SCRIPT_SAFETY = window.ShimmerScriptSafety || null;

const SYSEX_SCRIPT_BEGIN     = 0x20;
const SYSEX_SCRIPT_CHUNK     = 0x21;
const SYSEX_SCRIPT_END       = 0x22;
const SYSEX_SET_MODE_ENABLED = 0x24;
const CMD_GET_SLOT_NAMES     = 0x25;
const CMD_SLOT_NAMES         = 0x26;
const CMD_GET_SCRIPT         = 0x27;
const CMD_SCRIPT_READ_BEGIN  = 0x28;
const CMD_SCRIPT_READ_CHUNK  = 0x29;
const CMD_SCRIPT_READ_END    = 0x2A;

const P_SCALE      = 0x00;
const P_ROOT       = 0x01;
const P_TEMPO      = 0x02;
const P_BRIGHTNESS = 0x03;
const P_CHANNEL    = 0x04;
const P_IN_CHANNEL = 0x05;
const P_DENSITY    = 0x06;
const P_SPEED      = 0x07;
const P_G_MODE     = 0x11;

const GLOBAL_HEADER   = 4;
const MODE_SIZE       = 8;
const GLOBAL_SIZE     = GLOBAL_HEADER + NUM_MODES_TOTAL * MODE_SIZE + 4; // 136
const SETTINGS_POLL_MS = 1500;
const BPM_MIN = 1;
const BPM_MAX = 240;
const MODE_MIDI_IN_CH_MASK = 0x0F;
const MODE_CLOCK_IN_ENABLE_BIT = 0x10;
const MODE_CLOCK_PREFER_EXTERNAL_BIT = 0x20;
const MODE_CLOCK_OUT_ENABLE_BIT = 0x40;

function formatMidiNoteName(note) {
  const midi = Math.max(0, Math.min(127, note | 0));
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12);
  return `${name}${octave}`;
}

function formatAckError(cmd, status, meta = {}) {
  if (cmd === SYSEX_SCRIPT_BEGIN) {
    if (status === 0x01) return 'Script upload could not start due to an invalid begin packet.';
    if (status === 0x02) {
      const actual = typeof meta.totalLen === 'number' ? `${meta.totalLen} bytes` : 'this size';
      return `Script is too large: ${actual}. Max is ${MAX_SCRIPT_BYTES} bytes.`;
    }
    if (status === 0x03) return 'Device ran out of memory while starting the script upload.';
  }

  if (cmd === SYSEX_SCRIPT_CHUNK) {
    if (status === 0x01) return 'Script upload chunk was rejected because no upload is active.';
    if (status === 0x02) return 'Script upload chunk arrived out of order. Try uploading again.';
    if (status === 0x03) return 'Script upload exceeded the size announced at the start.';
  }

  if (cmd === SYSEX_SCRIPT_END) {
    if (status === 0x01) return 'Script upload could not finish because no upload is active.';
    if (status === 0x04) return 'Device could not save the uploaded script to storage.';
    if (status === 0x05) return 'Script upload targeted an invalid slot.';
  }

  if (cmd === CMD_GET_SCRIPT) {
    if (status === 0x01) return 'Script download request was malformed.';
    if (status === 0x02) return 'No script file was found in that slot on the device.';
    if (status === 0x03) return 'Device reported an invalid script size for that slot.';
  }

  return `Device error 0x${status.toString(16)} for cmd 0x${cmd.toString(16)}`;
}

function tempoStoredToBpm(stored) {
  const t = stored & 0xFF;
  if (t <= 180) return t + 60;
  if (t <= 239) return t - 180;
  return BPM_MAX;
}

function bpmToTempoStored(bpm) {
  const b = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm | 0));
  if (b >= 60) return b - 60;
  return b + 180;
}

function decodeMidiInConfig(raw) {
  const packed = raw & 0x7F;
  const legacy = (packed & 0x70) === 0;
  return {
    midiInChannel: packed & MODE_MIDI_IN_CH_MASK,
    clockIn: legacy ? 1 : ((packed & MODE_CLOCK_IN_ENABLE_BIT) ? 1 : 0),
    clockPriority: legacy ? 1 : ((packed & MODE_CLOCK_PREFER_EXTERNAL_BIT) ? 1 : 0),
    clockOut: legacy ? 1 : ((packed & MODE_CLOCK_OUT_ENABLE_BIT) ? 1 : 0),
  };
}

function packMidiInConfig(settings) {
  let packed = settings.midiInChannel & MODE_MIDI_IN_CH_MASK;
  if (settings.clockIn) packed |= MODE_CLOCK_IN_ENABLE_BIT;
  if (settings.clockPriority) packed |= MODE_CLOCK_PREFER_EXTERNAL_BIT;
  if (settings.clockOut) packed |= MODE_CLOCK_OUT_ENABLE_BIT;
  return packed;
}

const CLOCK_MODE_HELP = {
  auto: 'Auto: follow external clock when present, otherwise run internal clock and send clock out.',
  leader: 'Leader: ignore external clock and send Shimmer tempo out to other gear.',
  follower: 'Follower: follow external clock and do not send your own clock out.',
  internal: 'Internal: ignore external clock and do not send clock out.',
};

function clockModeForSettings(settings) {
  if (settings.clockIn && settings.clockPriority && settings.clockOut) return 'auto';
  if (!settings.clockIn && !settings.clockPriority && settings.clockOut) return 'leader';
  if (settings.clockIn && settings.clockPriority && !settings.clockOut) return 'follower';
  return 'internal';
}

function applyClockMode(settings, mode) {
  if (mode === 'auto') {
    settings.clockIn = 1;
    settings.clockPriority = 1;
    settings.clockOut = 1;
  } else if (mode === 'leader') {
    settings.clockIn = 0;
    settings.clockPriority = 0;
    settings.clockOut = 1;
  } else if (mode === 'follower') {
    settings.clockIn = 1;
    settings.clockPriority = 1;
    settings.clockOut = 0;
  } else {
    settings.clockIn = 0;
    settings.clockPriority = 0;
    settings.clockOut = 0;
  }
}

function renderClockModeHelp(mode) {
  if (clockModeHelpEl) clockModeHelpEl.textContent = CLOCK_MODE_HELP[mode] || CLOCK_MODE_HELP.auto;
}

// ---------------------------------------------------------------------------
// 8-to-7 SysEx codec
// ---------------------------------------------------------------------------
function encode8to7(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const count = Math.min(7, bytes.length - i);
    let msbs = 0;
    for (let n = 0; n < count; n++) {
      if (bytes[i + n] & 0x80) msbs |= (1 << n);
    }
    out.push(msbs);
    for (let n = 0; n < count; n++) out.push(bytes[i + n] & 0x7F);
    i += count;
  }
  return out;
}

function decode7to8(encoded) {
  const out = [];
  let i = 0;
  while (i < encoded.length) {
    const msbs = encoded[i++];
    for (let n = 0; n < 7 && i < encoded.length; n++, i++) {
      out.push(encoded[i] | ((msbs >> n & 1) << 7));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slot metadata — parsed from script headers
// ---------------------------------------------------------------------------
const slots = Array.from({length: NUM_SLOTS}, (_, i) => ({
  name:       `Slot ${i}`,
  author:     '',
  paramLabel: 'Amount',
  desc:       '',
  code:       '',
}));
const slotUiState = Array.from({length: NUM_SLOTS}, () => ({
  status: '',
  uploadDisabled: false,
  downloadDisabled: false,
}));

let _scriptsView = 'simple';
let _simpleSelectedSlot = 0;
let _simpleLibraryActiveIndex = -1;
let _simpleSelectedScriptFile = '';
let _simpleSelectedScript = null;
let _simpleLibrarySourceFilter = 'all';
let _simpleLibrarySoundFilter = 'all';
const _scriptTextCache = new Map();

function parseScriptMeta(code) {
  const get = tag => {
    const m = code.match(new RegExp('@' + tag + '\\s+(.+)'));
    return m ? m[1].trim() : null;
  };
  return {
    name:       get('name')        ?? 'Script',
    author:     get('author')      ?? '',
    paramLabel: get('param_label') ?? 'Amount',
    desc:       get('description') ?? '',
    sound:      get('sound')       ?? '',
  };
}

function analyzeScriptSafety(code) {
  if (!SCRIPT_SAFETY) {
    return { issues: [], hasErrors: false, hasWarnings: false, bytes: 0, maxBytes: MAX_SCRIPT_BYTES };
  }
  return SCRIPT_SAFETY.analyze(code, { maxBytes: MAX_SCRIPT_BYTES });
}

function renderSafetyMessage(el, report, options = {}) {
  if (!el) return;
  if (!report || !report.issues || !report.issues.length) {
    el.textContent = '';
    el.className = options.baseClass || 'slot-safety';
    return;
  }

  const baseClass = options.baseClass || 'slot-safety';
  const summary = SCRIPT_SAFETY
    ? SCRIPT_SAFETY.summarize(report, { maxItems: options.maxItems || 2 })
    : report.issues.slice(0, 2).map(issue => issue.message).join(' ');

  el.textContent = summary;
  el.className = baseClass;
  if (report.hasErrors) el.classList.add(`${baseClass}--error`);
  else if (report.hasWarnings) el.classList.add(`${baseClass}--warn`);
}

function renderSlotSafety(slotIdx, code) {
  const safetyEl = document.getElementById(`slot-safety-${slotIdx}`);
  if (!safetyEl) return null;
  if (!code || !code.trim()) {
    renderSafetyMessage(safetyEl, null);
    return null;
  }
  const report = analyzeScriptSafety(code);
  renderSafetyMessage(safetyEl, report);
  return report;
}

// Mode entries discovered dynamically at boot — no hardcoded list needed.
// GitHub API gives the file index; each script's own header supplies the metadata.
const GITHUB_REPO = 'thawney/shimmer';
let _thawneyModes = [];
let _userModes = [];

async function loadThawneyModes() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/modes`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return [];
    const files = await res.json();
    const fileNames = files
      .filter(f => f.type === 'file' && /^\d{2}_/.test(f.name) && f.name.endsWith('.js'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => f.name);

    // Fetch each script locally in parallel to parse its own @name / @description / @sound
    return Promise.all(fileNames.map(async filename => {
      try {
        const r = await fetch(`modes/${filename}`);
        if (!r.ok) throw new Error();
        const meta = parseScriptMeta(await r.text());
        return { name: meta.name, file: filename, desc: meta.desc, sound: meta.sound, author: meta.author || '' };
      } catch {
        return { name: filename, file: filename, desc: '', sound: '', author: '' };
      }
    }));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let midiAccess  = null;
let midiOut     = null;
let midiIn      = null;
let currentSlot = 0;
let _saveTimer  = null;
let _rxInSysEx  = false;
let _rxBuf      = [];
let _awaitingModeSwitchAck = false;
let _modeSwitchAckTimer = null;
let _pendingAck = null; // { cmd, timer, resolve, reject }
let modeEnabled = 0x000F; // 4 slots only

// Chunked script download state
let _dlSlot        = -1;
let _dlBuf         = [];
let _dlExpectedLen = 0;
let _dlResolve     = null;
let _dlReject      = null;
let _dlTimer       = null;

// Firmware flash state
let _fwBuffer      = null; // ArrayBuffer ready to flash (from server or file picker)
let _fwResolve     = null;
let _fwReject      = null;
let _fwTimer       = null;
let _fwTotalBytes  = 0;
let _fwAborted     = false;
let _fwAckQueue    = [];   // queued chunk ACKs for windowed sending
let _fwAckWaiter   = null; // single waiter consuming from queue

// Serialize script upload/download operations so shared ACK/download state cannot race.
let _scriptTransferChain = Promise.resolve();
let _scriptTransferDepth = 0;
let _startupSyncInFlight = false;
let _startupSyncTimer = null;
let _portEpoch = 0;

// Controls lock — unlocked only after a successful settings dump from device
let _synced = false;
let _slotNamesSeenMask = 0;

const modeSettings = Array.from({length: NUM_MODES_TOTAL}, () => ({
  scale: 3, rootNote: 60, tempo: 60, brightness: 200, midiChannel: 0, midiInChannel: 0, clockIn: 1, clockPriority: 1, clockOut: 1, density: 128, speed: 128
}));

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const selPort       = document.getElementById('midi-port');
const btnRefresh    = document.getElementById('btn-refresh');
const btnReadDevice = document.getElementById('btn-read-device');
const statusEl      = document.getElementById('status');
const startupGateEl = document.getElementById('startup-gate');
const startupTitleEl = document.getElementById('startup-title');
const startupSubEl = document.getElementById('startup-sub');
const startupProgressEl = document.getElementById('startup-progress');
const tabScripts    = document.getElementById('tab-scripts');
const tabControls   = document.getElementById('tab-controls');
const pillsEl    = document.getElementById('mode-pills');
const modeDescEl = document.getElementById('mode-desc');
const keyInfoEl  = document.getElementById('key-info');
const btnRandomizeKey = document.getElementById('btn-randomize-key');

const selScale   = document.getElementById('p-scale');
const selRoot    = document.getElementById('p-root');
const slTempo    = document.getElementById('p-tempo');
const outTempo   = document.getElementById('p-tempo-val');
const clockInfoEl = document.getElementById('clock-info');
const slBright   = document.getElementById('p-brightness');
const outBright  = document.getElementById('p-brightness-val');
const selChan    = document.getElementById('p-channel');
const selInChan  = document.getElementById('p-in-channel');
const selClockMode = document.getElementById('p-clock-mode');
const clockModeHelpEl = document.getElementById('p-clock-mode-help');
const slParam    = document.getElementById('p-param');
const outParam   = document.getElementById('p-param-val');
const lblParam   = document.getElementById('lbl-param');

const slotCardsEl = document.getElementById('slot-cards');
const scriptsSimpleViewEl = document.getElementById('scripts-simple-view');
const scriptsAdvancedViewEl = document.getElementById('scripts-advanced-view');
const simpleSlotListEl = document.getElementById('simple-slot-list');
const simpleLibrarySearchEl = document.getElementById('simple-library-search');
const simpleLibrarySoundFilterEl = document.getElementById('simple-library-sound-filter');
const simpleLibraryResultsEl = document.getElementById('simple-library-results');
const simpleLibrarySourceBtns = Array.from(document.querySelectorAll('[data-library-source]'));
const simpleDetailHelpEl = document.getElementById('simple-detail-help');
const simpleScriptSourceEl = document.getElementById('simple-script-source');
const simpleScriptSlotTargetEl = document.getElementById('simple-script-slot-target');
const simpleScriptNameEl = document.getElementById('simple-script-name');
const simpleScriptAuthorEl = document.getElementById('simple-script-author');
const simpleScriptDescEl = document.getElementById('simple-script-desc');
const simpleScriptSoundEl = document.getElementById('simple-script-sound');
const simpleUseScriptBtn = document.getElementById('simple-use-script');
const simpleOpenAdvancedBtn = document.getElementById('simple-open-advanced');
const simpleImportFileEl = document.getElementById('simple-import-file');
const simpleCodePreviewEl = document.getElementById('simple-code-preview');
const simpleScriptPreviewEl = document.getElementById('simple-script-preview');
const scriptsViewBtns = Array.from(document.querySelectorAll('[data-scripts-view]'));

function setStatus(msg) { statusEl.textContent = msg; }

function getStoredScriptsView() {
  try {
    return localStorage.getItem(SCRIPTS_VIEW_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setStoredScriptsView(view) {
  try {
    localStorage.setItem(SCRIPTS_VIEW_STORAGE_KEY, view);
  } catch (e) {}
}

function simpleSlotLabel(slotIdx) {
  return `Slot ${slotIdx}`;
}

let _clockState = { external: false, running: false, usingExternal: false, bpmX10: 1200 };

function renderClockInfo() {
  if (!clockInfoEl) return;
  const bpm = (_clockState.bpmX10 / 10).toFixed(1).replace(/\.0$/, '');
  if (_clockState.usingExternal) {
    clockInfoEl.textContent = _clockState.running ? `EXT ${bpm}` : 'EXT stop';
  } else if (_clockState.external) {
    clockInfoEl.textContent = `INT ${bpm} · ext`;
  } else {
    clockInfoEl.textContent = `INT ${bpm}`;
  }
}

function setBootState(state, title, sub, pct = 0) {
  if (startupGateEl) startupGateEl.dataset.state = state;
  if (startupTitleEl && title) startupTitleEl.textContent = title;
  if (startupSubEl && sub) startupSubEl.textContent = sub;
  if (startupProgressEl) {
    const clamped = Math.max(0, Math.min(100, pct | 0));
    startupProgressEl.style.width = `${clamped}%`;
  }
  document.body.classList.toggle('boot-locked', state !== 'ready');
}

function setSynced(v) {
  _synced = v;
  if (tabControls) tabControls.classList.toggle('synced', v);
}

function normalizeScriptsView(view) {
  return view === 'advanced' ? 'advanced' : 'simple';
}

function applyScriptsView(view, opts = {}) {
  _scriptsView = normalizeScriptsView(view);
  if (tabScripts) tabScripts.dataset.scriptsView = _scriptsView;
  if (scriptsSimpleViewEl) scriptsSimpleViewEl.classList.toggle('active', _scriptsView === 'simple');
  if (scriptsAdvancedViewEl) scriptsAdvancedViewEl.classList.toggle('active', _scriptsView === 'advanced');
  scriptsViewBtns.forEach(btn => {
    const active = btn.dataset.scriptsView === _scriptsView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (opts.persist !== false) setStoredScriptsView(_scriptsView);
}

function focusAdvancedSlot(slotIdx) {
  const ta = document.getElementById(`slot-code-${slotIdx}`);
  if (!ta) return;
  ta.focus();
  ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setSlotStatus(slotIdx, message) {
  if (slotIdx < 0 || slotIdx >= NUM_SLOTS) return;
  const text = message || '';
  slotUiState[slotIdx].status = text;
  const advancedStatusEl = document.getElementById(`slot-status-${slotIdx}`);
  if (advancedStatusEl) advancedStatusEl.textContent = text;
  const simpleStatusEl = document.getElementById(`simple-slot-status-${slotIdx}`);
  if (simpleStatusEl) simpleStatusEl.textContent = text;
}

function setSlotUploadDisabled(slotIdx, disabled) {
  if (slotIdx < 0 || slotIdx >= NUM_SLOTS) return;
  const finalDisabled = !!disabled;
  slotUiState[slotIdx].uploadDisabled = finalDisabled;
  const advancedBtn = document.getElementById(`slot-upload-${slotIdx}`);
  if (advancedBtn) advancedBtn.disabled = finalDisabled;
  const simpleBtn = document.getElementById(`simple-slot-upload-${slotIdx}`);
  if (simpleBtn) simpleBtn.disabled = finalDisabled;
}

function setSlotDownloadDisabled(slotIdx, disabled) {
  if (slotIdx < 0 || slotIdx >= NUM_SLOTS) return;
  const finalDisabled = !!disabled;
  slotUiState[slotIdx].downloadDisabled = finalDisabled;
  const advancedBtn = document.getElementById(`slot-dl-${slotIdx}`);
  if (advancedBtn) advancedBtn.disabled = finalDisabled;
  const simpleBtn = document.getElementById(`simple-slot-dl-${slotIdx}`);
  if (simpleBtn) simpleBtn.disabled = finalDisabled;
}

function renderSimpleSlot(slotIdx) {
  const card = document.getElementById(`simple-slot-card-${slotIdx}`);
  if (!card) return;
  const slot = slots[slotIdx];
  const selected = slotIdx === _simpleSelectedSlot;
  card.classList.toggle('simple-slot-card--selected', selected);

  const titleEl = document.getElementById(`simple-slot-title-${slotIdx}`);
  const authorEl = document.getElementById(`simple-slot-author-${slotIdx}`);
  const descEl = document.getElementById(`simple-slot-desc-${slotIdx}`);
  const selectBtn = document.getElementById(`simple-slot-select-${slotIdx}`);
  const uploadBtn = document.getElementById(`simple-slot-upload-${slotIdx}`);
  const dlBtn = document.getElementById(`simple-slot-dl-${slotIdx}`);

  if (titleEl) titleEl.textContent = `${simpleSlotLabel(slotIdx)} · ${slot.name}`;
  if (authorEl) authorEl.textContent = slot.author ? `by ${slot.author}` : '';
  if (descEl) descEl.textContent = slot.desc || 'No description yet. Choose a script from the library or import your own.';
  if (selectBtn) {
    selectBtn.textContent = selected ? 'Target slot' : `Target ${simpleSlotLabel(slotIdx)}`;
    selectBtn.classList.toggle('active', selected);
    selectBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  if (uploadBtn) uploadBtn.disabled = slotUiState[slotIdx].uploadDisabled;
  if (dlBtn) dlBtn.disabled = slotUiState[slotIdx].downloadDisabled;
  setSlotStatus(slotIdx, slotUiState[slotIdx].status);
}

function renderAllSimpleSlots() {
  for (let i = 0; i < NUM_SLOTS; i++) renderSimpleSlot(i);
}

function buildSimpleSlots() {
  if (!simpleSlotListEl) return;
  simpleSlotListEl.innerHTML = '';

  for (let i = 0; i < NUM_SLOTS; i++) {
    const card = document.createElement('article');
    card.className = 'simple-slot-card';
    card.id = `simple-slot-card-${i}`;
    card.innerHTML = `
      <div class="simple-slot-head">
        <div class="simple-slot-title" id="simple-slot-title-${i}">${simpleSlotLabel(i)} · ${slots[i].name}</div>
        <div class="simple-slot-author" id="simple-slot-author-${i}">${slots[i].author ? 'by ' + slots[i].author : ''}</div>
      </div>
      <p class="simple-slot-desc" id="simple-slot-desc-${i}">${slots[i].desc || 'No description yet. Choose a script from the library or import your own.'}</p>
      <div class="simple-slot-actions">
        <button type="button" class="simple-slot-select-btn" id="simple-slot-select-${i}" aria-pressed="false">Target ${simpleSlotLabel(i)}</button>
        <button type="button" class="slot-upload-btn" id="simple-slot-upload-${i}">Upload</button>
        <button type="button" class="slot-dl-btn" id="simple-slot-dl-${i}">From device</button>
        <span class="simple-slot-status" id="simple-slot-status-${i}"></span>
      </div>
    `;
    simpleSlotListEl.appendChild(card);

    const selectSlot = () => {
      const prev = _simpleSelectedSlot;
      _simpleSelectedSlot = i;
      renderSimpleSlot(prev);
      renderSimpleSlot(i);
      renderSimpleLibraryDetails();
    };

    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      selectSlot();
    });

    document.getElementById(`simple-slot-select-${i}`).addEventListener('click', selectSlot);

    document.getElementById(`simple-slot-upload-${i}`).addEventListener('click', () => {
      queueUploadScript(i, slots[i].code);
    });

    document.getElementById(`simple-slot-dl-${i}`).addEventListener('click', () => {
      if (!midiOut) {
        setSlotStatus(i, 'No device connected.');
        return;
      }
      queueDownloadScript(i);
    });
  }

  renderAllSimpleSlots();
}

async function fetchScriptText(filePath) {
  if (_scriptTextCache.has(filePath)) return _scriptTextCache.get(filePath);
  const res = await fetch(filePath);
  if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
  const code = await res.text();
  _scriptTextCache.set(filePath, code);
  return code;
}

function getScriptIndexEntry(filePath) {
  return buildScriptIndex().find(item => item.file === filePath) || null;
}

function syncSimpleLibraryActiveIndex(results) {
  if (!results.length) {
    _simpleLibraryActiveIndex = -1;
    return;
  }

  const selectedIdx = results.findIndex(item => item.file === _simpleSelectedScriptFile);
  if (_simpleLibraryActiveIndex < 0 || _simpleLibraryActiveIndex >= results.length) {
    _simpleLibraryActiveIndex = selectedIdx >= 0 ? selectedIdx : 0;
  }
}

function renderSimpleLibraryResults() {
  if (!simpleLibraryResultsEl) return;
  const results = getSimpleLibraryResults();
  syncSimpleLibraryActiveIndex(results);

  simpleLibraryResultsEl.innerHTML = '';
  if (!results.length) {
    simpleLibraryResultsEl.innerHTML = '<div class="simple-library-empty">No scripts match that search yet.</div>';
    return;
  }

  results.forEach((item, idx) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-library-item' + (idx === _simpleLibraryActiveIndex ? ' simple-library-item--active' : '');
    button.innerHTML =
      `<div class="simple-library-name-row">` +
        `<span class="simple-library-name">${item.name}</span>` +
        (item.community ? `<span class="script-result-badge">community</span>` : '') +
      `</div>` +
      (item.author ? `<div class="simple-library-author">by ${item.author}</div>` : '') +
      `<div class="simple-library-desc">${item.desc || 'No short description provided.'}</div>` +
      (item.sound ? `<div class="simple-library-sound">${item.sound}</div>` : '');
    button.addEventListener('click', () => {
      _simpleLibraryActiveIndex = idx;
      selectSimpleLibraryItem(item.file);
    });
    simpleLibraryResultsEl.appendChild(button);
  });
}

function renderSimpleLibraryDetails() {
  const selectedScript = _simpleSelectedScript;
  if (simpleScriptSlotTargetEl) simpleScriptSlotTargetEl.textContent = `Target ${simpleSlotLabel(_simpleSelectedSlot)}`;
  if (simpleUseScriptBtn) {
    simpleUseScriptBtn.textContent = `Use in ${simpleSlotLabel(_simpleSelectedSlot)}`;
    simpleUseScriptBtn.disabled = !selectedScript;
  }

  if (!selectedScript) {
    if (simpleDetailHelpEl) simpleDetailHelpEl.textContent = 'Pick a script to see what it does before assigning it to a slot.';
    if (simpleScriptSourceEl) simpleScriptSourceEl.textContent = '';
    if (simpleScriptNameEl) simpleScriptNameEl.textContent = 'Choose a script';
    if (simpleScriptAuthorEl) simpleScriptAuthorEl.textContent = '';
    if (simpleScriptDescEl) simpleScriptDescEl.textContent = 'Search the library to browse the scripts available on this site.';
    if (simpleScriptSoundEl) simpleScriptSoundEl.textContent = '';
    if (simpleScriptPreviewEl) simpleScriptPreviewEl.value = '';
    return;
  }

  const loading = selectedScript.loading;
  const previewText = selectedScript.error
    ? selectedScript.error
    : (selectedScript.code || (loading ? 'Loading preview…' : 'Preview unavailable.'));

  if (simpleDetailHelpEl) {
    simpleDetailHelpEl.textContent = loading
      ? 'Loading preview…'
      : 'Assign this script to the selected slot, or open advanced to edit the code directly.';
  }
  if (simpleScriptSourceEl) simpleScriptSourceEl.textContent = selectedScript.community ? 'Community' : '';
  if (simpleScriptNameEl) simpleScriptNameEl.textContent = selectedScript.name || 'Script';
  if (simpleScriptAuthorEl) simpleScriptAuthorEl.textContent = selectedScript.author ? `by ${selectedScript.author}` : '';
  if (simpleScriptDescEl) simpleScriptDescEl.textContent = selectedScript.desc || 'No short description provided.';
  if (simpleScriptSoundEl) simpleScriptSoundEl.textContent = selectedScript.sound ? `Sound: ${selectedScript.sound}` : '';
  if (simpleScriptPreviewEl) simpleScriptPreviewEl.value = previewText;
}

async function selectSimpleLibraryItem(filePath) {
  const item = getScriptIndexEntry(filePath);
  if (!item) return;

  _simpleSelectedScriptFile = filePath;
  _simpleSelectedScript = { ...item, author: '', code: '', loading: true, error: '' };
  renderSimpleLibraryResults();
  renderSimpleLibraryDetails();

  try {
    const code = await fetchScriptText(filePath);
    if (_simpleSelectedScriptFile !== filePath) return;
    const meta = parseScriptMeta(code);
    _simpleSelectedScript = {
      ...item,
      name: meta.name || item.name,
      author: meta.author || '',
      desc: meta.desc || item.desc,
      sound: meta.sound || item.sound,
      code,
      loading: false,
      error: '',
    };
  } catch (err) {
    if (_simpleSelectedScriptFile !== filePath) return;
    _simpleSelectedScript = {
      ...item,
      author: '',
      code: '',
      loading: false,
      error: location.protocol === 'file:'
        ? 'Serve via HTTP to load examples (python3 -m http.server).'
        : `Could not load preview: ${err.message}`,
    };
  }

  renderSimpleLibraryResults();
  renderSimpleLibraryDetails();
}

function ensureSimpleLibrarySelection() {
  const index = buildScriptIndex();
  if (!index.length) {
    _simpleSelectedScriptFile = '';
    _simpleSelectedScript = null;
    renderSimpleLibraryResults();
    renderSimpleLibraryDetails();
    return;
  }

  if (_simpleSelectedScriptFile && index.some(item => item.file === _simpleSelectedScriptFile)) {
    selectSimpleLibraryItem(_simpleSelectedScriptFile);
    return;
  }

  selectSimpleLibraryItem(index[0].file);
}

function initSimpleLibrary() {
  renderSimpleLibraryFilters();
  renderSimpleLibraryResults();
  renderSimpleLibraryDetails();

  if (simpleLibrarySearchEl) {
    simpleLibrarySearchEl.addEventListener('input', () => {
      renderSimpleLibraryResults();
    });
    simpleLibrarySearchEl.addEventListener('keydown', e => {
      const results = getSimpleLibraryResults();
      if (!results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _simpleLibraryActiveIndex = Math.min(results.length - 1, _simpleLibraryActiveIndex + 1);
        if (_simpleLibraryActiveIndex < 0) _simpleLibraryActiveIndex = 0;
        renderSimpleLibraryResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _simpleLibraryActiveIndex = Math.max(0, _simpleLibraryActiveIndex - 1);
        renderSimpleLibraryResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = results[Math.max(0, _simpleLibraryActiveIndex)];
        if (picked) selectSimpleLibraryItem(picked.file);
      }
    });
  }

  simpleLibrarySourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      _simpleLibrarySourceFilter = btn.dataset.librarySource || 'all';
      _simpleLibraryActiveIndex = -1;
      renderSimpleLibraryFilters();
      renderSimpleLibraryResults();
    });
  });

  if (simpleLibrarySoundFilterEl) {
    simpleLibrarySoundFilterEl.addEventListener('change', () => {
      _simpleLibrarySoundFilter = simpleLibrarySoundFilterEl.value || 'all';
      _simpleLibraryActiveIndex = -1;
      renderSimpleLibraryResults();
    });
  }

  if (simpleUseScriptBtn) {
    simpleUseScriptBtn.addEventListener('click', async () => {
      if (!_simpleSelectedScriptFile) return;
      await loadScriptIntoSlot(_simpleSelectedSlot, _simpleSelectedScriptFile);
    });
  }

  if (simpleOpenAdvancedBtn) {
    simpleOpenAdvancedBtn.addEventListener('click', () => {
      applyScriptsView('advanced');
      requestAnimationFrame(() => focusAdvancedSlot(_simpleSelectedSlot));
    });
  }

  if (simpleImportFileEl) {
    simpleImportFileEl.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const code = evt.target.result;
        setSlotCode(_simpleSelectedSlot, code);
        setSlotStatus(_simpleSelectedSlot, `Ready — ${slots[_simpleSelectedSlot].name} loaded from ${file.name}`);
      };
      reader.readAsText(file);
      simpleImportFileEl.value = '';
    });
  }

  ensureSimpleLibrarySelection();
}

function sharedSettings() {
  return modeSettings[0];
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-content').forEach(s =>
      s.classList.toggle('active', s.id === 'tab-' + target)
    );
    if (target === 'firmware') checkServerFirmware();
  });
});

scriptsViewBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    applyScriptsView(btn.dataset.scriptsView);
  });
});

applyScriptsView(getStoredScriptsView() || 'simple', { persist: false });

// ---------------------------------------------------------------------------
// Build root select
// ---------------------------------------------------------------------------
function buildRootSelect() {
  for (let oct = 2; oct <= 5; oct++) {
    NOTE_NAMES.forEach((n, i) => {
      const note = oct * 12 + i;
      if (note > 127) return;
      const opt = document.createElement('option');
      opt.value = note;
      opt.textContent = n + oct;
      if (note === 60) opt.selected = true;
      selRoot.appendChild(opt);
    });
  }
}

// ---------------------------------------------------------------------------
// Build slot cards (Scripts tab)
// ---------------------------------------------------------------------------
function buildSlotCards() {
  slotCardsEl.innerHTML = '';
  for (let i = 0; i < NUM_SLOTS; i++) {
    const card = document.createElement('article');
    card.className = 'slot-card';
    card.dataset.slot = i;

    card.innerHTML = `
      <div class="slot-header">
        <span class="slot-num">Slot ${i}</span>
        <span class="slot-name" id="slot-name-${i}">${slots[i].name}</span>
        <span class="slot-author" id="slot-author-${i}">${slots[i].author ? 'by ' + slots[i].author : ''}</span>
      </div>
      <p class="slot-desc" id="slot-desc-${i}">${slots[i].desc}</p>
      <div class="slot-picker">
        <div class="script-search-wrap">
          <input type="text" class="script-search" id="slot-search-${i}"
            placeholder="search scripts…" autocomplete="off" spellcheck="false">
          <ul class="script-results" id="slot-results-${i}"></ul>
        </div>
        <label class="file-label">browse… <input type="file" accept=".js" id="slot-file-${i}"></label>
      </div>
      <textarea class="slot-code" id="slot-code-${i}" spellcheck="false" autocomplete="off"
        placeholder="// Load a script above or paste your own here…"></textarea>
      <div class="slot-safety" id="slot-safety-${i}"></div>
      <div class="slot-footer">
        <button class="slot-upload-btn" id="slot-upload-${i}">Upload to device</button>
        <button class="slot-dl-btn" id="slot-dl-${i}">From device</button>
        <span class="slot-status" id="slot-status-${i}"></span>
      </div>
    `;

    slotCardsEl.appendChild(card);

    // Script search
    initSearchForSlot(i);

    // File browser
    document.getElementById(`slot-file-${i}`).addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const code = evt.target.result;
        setSlotCode(i, code);
      };
      reader.readAsText(file);
    });

    // Live textarea edit — re-parse metadata
    document.getElementById(`slot-code-${i}`).addEventListener('input', () => {
      const code = document.getElementById(`slot-code-${i}`).value;
      applySlotMeta(i, parseScriptMeta(code));
      renderSlotSafety(i, code);
    });

    // Upload button
    document.getElementById(`slot-upload-${i}`).addEventListener('click', () => {
      const code = document.getElementById(`slot-code-${i}`).value;
      queueUploadScript(i, code);
    });

    // Download from device button
    document.getElementById(`slot-dl-${i}`).addEventListener('click', () => {
      if (!midiOut) { setSlotStatus(i, 'No device connected.'); return; }
      queueDownloadScript(i);
    });

    setSlotStatus(i, slotUiState[i].status);
    setSlotUploadDisabled(i, slotUiState[i].uploadDisabled);
    setSlotDownloadDisabled(i, slotUiState[i].downloadDisabled);
  }
}

async function loadScriptIntoSlot(slotIdx, filePath) {
  try {
    const code = await fetchScriptText(filePath);
    setSlotCode(slotIdx, code);
    setSlotStatus(slotIdx, `Ready — ${slots[slotIdx].name} loaded`);
  } catch (err) {
    const isFile = location.protocol === 'file:';
    setSlotStatus(slotIdx, isFile
      ? 'Serve via HTTP to load examples (python3 -m http.server).'
      : 'Could not load: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Script search — builds the full index and wires up the search UI per slot
// ---------------------------------------------------------------------------
function buildScriptIndex() {
  const thawney = _thawneyModes.map(m => ({
    name: m.name, file: `modes/${m.file}`,
    desc: m.desc || '', sound: m.sound || '', author: m.author || '', community: false,
  }));
  const community = _userModes.map(m => ({
    name: m.name, file: `user-modes/${m.file}`,
    desc: m.desc || '', sound: m.sound || '', author: m.author || '', community: true,
  }));
  return [...thawney, ...community];
}

function filterScripts(query, options = {}) {
  const index = buildScriptIndex();
  const source = options.source || 'all';
  const sound = options.sound || 'all';
  const q = (query || '').trim().toLowerCase();

  return index.filter(m => {
    if (source === 'built-in' && m.community) return false;
    if (source === 'community' && !m.community) return false;
    if (sound !== 'all' && getSoundFilterValue(m.sound) !== sound) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.desc.toLowerCase().includes(q) ||
      m.sound.toLowerCase().includes(q) ||
      m.author.toLowerCase().includes(q)
    );
  });
}

function getSimpleLibraryResults() {
  return filterScripts(simpleLibrarySearchEl ? simpleLibrarySearchEl.value : '', {
    source: _simpleLibrarySourceFilter,
    sound: _simpleLibrarySoundFilter,
  });
}

function getSoundFilterValue(sound) {
  const raw = (sound || '').trim();
  if (!raw) return 'none';

  const lower = raw.toLowerCase();
  if (lower === 'none' || lower === 'none - visual only') return 'none';
  if (/\bpad\b/.test(lower)) return 'pad';
  if (/\barp\b/.test(lower)) return 'arp';
  if (/\bbell\b/.test(lower)) return 'bell';
  if (/\bpluck(?:ed)?\b/.test(lower)) return 'pluck';
  if (/\brhodes\b/.test(lower)) return 'rhodes';
  if (/\bmarimba\b/.test(lower)) return 'marimba';
  if (/\bchoir\b/.test(lower)) return 'choir';
  if (/\borgan\b/.test(lower)) return 'organ';
  if (/\bflute\b/.test(lower)) return 'flute';
  if (/\bglass\b/.test(lower)) return 'glass';
  if (/\bkalimba\b/.test(lower)) return 'kalimba';
  if (/\bharp\b/.test(lower)) return 'harp';
  if (/\blead\b/.test(lower)) return 'lead';
  if (/\bstring\b/.test(lower)) return 'string';

  return raw.split('/')[0].trim().toLowerCase();
}

function getSoundFilterLabel(value) {
  const labels = {
    none: 'None',
    pad: 'Pad',
    arp: 'Arp',
    bell: 'Bell',
    pluck: 'Pluck',
    rhodes: 'Rhodes',
    marimba: 'Marimba',
    choir: 'Choir',
    organ: 'Organ',
    flute: 'Flute',
    glass: 'Glass',
    kalimba: 'Kalimba',
    harp: 'Harp',
    lead: 'Lead',
    string: 'String',
  };
  if (labels[value]) return labels[value];
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSimpleLibrarySounds() {
  return Array.from(new Set(
    buildScriptIndex()
      .map(item => getSoundFilterValue(item.sound))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function renderSimpleLibraryFilters() {
  simpleLibrarySourceBtns.forEach(btn => {
    const active = btn.dataset.librarySource === _simpleLibrarySourceFilter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (!simpleLibrarySoundFilterEl) return;
  const sounds = getSimpleLibrarySounds();
  const prev = _simpleLibrarySoundFilter;
  simpleLibrarySoundFilterEl.innerHTML = '<option value="all">All sounds</option>';
  sounds.forEach(sound => {
    const opt = document.createElement('option');
    opt.value = sound;
    opt.textContent = getSoundFilterLabel(sound);
    simpleLibrarySoundFilterEl.appendChild(opt);
  });
  simpleLibrarySoundFilterEl.value = sounds.includes(prev) ? prev : 'all';
  _simpleLibrarySoundFilter = simpleLibrarySoundFilterEl.value;
}

function renderSearchResults(slotIdx, results) {
  const ul = document.getElementById(`slot-results-${slotIdx}`);
  if (!ul) return;
  ul.innerHTML = '';
  if (!results.length) {
    ul.innerHTML = '<li class="script-result-empty">no scripts found</li>';
    ul.classList.add('open');
    return;
  }
  results.forEach(m => {
    const li = document.createElement('li');
    li.className = 'script-result' + (m.community ? ' script-result--community' : '');
    li.innerHTML =
      `<span class="script-result-name">${m.name}</span>` +
      (m.community ? `<span class="script-result-badge">community</span>` : '') +
      (m.desc  ? `<span class="script-result-desc">${m.desc}</span>` : '') +
      (m.sound ? `<span class="script-result-sound">${m.sound}</span>` : '');
    li.addEventListener('mousedown', async e => {
      e.preventDefault(); // keep focus so blur doesn't fire first
      const input = document.getElementById(`slot-search-${slotIdx}`);
      if (input) input.value = '';
      hideSearchResults(slotIdx);
      const prev = _simpleSelectedSlot;
      _simpleSelectedSlot = slotIdx;
      renderSimpleSlot(prev);
      renderSimpleSlot(slotIdx);
      selectSimpleLibraryItem(m.file);
      await loadScriptIntoSlot(slotIdx, m.file);
    });
    ul.appendChild(li);
  });
  ul.classList.add('open');
}

function hideSearchResults(slotIdx) {
  const ul = document.getElementById(`slot-results-${slotIdx}`);
  if (ul) ul.classList.remove('open');
}

function initSearchForSlot(slotIdx) {
  const input = document.getElementById(`slot-search-${slotIdx}`);
  if (!input) return;

  input.addEventListener('focus', () => {
    renderSearchResults(slotIdx, filterScripts(input.value));
  });
  input.addEventListener('input', () => {
    renderSearchResults(slotIdx, filterScripts(input.value));
  });
  input.addEventListener('blur', () => {
    // small delay so mousedown on a result fires first
    setTimeout(() => hideSearchResults(slotIdx), 150);
  });
  input.addEventListener('keydown', e => {
    const ul = document.getElementById(`slot-results-${slotIdx}`);
    if (!ul) return;
    const items = ul.querySelectorAll('.script-result');
    const active = ul.querySelector('.script-result--active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = active ? active.nextElementSibling : items[0];
      if (active) active.classList.remove('script-result--active');
      if (next && next.classList.contains('script-result')) next.classList.add('script-result--active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = active ? active.previousElementSibling : null;
      if (active) active.classList.remove('script-result--active');
      if (prev && prev.classList.contains('script-result')) prev.classList.add('script-result--active');
    } else if (e.key === 'Enter') {
      if (active) { active.dispatchEvent(new MouseEvent('mousedown')); input.blur(); }
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
}

function setSlotCode(slotIdx, code) {
  slots[slotIdx].code = code;
  const meta = parseScriptMeta(code);
  applySlotMeta(slotIdx, meta);
  const ta = document.getElementById(`slot-code-${slotIdx}`);
  if (ta) ta.value = code;
  renderSlotSafety(slotIdx, code);
}

function updateSlotDisplay(slotIdx) {
  const slot = slots[slotIdx];
  const nameEl   = document.getElementById(`slot-name-${slotIdx}`);
  const authorEl = document.getElementById(`slot-author-${slotIdx}`);
  const descEl   = document.getElementById(`slot-desc-${slotIdx}`);
  if (nameEl)   nameEl.textContent   = slot.name;
  if (authorEl) authorEl.textContent = slot.author ? `by ${slot.author}` : '';
  if (descEl)   descEl.textContent   = slot.desc;

  const pill = pillsEl.querySelector(`[data-idx="${slotIdx}"]`);
  if (pill) pill.textContent = slot.name;

  if (slotIdx === currentSlot) {
    lblParam.textContent = slot.paramLabel;
    modeDescEl.textContent = slot.desc;
  }

  renderSimpleSlot(slotIdx);
}

function applySlotMeta(slotIdx, meta) {
  slots[slotIdx].name       = meta.name;
  slots[slotIdx].author     = meta.author;
  slots[slotIdx].paramLabel = meta.paramLabel;
  slots[slotIdx].desc       = meta.desc;
  updateSlotDisplay(slotIdx);
}

// ---------------------------------------------------------------------------
// Build mode pills (Controls tab — 4 pills from slot metadata)
// ---------------------------------------------------------------------------
function buildModePills() {
  pillsEl.innerHTML = '';
  for (let i = 0; i < NUM_SLOTS; i++) {
    const btn = document.createElement('button');
    btn.className = 'mode-pill' + (i === 0 ? ' active' : '');
    btn.textContent = slots[i].name;
    btn.dataset.idx = i;
    btn.addEventListener('click', () => {
      if (i === currentSlot) { reshuffleCurrentSlot(); return; }
      selectSlot(i, true);
    });
    pillsEl.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// MIDI
// ---------------------------------------------------------------------------
async function initMidi() {
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    midiAccess.onstatechange = populatePorts;
    populatePorts();
    setStatus('WebMIDI ready — select your device');
  } catch (e) {
    setStatus('WebMIDI failed: ' + e.message);
  }
}

function populatePorts() {
  const prev = selPort.value;
  selPort.innerHTML = '<option value="">-- none --</option>';

  // Show ALL output ports — input/output port names can differ on some OS/browsers
  midiAccess.outputs.forEach(p => {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = p.name;
    selPort.appendChild(o);
  });

  selPort.value = prev;

  // Auto-select if exactly one output and nothing previously chosen
  if (!selPort.value) {
    const opts = selPort.querySelectorAll('option[value]:not([value=""])');
    if (opts.length === 1) selPort.value = opts[0].value;
  }

  bindPorts();
}

// Strip OS-appended suffixes before comparing port names
function _normPort(name) {
  return name.replace(/\s+(Input|Output|MIDI)\s*\d*$/i, '').trim();
}

function scheduleStartupSync() {
  if (_startupSyncTimer) clearTimeout(_startupSyncTimer);
  const epoch = _portEpoch;
  _startupSyncTimer = setTimeout(() => {
    _startupSyncTimer = null;
    if (epoch !== _portEpoch) return;
    runStartupSync(false);
  }, 450);
}

function bindPorts() {
  _portEpoch++;
  if (midiIn) midiIn.onmidimessage = null;
  midiIn  = null;
  midiOut = null;
  _rxInSysEx = false;
  _rxBuf = [];
  if (_pendingAck && _pendingAck.timer) clearTimeout(_pendingAck.timer);
  _pendingAck = null;
  _fwAckQueue = [];
  _fwAckWaiter = null;
  clearActiveDownload();
  _slotNamesSeenMask = 0;
  setSynced(false);
  _clockState = { external: false, running: false, usingExternal: false, bpmX10: 1200 };
  renderClockInfo();

  const name = selPort.value;
  if (name) {
    // Output: exact match
    midiAccess.outputs.forEach(p => { if (p.name === name) midiOut = p; });

    // Input: exact name first, then normalised name, then only-one fallback
    midiAccess.inputs.forEach(p => {
      if (p.name === name) midiIn = p;
    });
    if (!midiIn) {
      const normOut = _normPort(name);
      midiAccess.inputs.forEach(p => {
        if (!midiIn && _normPort(p.name) === normOut) midiIn = p;
      });
    }
    if (!midiIn && midiAccess.inputs.size === 1) {
      midiIn = midiAccess.inputs.values().next().value;
    }
  }

  if (midiIn) midiIn.onmidimessage = onMidiMessage;

  if (midiOut && midiIn) {
    setStatus('Connected — syncing from device…');
    setBootState('loading', 'Loading from device…', 'Reading settings and scripts from flash.', 2);
    scheduleStartupSync();
  } else if (midiOut) {
    if (_startupSyncTimer) { clearTimeout(_startupSyncTimer); _startupSyncTimer = null; }
    setStatus('Output connected — no matching MIDI input found');
    setBootState('awaiting', 'Select device to begin', 'Pick the matching MIDI input/output pair.');
  } else {
    if (_startupSyncTimer) { clearTimeout(_startupSyncTimer); _startupSyncTimer = null; }
    setBootState('awaiting', 'Select device to begin', 'Choose your Shimmer MIDI port.');
  }
}

selPort.addEventListener('change', () => {
  bindPorts();
});
btnRefresh.addEventListener('click', populatePorts);

if (btnReadDevice) btnReadDevice.addEventListener('click', () => {
  if (!midiOut || !midiIn) { setStatus('Select a device first'); return; }
  setBootState('loading', 'Loading from device…', 'Reading settings and scripts from flash.', 2);
  runStartupSync(true);
});

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
function send(bytes) {
  if (!midiOut) { setStatus('Select a device first'); return false; }
  midiOut.send(new Uint8Array([0xF0, MFR, ...bytes, 0xF7]));
  return true;
}

function sendParam(modeIdx, paramId, value) {
  const v = value & 0xFF;
  send([CMD_SET, VER, modeIdx & 0x7F, paramId, (v >> 7) & 0x01, v & 0x7F]);
}

function sendSwitchMode(idx) {
  return send([CMD_SET, VER, 0x00, P_G_MODE, 0x00, idx & 0x7F]);
}

function switchSlotWithSync(idx) {
  if (!sendSwitchMode(idx)) return false;

  _awaitingModeSwitchAck = true;
  clearTimeout(_modeSwitchAckTimer);
  _modeSwitchAckTimer = setTimeout(() => {
    if (!_awaitingModeSwitchAck) return;
    _awaitingModeSwitchAck = false;
    requestSettingsRefresh();
  }, 180);

  return true;
}

function requestSettingsRefresh() {
  if (!midiOut) return;
  send([CMD_GET, VER]);
  setTimeout(() => send([CMD_GET, VER]), 220);
  setTimeout(() => send([CMD_GET, VER]), 640);
}

async function runStartupSync(force) {
  if (!midiOut || !midiIn) return;
  if (_startupSyncInFlight) {
    if (force) setStatus('Sync already running…');
    return;
  }

  const epoch = _portEpoch;
  _startupSyncInFlight = true;
  const totalSteps = NUM_SLOTS + 1; // metadata + 4 scripts

  try {
    _slotNamesSeenMask = 0;
    setBootState('loading', 'Loading from device…', 'Reading settings and slot names…', 4);
    setStatus('Reading device…');
    send([CMD_GET, VER]);
    setTimeout(() => {
      if (epoch !== _portEpoch || !midiOut) return;
      send([CMD_GET_SLOT_NAMES, VER]);
    }, 200);

    // Wait until all slot-name frames arrive (or timeout) before script pulls.
    const allNamesMask = (1 << NUM_SLOTS) - 1;
    const t0 = Date.now();
    while (_slotNamesSeenMask !== allNamesMask && (Date.now() - t0) < 1800) {
      if (epoch !== _portEpoch || !midiOut) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    // Small settle window so the last incoming SysEx is fully processed.
    await new Promise(resolve => setTimeout(resolve, 120));
    setBootState('loading', 'Loading from device…', 'Reading scripts 0/4…', Math.round((1 / totalSteps) * 100));

    let allScriptsOk = true;
    let completed = 1;
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (epoch !== _portEpoch || !midiOut) return;
      setBootState(
        'loading',
        'Loading from device…',
        `Reading scripts ${i + 1}/${NUM_SLOTS}…`,
        Math.round((completed / totalSteps) * 100)
      );
      // One retry per slot makes first-connect sync robust on slower host stacks.
      let ok = await queueDownloadScript(i);
      if (!ok) {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (epoch !== _portEpoch || !midiOut) return;
        ok = await queueDownloadScript(i);
      }
      allScriptsOk = allScriptsOk && ok;
      completed++;
      setBootState(
        'loading',
        'Loading from device…',
        `Reading scripts ${Math.min(completed - 1, NUM_SLOTS)}/${NUM_SLOTS}…`,
        Math.round((completed / totalSteps) * 100)
      );
    }

    if (epoch === _portEpoch) {
      setBootState('ready', 'Ready', '', 100);
      setStatus(allScriptsOk
        ? 'Synced — scripts loaded from device'
        : 'Synced — some scripts failed to download');
    }
  } finally {
    _startupSyncInFlight = false;
  }
}

function sendModeEnabled() {
  const lo7 = modeEnabled & 0x7F;
  const mid7 = (modeEnabled >> 7) & 0x7F;
  const hi2 = (modeEnabled >> 14) & 0x03;
  send([SYSEX_SET_MODE_ENABLED, VER, lo7, mid7, hi2]);
}

function reshuffleCurrentSlot() {
  if (!midiOut) { setStatus('Select a device first'); return; }

  const density = Math.floor(Math.random() * 256);
  const speed   = Math.floor(Math.random() * 256);

  modeSettings[currentSlot].density = density;
  modeSettings[currentSlot].speed   = speed;
  slParam.value  = density;
  outParam.value = density;

  sendParam(currentSlot, P_DENSITY, density);
  sendParam(currentSlot, P_SPEED, speed);
  scheduleSave();
  setStatus(`Reshuffled — ${slots[currentSlot].name}`);
}

function randomizeKey() {
  if (!midiOut) { setStatus('Select a device first'); return; }

  const scale = Math.floor(Math.random() * SCALE_NAMES.length);
  const root  = 48 + Math.floor(Math.random() * 12); // C3–B3

  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].scale = scale;
    modeSettings[i].rootNote = root;
    sendParam(i, P_SCALE, scale);
    sendParam(i, P_ROOT, root & 0x7F);
  }

  selectSlot(currentSlot, false);
  scheduleSave();
  setStatus(`Randomized key — ${formatMidiNoteName(root)} ${SCALE_NAMES[scale] ?? '?'}`);
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (send([CMD_SAVE, VER])) setStatus('Settings saved');
  }, 1500);
}

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------
function handleSysExFrame(data) {
  if (data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) return;
  if (data[1] !== MFR) return;
  const cmd = data[2];

  if (cmd === CMD_ACK && data.length >= 7) {
    const acked  = data[4] & 0x7F;
    const status = data[5] & 0x7F;
    if (acked === SYSEX_FW_CHUNK) {
      // Pipelined path: FW_CHUNK acks feed the window queue, not _pendingAck
      if (_fwAckWaiter) { const w = _fwAckWaiter; _fwAckWaiter = null; w(status); }
      else { _fwAckQueue.push(status); }
    } else {
      if (_pendingAck && _pendingAck.cmd === acked) {
        const { timer, resolve, reject, cmd, meta } = _pendingAck;
        _pendingAck = null;
        clearTimeout(timer);
        if (status === 0x00) resolve();
        else reject(new Error(formatAckError(cmd, status, meta)));
      }
      if (acked === CMD_GET_SCRIPT && status !== 0x00 && _dlReject) {
        failActiveDownload(formatAckError(acked, status));
      }
      if (_awaitingModeSwitchAck && acked === CMD_SET) {
        _awaitingModeSwitchAck = false;
        clearTimeout(_modeSwitchAckTimer);
        if (status === 0x00) requestSettingsRefresh();
      }
    }
    return;
  }

  if (cmd === CMD_DUMP) {
    const payload = Array.from(data.slice(4, -1));
    const raw = decode7to8(payload);

    if (raw.length < GLOBAL_SIZE) {
      setStatus(`Dump too short: ${raw.length} bytes (expected ${GLOBAL_SIZE}). Reflash firmware.`);
      return;
    }

    parseGlobalSettings(raw);
    return;
  }

  if (cmd === CMD_KEY && data.length >= 7) {
    const scale = data[4] & 0x7F;
    const root  = data[5] & 0x7F;
    for (let i = 0; i < NUM_MODES_TOTAL; i++) {
      modeSettings[i].scale = scale;
      modeSettings[i].rootNote = root;
    }
    selectSlot(currentSlot, false);
    setStatus(`Synced key — ${formatMidiNoteName(root)} ${SCALE_NAMES[scale] ?? '?'}`);
    return;
  }

  if (cmd === CMD_MODE && data.length >= 7) {
    const modeIdx = data[4] & 0x7F;
    if (modeIdx >= NUM_MODES_TOTAL) return;
    const raw = decode7to8(Array.from(data.slice(5, -1)));
    if (raw.length < MODE_SIZE) return;
    const midiInCfg = decodeMidiInConfig(raw[5]);
    modeSettings[modeIdx] = {
      scale:       raw[0],
      rootNote:    raw[1],
      tempo:       raw[2],
      brightness:  raw[3],
      midiChannel: raw[4],
      midiInChannel: midiInCfg.midiInChannel,
      clockIn: midiInCfg.clockIn,
      clockPriority: midiInCfg.clockPriority,
      clockOut: midiInCfg.clockOut,
      density:     raw[6],
      speed:       raw[7],
    };
    selectSlot(currentSlot, false);
    setStatus(`Synced — ${_thawneyModes[modeIdx]?.name ?? ('mode ' + modeIdx)}`);
    return;
  }

  if (cmd === CMD_CLOCK && data.length >= 8) {
    const flags = data[4] & 0x7F;
    const bpmX10 = ((data[5] & 0x7F) << 7) | (data[6] & 0x7F);
    _clockState.external = (flags & 0x01) !== 0;
    _clockState.running = (flags & 0x02) !== 0;
    _clockState.usingExternal = (flags & 0x04) !== 0;
    _clockState.bpmX10 = bpmX10 > 0 ? bpmX10 : _clockState.bpmX10;
    renderClockInfo();
    return;
  }

  if (cmd === CMD_SLOT_NAMES && data.length >= 7) {
    // Per-slot message: data[4] = slot index, data.slice(5,-1) = ASCII name bytes
    const slot = data[4] & 0x0F;
    if (slot < NUM_SLOTS) {
      _slotNamesSeenMask |= (1 << slot);
      const nameBytes = Array.from(data.slice(5, -1));
      const nullAt = nameBytes.indexOf(0);
      const name = String.fromCharCode(...(nullAt >= 0 ? nameBytes.slice(0, nullAt) : nameBytes)).trim();
      if (name) {
        slots[slot].name = name;
        updateSlotDisplay(slot);
      }
      const allNamesMask = (1 << NUM_SLOTS) - 1;
      if (_slotNamesSeenMask === allNamesMask) {
        if (!_synced) {
          // Fallback unlock: settings dump may have been lost, but names prove round-trip comms.
          setSynced(true);
          selectSlot(currentSlot, false);
          setStatus('Synced — slot names from device (settings dump missing)');
        } else {
          setStatus('Synced — slot names from device');
        }
      }
    }
    return;
  }

  if (cmd === CMD_SCRIPT_READ_BEGIN && data.length >= 8) {
    const rxSlot = data[4] & 0x0F;
    if (_dlSlot >= 0 && rxSlot !== _dlSlot) return;
    _dlSlot = rxSlot;
    const lenHi = data[5] & 0x7F;
    const lenLo = data[6] & 0x7F;
    _dlExpectedLen = (lenHi << 7) | lenLo;
    _dlBuf = [];
    setSlotStatus(_dlSlot, 'Downloading…');
    return;
  }

  if (cmd === CMD_SCRIPT_READ_CHUNK && _dlSlot >= 0) {
    // seqHi=data[4], seqLo=data[5], encoded=data.slice(6,-1)
    const decoded = decode7to8(Array.from(data.slice(6, -1)));
    _dlBuf.push(...decoded);
    const pct = _dlExpectedLen > 0 ? Math.min(100, Math.round(_dlBuf.length / _dlExpectedLen * 100)) : 0;
    setSlotStatus(_dlSlot, `Downloading… ${pct}%`);
    return;
  }

  if (cmd === CMD_SCRIPT_READ_END && _dlSlot >= 0) {
    const completedSlot = _dlSlot;
    const text = new TextDecoder().decode(new Uint8Array(_dlBuf.slice(0, _dlExpectedLen)));
    setSlotCode(completedSlot, text);
    setSlotStatus(completedSlot, `Done — ${slots[completedSlot].name}`);
    setStatus(`Downloaded ${simpleSlotLabel(completedSlot)} from device`);
    if (_dlResolve) _dlResolve();
    clearActiveDownload();
    return;
  }

  if (cmd === SYSEX_FW_STATUS && data.length >= 9) {
    const status = data[4] & 0x7F;
    const bytes  = ((data[5] & 0x7F) << 14) | ((data[6] & 0x7F) << 7) | (data[7] & 0x7F);
    if (status === FW_STATUS_DONE) {
      if (_fwTimer) { clearTimeout(_fwTimer); _fwTimer = null; }
      const resolve = _fwResolve;
      _fwResolve = null; _fwReject = null;
      if (resolve) resolve(bytes);
    } else if (status === FW_STATUS_ERROR) {
      if (_fwTimer) { clearTimeout(_fwTimer); _fwTimer = null; }
      const reject = _fwReject;
      _fwResolve = null; _fwReject = null;
      if (reject) reject(new Error('Device reported OTA verification failure'));
    } else if (status === FW_STATUS_PROGRESS) {
      const bar = document.getElementById('fw-progress-bar');
      const sta = document.getElementById('fw-status');
      if (bar && _fwTotalBytes > 0) {
        bar.style.width = Math.round(Math.min(bytes / _fwTotalBytes, 0.95) * 100) + '%';
      }
      if (sta && _fwTotalBytes > 0) {
        sta.textContent = `Flashing… ${Math.round(bytes / _fwTotalBytes * 100)}%`;
      }
    }
    return;
  }
}

function onMidiMessage(event) {
  const data = event.data;
  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    if (b === 0xF0) { _rxInSysEx = true; _rxBuf = [b]; continue; }
    if (!_rxInSysEx) continue;
    _rxBuf.push(b);
    if (b === 0xF7) {
      handleSysExFrame(_rxBuf);
      _rxInSysEx = false;
      _rxBuf = [];
    }
  }
}

function parseGlobalSettings(raw) {
  const devMode = raw[1];
  for (let i = 0; i < NUM_MODES_TOTAL; i++) {
    const b = GLOBAL_HEADER + i * MODE_SIZE;
    const midiInCfg = decodeMidiInConfig(raw[b + 5]);
    modeSettings[i] = {
      scale:       raw[b + 0],
      rootNote:    raw[b + 1],
      tempo:       raw[b + 2],
      brightness:  raw[b + 3],
      midiChannel: raw[b + 4],
      midiInChannel: midiInCfg.midiInChannel,
      clockIn: midiInCfg.clockIn,
      clockPriority: midiInCfg.clockPriority,
      clockOut: midiInCfg.clockOut,
      density:     raw[b + 6],
      speed:       raw[b + 7],
    };
  }

  // Enforce 4-slot mode enable: always restrict to slots 0-3
  modeEnabled = 0x000F;
  sendModeEnabled();

  const activeSlot = devMode < NUM_SLOTS ? devMode : 0;
  setSynced(true);
  setStatus(`Synced — device on ${slots[activeSlot]?.name ?? 'slot ' + activeSlot}`);
  selectSlot(activeSlot, false);
}

// ---------------------------------------------------------------------------
// Slot selection (Controls tab)
// ---------------------------------------------------------------------------
function selectSlot(idx, sendToDevice) {
  const clamped = Math.max(0, Math.min(NUM_SLOTS - 1, idx));
  currentSlot = clamped;

  document.querySelectorAll('.mode-pill').forEach(p =>
    p.classList.toggle('active', parseInt(p.dataset.idx) === clamped)
  );

  lblParam.textContent = slots[clamped].paramLabel;
  modeDescEl.textContent = slots[clamped].desc;

  const shared = sharedSettings();
  const mode   = modeSettings[clamped];
  selScale.value   = shared.scale;
  selRoot.value    = shared.rootNote;
  slTempo.value    = tempoStoredToBpm(shared.tempo);
  outTempo.value   = tempoStoredToBpm(shared.tempo);
  if (!_clockState.external) {
    _clockState.bpmX10 = tempoStoredToBpm(shared.tempo) * 10;
    renderClockInfo();
  }
  slBright.value   = shared.brightness;
  outBright.value  = shared.brightness;
  selChan.value    = shared.midiChannel;
  selInChan.value  = shared.midiInChannel;
  selClockMode.value = clockModeForSettings(shared);
  renderClockModeHelp(selClockMode.value);
  slParam.value    = mode.density;
  outParam.value   = mode.density;

  updateKeyInfo();
  if (sendToDevice) switchSlotWithSync(clamped);
}

function updateKeyInfo() {
  const s = sharedSettings();
  const name  = formatMidiNoteName(s.rootNote);
  const scale = SCALE_NAMES[s.scale] ?? '?';
  keyInfoEl.textContent = name + ' ' + scale;
}

// ---------------------------------------------------------------------------
// Param controls
// ---------------------------------------------------------------------------
selScale.addEventListener('change', () => {
  const v = parseInt(selScale.value);
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].scale = v;
    sendParam(i, P_SCALE, v);
  }
  updateKeyInfo();
  scheduleSave();
});

selRoot.addEventListener('change', () => {
  const note = parseInt(selRoot.value);
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].rootNote = note;
    sendParam(i, P_ROOT, note & 0x7F);
  }
  updateKeyInfo();
  scheduleSave();
});

selChan.addEventListener('change', () => {
  const v = parseInt(selChan.value);
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].midiChannel = v;
    sendParam(i, P_CHANNEL, v);
  }
  scheduleSave();
});

selInChan.addEventListener('change', () => {
  const v = parseInt(selInChan.value);
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].midiInChannel = v;
    sendParam(i, P_IN_CHANNEL, packMidiInConfig(modeSettings[i]));
  }
  scheduleSave();
});

selClockMode.addEventListener('change', () => {
  const v = selClockMode.value;
  for (let i = 0; i < NUM_SLOTS; i++) {
    applyClockMode(modeSettings[i], v);
    sendParam(i, P_IN_CHANNEL, packMidiInConfig(modeSettings[i]));
  }
  renderClockModeHelp(v);
  scheduleSave();
});

slTempo.addEventListener('input', () => {
  const bpm = parseInt(slTempo.value);
  const stored = bpmToTempoStored(bpm);
  outTempo.value = tempoStoredToBpm(stored);
  if (!_clockState.external) {
    _clockState.bpmX10 = tempoStoredToBpm(stored) * 10;
    renderClockInfo();
  }
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].tempo = stored;
    sendParam(i, P_TEMPO, stored);
  }
  scheduleSave();
});

slBright.addEventListener('input', () => {
  const v = parseInt(slBright.value);
  outBright.value = v;
  for (let i = 0; i < NUM_SLOTS; i++) {
    modeSettings[i].brightness = v;
    sendParam(i, P_BRIGHTNESS, v);
  }
  scheduleSave();
});

slParam.addEventListener('input', () => {
  const v = parseInt(slParam.value);
  outParam.value = v;
  modeSettings[currentSlot].density = v;
  sendParam(currentSlot, P_DENSITY, v);
  scheduleSave();
});

if (btnRandomizeKey) btnRandomizeKey.addEventListener('click', randomizeKey);

// ---------------------------------------------------------------------------
// Script upload (per-slot)
// ---------------------------------------------------------------------------
// Script upload chunk size. 3000 raw bytes → 3429 encoded bytes → 3435-byte
// SysEx msg — comfortably within the device's 8192-byte SysEx receive buffer.
// Matches the decoded[3100] buffer in SysExHandler.cpp.
const CHUNK_BYTES = 3000;
const SCRIPT_BEGIN_ACK_TIMEOUT_MS = 2500;
const SCRIPT_CHUNK_ACK_TIMEOUT_MS = 2500;
const SCRIPT_END_ACK_TIMEOUT_MS = 3000;

function queueScriptTransfer(slotIdx, label, run) {
  if (_scriptTransferDepth > 0) setSlotStatus(slotIdx, `${label} queued…`);

  _scriptTransferDepth++;
  const op = _scriptTransferChain.then(async () => {
    try {
      return await run();
    } finally {
      _scriptTransferDepth = Math.max(0, _scriptTransferDepth - 1);
    }
  });
  _scriptTransferChain = op.catch(() => {});
  return op;
}

function clearActiveDownload() {
  if (_dlTimer) clearTimeout(_dlTimer);
  _dlTimer = null;
  _dlResolve = null;
  _dlReject = null;
  _dlSlot = -1;
  _dlBuf = [];
  _dlExpectedLen = 0;
}

function failActiveDownload(message) {
  const reject = _dlReject;
  clearActiveDownload();
  if (reject) reject(new Error(message));
}

function waitAck(cmd, timeoutMs = 1200, meta = null) {
  return new Promise((resolve, reject) => {
    if (_pendingAck) {
      reject(new Error(`Internal ACK waiter conflict (waiting for 0x${_pendingAck.cmd.toString(16)})`));
      return;
    }
    const timer = setTimeout(() => {
      _pendingAck = null;
      reject(new Error(`ACK timeout (cmd 0x${cmd.toString(16)})`));
    }, timeoutMs);
    _pendingAck = { cmd, timer, resolve, reject, meta };
  });
}

async function sendAndWaitAck(bytes, ackCmd, timeoutMs = 1200, meta = null) {
  const ackPromise = waitAck(ackCmd, timeoutMs, meta);
  send(bytes);
  await ackPromise;
}

// Windowed ACK wait for FW_CHUNK — consumes from _fwAckQueue
function waitFwChunkAck(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (_fwAckQueue.length > 0) {
      const status = _fwAckQueue.shift();
      if (status === 0x00) { resolve(); return; }
      reject(new Error(`Device error 0x${status.toString(16)} flashing chunk`));
      return;
    }
    const timer = setTimeout(() => {
      _fwAckWaiter = null;
      reject(new Error('Chunk ACK timeout'));
    }, timeoutMs);
    _fwAckWaiter = (status) => {
      clearTimeout(timer);
      if (status === 0x00) resolve();
      else reject(new Error(`Device error 0x${status.toString(16)} flashing chunk`));
    };
  });
}

function queueUploadScript(slotIdx, scriptText) {
  return queueScriptTransfer(slotIdx, 'Upload', () => uploadScript(slotIdx, scriptText));
}

function queueDownloadScript(slotIdx) {
  return queueScriptTransfer(slotIdx, 'Download', () => downloadScript(slotIdx));
}

async function performScriptUpload(slotIdx, scriptText) {
  const raw = Array.from(new TextEncoder().encode(scriptText));
  const totalLen = raw.length;
  const lenHi7 = (totalLen >> 7) & 0x7F;
  const lenLo7 = totalLen & 0x7F;

  setSlotStatus(slotIdx, 'Starting…');
  await sendAndWaitAck(
    [SYSEX_SCRIPT_BEGIN, VER, slotIdx & 0x0F, lenHi7, lenLo7],
    SYSEX_SCRIPT_BEGIN,
    SCRIPT_BEGIN_ACK_TIMEOUT_MS,
    { totalLen }
  );

  let seq = 0;
  for (let off = 0; off < totalLen; off += CHUNK_BYTES) {
    const chunk = raw.slice(off, off + CHUNK_BYTES);
    const encoded = encode8to7(chunk);
    const seqHi7 = (seq >> 7) & 0x7F;
    const seqLo7 = seq & 0x7F;
    await sendAndWaitAck(
      [SYSEX_SCRIPT_CHUNK, VER, seqHi7, seqLo7, ...encoded],
      SYSEX_SCRIPT_CHUNK,
      SCRIPT_CHUNK_ACK_TIMEOUT_MS
    );
    seq++;
    const pct = Math.round((off + chunk.length) / totalLen * 100);
    setSlotStatus(slotIdx, `Uploading… ${pct}%`);
  }

  await sendAndWaitAck(
    [SYSEX_SCRIPT_END, VER, slotIdx & 0x0F],
    SYSEX_SCRIPT_END,
    SCRIPT_END_ACK_TIMEOUT_MS
  );
}

async function downloadScript(slotIdx) {
  if (!midiOut) { setSlotStatus(slotIdx, 'No device connected.'); return false; }

  let ok = true;
  setSlotDownloadDisabled(slotIdx, true);
  try {
    _dlSlot = slotIdx;
    _dlBuf = [];
    _dlExpectedLen = 0;
    setSlotStatus(slotIdx, 'Requesting…');

    await new Promise((resolve, reject) => {
      _dlResolve = resolve;
      _dlReject = reject;
      _dlTimer = setTimeout(() => failActiveDownload('Download timeout'), 10000);
      send([CMD_GET_SCRIPT, VER, slotIdx & 0x0F]);
    });
  } catch (e) {
    ok = false;
    setSlotStatus(slotIdx, `Error: ${e.message}`);
  } finally {
    setSlotDownloadDisabled(slotIdx, false);
  }
  return ok;
}

async function uploadScript(slotIdx, scriptText) {
  if (!midiOut) { setSlotStatus(slotIdx, 'No device connected.'); return; }
  clearTimeout(_saveTimer);

  const safety = analyzeScriptSafety(scriptText);
  renderSlotSafety(slotIdx, scriptText);
  if (safety.hasErrors) {
    setSlotStatus(slotIdx, SCRIPT_SAFETY
      ? SCRIPT_SAFETY.summarize(safety, { maxItems: 1 })
      : 'Fix script issues before uploading.');
    return;
  }

  const totalLen = new TextEncoder().encode(scriptText).length;
  if (totalLen === 0) { setSlotStatus(slotIdx, 'Script is empty.'); return; }

  setSlotUploadDisabled(slotIdx, true);
  try {
    await performScriptUpload(slotIdx, scriptText);
    setSlotStatus(slotIdx, `Done — ${simpleSlotLabel(slotIdx)} updated.`);

    // Re-parse local metadata and re-fetch names from device
    applySlotMeta(slotIdx, parseScriptMeta(scriptText));
    setTimeout(() => send([CMD_GET_SLOT_NAMES, VER]), 300);
  } catch (e) {
    const hint = /ACK timeout/.test(e.message)
      ? ' The device may still be busy finishing the transfer; wait a moment and retry.'
      : '';
    setSlotStatus(slotIdx, `Error: ${e.message}${hint}`);
  } finally {
    setSlotUploadDisabled(slotIdx, false);
  }
}

// ---------------------------------------------------------------------------
// Firmware flash
// ---------------------------------------------------------------------------
async function flashFirmware(arrayBuffer) {
  const flashBtn   = document.getElementById('fw-flash');
  const abortBtn   = document.getElementById('fw-abort');
  const fwStatusEl = document.getElementById('fw-status');
  const progressTr = document.getElementById('fw-progress-track');
  const progressBr = document.getElementById('fw-progress-bar');

  if (!midiOut) { if (fwStatusEl) fwStatusEl.textContent = 'No device connected.'; return; }

  const raw = new Uint8Array(arrayBuffer);
  const totalLen = raw.length;
  if (totalLen === 0) { if (fwStatusEl) fwStatusEl.textContent = 'File is empty.'; return; }

  _fwTotalBytes  = totalLen;
  _fwAborted     = false;
  _fwResolve     = null;
  _fwReject      = null;
  _fwTimer       = null;

  if (flashBtn)   flashBtn.disabled = true;
  if (abortBtn)   abortBtn.style.display = '';
  if (progressTr) progressTr.style.display = '';
  if (progressBr) progressBr.style.width = '0%';

  try {
    // ── BEGIN ──────────────────────────────────────────────────────────────
    if (fwStatusEl) fwStatusEl.textContent = 'Starting OTA…';
    const sizeB2 = (totalLen >> 14) & 0x7F;
    const sizeB1 = (totalLen >>  7) & 0x7F;
    const sizeB0 =  totalLen        & 0x7F;
    await sendAndWaitAck([SYSEX_FW_BEGIN, VER, sizeB2, sizeB1, sizeB0], SYSEX_FW_BEGIN, 4000);

    // ── CHUNKS (window=1: send one chunk, wait for ACK, repeat) ────────────
    // Window > 1 floods the device's TinyUSB RX FIFO before it can drain,
    // causing SysEx data corruption → Update.end() MD5 fail → stuck at 95%.
    // With 7000-byte chunks there are only ~86 round-trips; the per-call
    // overhead of WebMIDI send() (≈40 ms) already dominates, not the window.
    const FW_WINDOW = 1;
    let seq = 0;
    let acksPending = 0;
    _fwAckQueue = [];
    _fwAckWaiter = null;
    for (let off = 0; off < totalLen; off += FW_CHUNK_BYTES) {
      if (_fwAborted) throw new Error('Aborted by user');

      const chunk   = raw.slice(off, Math.min(off + FW_CHUNK_BYTES, totalLen));
      const encoded = encode8to7(Array.from(chunk));
      const seqHi7  = (seq >> 7) & 0x7F;
      const seqLo7  =  seq       & 0x7F;
      send([SYSEX_FW_CHUNK, VER, seqHi7, seqLo7, ...encoded]);
      seq++;
      acksPending++;

      // Keep at most FW_WINDOW chunks in flight
      if (acksPending >= FW_WINDOW) {
        await waitFwChunkAck(5000);
        acksPending--;
      }

      const pct = Math.round(Math.min((off + chunk.length) / totalLen, 0.95) * 100);
      if (progressBr) progressBr.style.width = pct + '%';
      if (fwStatusEl) fwStatusEl.textContent = `Flashing… ${pct}%`;
    }
    // Drain remaining in-flight ACKs
    while (acksPending > 0) {
      await waitFwChunkAck(5000);
      acksPending--;
    }

    // ── END — device does not ACK; sends FW_STATUS_DONE then reboots ───────
    if (fwStatusEl) fwStatusEl.textContent = 'Verifying…';
    send([SYSEX_FW_END, VER]);

    await new Promise((resolve, reject) => {
      _fwResolve = resolve;
      _fwReject  = reject;
      _fwTimer   = setTimeout(() => {
        _fwResolve = null; _fwReject = null;
        reject(new Error('OTA timeout — device did not confirm (check console)'));
      }, 30000);
    });

    if (progressBr) progressBr.style.width = '100%';
    if (fwStatusEl) fwStatusEl.textContent = 'Done! Device is restarting…';
    setStatus('Firmware flashed — reconnect after reboot');

  } catch (e) {
    if (!_fwAborted) {
      // Try to cancel on device side
      send([SYSEX_FW_ABORT, VER]);
    }
    if (fwStatusEl) fwStatusEl.textContent = `Error: ${e.message}`;
    setStatus('Firmware flash failed');
  } finally {
    _fwTotalBytes = 0;
    _fwAborted    = false;
    _fwResolve    = null;
    _fwReject     = null;
    _fwAckQueue   = [];
    _fwAckWaiter  = null;
    if (_fwTimer) { clearTimeout(_fwTimer); _fwTimer = null; }
    if (flashBtn) flashBtn.disabled = false;
    if (abortBtn) abortBtn.style.display = 'none';
  }
}

// Wire up firmware tab controls after DOM is ready
async function checkServerFirmware() {
  const info  = document.getElementById('fw-server-info');
  const flash = document.getElementById('fw-flash');
  const fname = document.getElementById('fw-filename');
  const st    = document.getElementById('fw-status');
  if (info) info.textContent = 'Checking firmware/firmware.bin…';
  try {
    const resp = await fetch('firmware/firmware.bin?' + Date.now());
    if (!resp.ok) throw new Error('not found');
    const buf = await resp.arrayBuffer();
    _fwBuffer = buf;
    const kb = (buf.byteLength / 1024).toFixed(0);
    if (info)  info.textContent  = `firmware/firmware.bin — ${kb} KB  ✓`;
    if (fname) fname.textContent = `or choose a file…`;
    if (flash) flash.disabled = false;
    if (st)    st.textContent = `Ready — ${(buf.byteLength / 1024).toFixed(1)} KB (firmware/firmware.bin)`;
  } catch {
    _fwBuffer = null;
    if (info)  info.textContent  = 'No firmware.bin in docs/firmware/ — use file picker';
    if (flash) flash.disabled    = true;
    if (st)    st.textContent    = '';
  }
}

function initFirmwareTab() {
  const fwFile    = document.getElementById('fw-file');
  const fwFlash   = document.getElementById('fw-flash');
  const fwAbort   = document.getElementById('fw-abort');
  const fwFname   = document.getElementById('fw-filename');
  const fwReload  = document.getElementById('fw-server-reload');

  if (fwFile) {
    fwFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (fwFname) fwFname.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      const reader = new FileReader();
      reader.onload = evt => {
        _fwBuffer = evt.target.result;
        if (fwFlash) fwFlash.disabled = false;
        const st = document.getElementById('fw-status');
        if (st) st.textContent = `Ready — ${(file.size / 1024).toFixed(1)} KB`;
        const info = document.getElementById('fw-server-info');
        if (info) info.textContent = 'Using selected file (overrides firmware folder)';
      };
      reader.readAsArrayBuffer(file);
    });
  }

  if (fwFlash) {
    fwFlash.addEventListener('click', () => {
      if (!_fwBuffer) return;
      flashFirmware(_fwBuffer);
    });
  }

  if (fwAbort) {
    fwAbort.addEventListener('click', () => {
      _fwAborted = true;
      if (fwAbort) fwAbort.disabled = true;
    });
  }

  if (fwReload) {
    fwReload.addEventListener('click', () => checkServerFirmware());
  }
}

// ---------------------------------------------------------------------------
// Boot — discover built-in and community scripts from GitHub, then build UI
// ---------------------------------------------------------------------------
async function loadUserModes() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/user-modes`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return [];
    const files = await res.json();
    const fileNames = files
      .filter(f => f.type === 'file' && f.name.endsWith('.js'))
      .map(f => f.name)
      .sort((a, b) => a.localeCompare(b));

    return Promise.all(fileNames.map(async filename => {
      try {
        const r = await fetch(`user-modes/${filename}`);
        if (!r.ok) throw new Error();
        const meta = parseScriptMeta(await r.text());
        return {
          name: meta.name || filename.replace(/\.js$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          file: filename,
          desc: meta.desc || '',
          sound: meta.sound || '',
          author: meta.author || '',
        };
      } catch {
        return {
          name: filename.replace(/\.js$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          file: filename,
          desc: '',
          sound: '',
          author: '',
        };
      }
    }));
  } catch { return []; }
}

Promise.all([loadThawneyModes(), loadUserModes()]).then(([thawneyList, userList]) => {
  _thawneyModes = thawneyList;
  _userModes = userList;
  buildRootSelect();
  buildSimpleSlots();
  buildSlotCards();
  initSimpleLibrary();
  buildModePills();
  initFirmwareTab();
  selectSlot(0, false);
  setBootState('awaiting', 'Select device to begin', 'Choose your Shimmer MIDI port.');

  if (navigator.requestMIDIAccess) {
    initMidi();
  } else {
    setBootState('awaiting', 'WebMIDI unavailable', 'Use Chrome or Edge to connect and sync.');
    setStatus('WebMIDI not supported — use Chrome or Edge');
  }
});
