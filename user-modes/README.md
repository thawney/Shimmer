# Writing Custom Modes for Shimmer

Modes are plain JavaScript files running on-device in Duktape. Upload from the web UI, no compile step.
Try scripts live in the [**Simulator →**](../simulator.html)

---

## Script template

```js
/**
 * @name My Mode
 * @author Your Name
 * @hue 32
 * @sat 220
 * @param_label Motion
 * @description One-line summary shown in the web UI.
 * @sound Warm pluck
 */

var state = 0;

function activate(m) {
  state = 0;
  m.clear();
  m.show();
}

function update(m) {
  // Called every frame. Draw pixels and trigger notes here.
  m.show();
}

// Optional:
// function deactivate(m) {}
```

---

## Metadata tags

| Tag | Purpose |
|---|---|
| `@name` | Mode name shown in slot labels and controls |
| `@author` | Shown in the Scripts tab |
| `@param_label` | Label for the per-slot Density slider in Controls |
| `@description` | Shown in UI descriptions |
| `@sound` | Informational text in Scripts tab |
| `@hue` | Default hue for `m.px(col, row, brightness)` (0..255) |
| `@sat` | Default saturation for `m.px(col, row, brightness)` (0..255) |

---

## Runtime lifecycle

- `activate(m)` — called once when the mode becomes active. Reset state here.
- `update(m)` — called every frame (~60 fps). Draw and trigger notes here.
- `deactivate(m)` — optional. Firmware always sends note-off + clear on mode exit.

---

## `m` API

### Properties (read-only)

| Property | Type | Meaning |
|---|---|---|
| `m.dt` | ms | Frame delta time |
| `m.beatMs` | ms | Milliseconds per beat at current tempo, or external MIDI clock when the mode has `Clock In` and `Prefer Ext` enabled |
| `m.density` | 0..255 | Per-slot density knob value |
| `m.brightness` | 0..255 | Per-slot brightness value |
| `m.rootNote` | 0..127 | Current root note used by scale-degree output |
| `m.scale` | 0..9 | Current scale id: 0=Major 1=Minor 2=Dorian 3=Pentatonic 4=Chromatic 5=Mixolydian 6=Lydian 7=Phrygian 8=Harmonic Minor 9=Whole Tone |
| `m.COLS` | 12 | Grid width |
| `m.ROWS` | 12 | Grid height |
| `m.accelX` | −128..127 | Tilt forward/back — **positive = top edge tilted down** |
| `m.accelY` | −128..127 | Tilt left/right — **positive = tilted right** |
| `m.accelZ` | −128..127 | **~+64 when flat**, decreases as device tilts onto its side |
| `m.motion` | 0..255 | Motion magnitude — spikes transiently on knock or shake |

> `m.temp` and `m.humidity` are present but return −50 °C / 0% — the AHT20 sensor on current hardware is defective. Do not use them.

---

### Grid reference

```
col:   0   1   2   3   4   5   6   7   8   9  10  11
       ┌───────────────────────────────────────────────┐
row 0  │ LED 1                              LED 12     │  ← top edge
row 1  │                                               │
  ...  │                                               │
row 11 │ LED 132                           LED 144     │  ← bottom edge
       └───────────────────────────────────────────────┘
```

`m.px(col, row, ...)` — col 0 = left, row 0 = top. Always.

---

### Accelerometer

**Confirmed axis orientations** (verified on hardware):

| Action | Result |
|---|---|
| Tilt right (LED 12/144 side down) | `accelY` → positive |
| Tilt top-down (LED 1–12 edge down) | `accelX` → positive |
| Lay flat, display up | `accelZ` ≈ +64 |
| Stand on edge | `accelZ` → near 0 |

**Three patterns for using accel in generative modes:**

**1. Seed at activation** — locks a value for the session, no frame-by-frame effect:
```js
function activate(m) {
  hueOffset = Math.floor(m.accelX * 30 / 127);  // palette set by how you picked it up
}
```

**2. Slow exponential smooth** — barely perceptible when stationary, gradual when tilted:
```js
var smooth = 0;
// in update():
smooth += (m.accelY - smooth) * (m.dt / 8000.0);  // ~8s time constant
```
Good values: 6000–15000 ms. The device is often flat or on its side — this approach
produces zero effect when stationary and a gentle drift when the device is moved.

**3. Direct responsive** — for modes where tilt is the primary input:
```js
var col = Math.floor(m.map(m.accelY, -100, 100, 0, m.COLS - 1));
```

**Physics gravity** — use the same sign as the axis (no negation needed):
```js
var gx = m.accelY * 0.000003;   // tilt right → push particles/objects right
var gy = -m.accelX * 0.000003;  // tilt top-down → push toward row 0
particle.vx += gx * m.dt;
particle.vy += gy * m.dt;
```

**`accelZ` uses:**
```js
// Detect flat vs upright:
var tilt = 1.0 - m.accelZ / 64.0;  // 0 = flat, 1 = fully on its side
// Slow breath rate when flat, faster when upright:
var period = Math.floor(4000 - tilt * 2500);
```

**Motion knock detection** — rising-edge only, fires once per knock:
```js
var lastMotion = 0;
// in update():
if (m.motion > 150 && lastMotion <= 150) { /* fires once per knock */ }
lastMotion = m.motion;
```

> **Not every mode needs accelerometer.** Shimmer is most often sitting flat or resting
> on a side — accel values will be near-constant. Generative modes are complete without
> it; add accel where it genuinely adds something.

---

### Pixel functions

```js
m.px(col, row, brightness)       // brightness 0..255, uses @hue/@sat
m.px(col, row, hue, sat, val)    // explicit HSV — all 0..255
m.fade(amount)                   // subtract `amount` from every pixel (default 3)
m.clear()                        // set all pixels to 0
m.show()                         // push pixel buffer to LEDs — call once per update()
```

### MIDI functions

```js
m.note(degree)                        // velocity 80, duration 1 beat
m.note(degree, velocity)              // velocity 0..127
m.note(degree, velocity, durationMs)
m.noteMidi(note)                      // absolute MIDI note, velocity 80, duration 1 beat
m.noteMidi(note, velocity)
m.noteMidi(note, velocity, durationMs)
m.noteOn(note, velocity)              // raw MIDI note-on, held until noteOff/allOff
m.noteOff(note)                       // raw MIDI note-off
m.cc(cc, value)                       // send CC on the current output channel
m.pitchBend(value)                    // signed bend: -8192..8191
m.allOff()                            // cancel all held notes
```

`degree` maps through the active scale/root and wraps across octaves.
Scale degrees 0–6 span one octave diatonically; 7–13 continue into the next.
Use `m.noteMidi()` / `m.noteOn()` when a mode needs exact 0–127 MIDI pitch control.

### MIDI In

Incoming USB and DIN MIDI messages are available each frame via read-once properties.
Messages are filtered by the mode's selected **MIDI In Ch** in the web UI.
`midiType` resets to `0` after each frame — check it first before reading the other values.

| Property | Type | Meaning |
|---|---|---|
| `m.midiType` | 0..4 | 0=none 1=noteOn 2=noteOff 3=CC 4=pitchBend |
| `m.midiChannel` | 0..16 | MIDI input channel, 1..16 when an event arrived |
| `m.midiNote` | 0..127 or 255 | Note number (255 = no note event this frame) |
| `m.midiVel` | 0..127 | Velocity (0 for noteOff) |
| `m.midiCC` | 0..127 or 255 | CC number (255 = no CC event this frame) |
| `m.midiCCVal` | 0..127 | CC value |
| `m.midiBend` | -8192..8191 | Pitch bend amount (0 = centered) |

**Pattern — react once per NoteOn:**
```js
function update(m) {
  if (m.midiType === 1) {            // new NoteOn arrived this frame
    var col = Math.floor(m.midiNote * m.COLS / 128);
    // spawn something at col...
  }
  m.show();
}
```

In the simulator, all available WebMIDI inputs are attached, but the selected **MIDI in** port limits which input is accepted.
Leave it on `-- any --` to listen to every connected controller, or choose a single port for cleaner testing.

Clock behavior is controlled from the device/web Controls page per mode via **Clock Mode**:
- `Auto`: follow external clock when present, otherwise run internal clock and send clock out
- `Leader`: ignore external clock and send your own clock out
- `Follower`: follow external clock and do not send your own clock out
- `Internal`: ignore external clock and do not send clock out

The simulator exposes the same **Clock Mode** control, so you can prototype leader/follower behavior there too.

### Timing and helpers

```js
m.tick(timerId, intervalMs)      // returns true once per interval; timerId 0..7
m.rnd()                          // integer 0..255
m.rnd(max)                       // integer 0..max-1
m.degreeToCol(degree)            // map scale degree (0..6) → col (0..11)
m.colToDegree(col)               // map col (0..11) → scale degree (0..6)
m.map(v, inLo, inHi, outLo, outHi)  // linear float mapping
```

---

## Practical rules

- Call `m.show()` exactly once per `update()` call, at the end.
- Script globals persist while the mode is active; reset them in `activate()`.
- Use `m.dt` for all movement so speed is frame-rate-independent.
- Use `m.tick()` for rhythmically stable events rather than manual elapsed timers.
- Max script size: **12288 bytes**.
- Out-of-range pixel coordinates are silently ignored.

---

## Upload flow

1. Open the web UI and connect your device.
2. Go to **Scripts**.
3. Paste or edit code in a slot card.
4. Click **Upload to device** — takes effect immediately, no reboot needed.

Or prototype first in the [**Simulator**](../simulator.html) — no device required.
