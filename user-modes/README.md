# Shimmer JS API Reference

Write plain JavaScript modes for Shimmer's 12 by 12 LED grid and MIDI engine.
Scripts run on-device in Duktape and can be tested live in the browser simulator.

[Open simulator](../simulator.html) | [Start from example.js](example.js)

---

## Quick facts

| Area | Detail |
|---|---|
| Lifecycle | `activate`, `update`, optional `deactivate` |
| Display | 12 columns by 12 rows, row 0 at the top |
| Timing | `m.dt` is clamped to `1..96ms` |
| Limit | 12,288 bytes per uploaded script |

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
 * @tags Tilt, Generative
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
| `@tags` | Comma-separated script tags for browsing: Tilt, MIDI in, Clocked, Generative, Ambient, Rhythm, Chords, Utility, Physics, Game, Humidity, Temperature |
| `@sound` | Optional sound hint; still searchable and used as fallback context for older scripts |
| `@hue` | Default hue for `m.px(col, row, brightness)`, 0..255 |
| `@sat` | Default saturation for `m.px(col, row, brightness)`, 0..255 |

---

## Tag guide

Use up to four tags that describe how the script behaves. Tags are shown in the script library and drive the tag filter.

| Tag | Use when |
|---|---|
| `Tilt` | Responds to tilt, shake, knock, steering, rolling, or other motion |
| `MIDI in` | Uses incoming MIDI notes or messages as part of the script |
| `Clocked` | Locks events to tempo, beats, loops, pulses, or regular steps |
| `Generative` | Creates self-running patterns, melodies, or behaviour without needing live input |
| `Ambient` | Slow, textural, pad-like, droney, sparse, or background-friendly |
| `Rhythm` | Beat-first scripts: Euclidean patterns, pulses, bursts, polyrhythms, or grids |
| `Chords` | Harmony, drones, chord memory, voicing, stacked notes, or sustained groups |
| `Utility` | Practical tool modes such as monitors, quantisers, tests, and setup helpers |
| `Physics` | Simulates movement, particles, falling, bouncing, fluid, flocking, growth, or pressure |
| `Game` | Game-like rules, objectives, scoring, growth, collision, or cellular automata |
| `Humidity` | Reads `m.humidity` and changes behaviour from the humidity sensor |
| `Temperature` | Reads `m.temp` and changes behaviour from the temperature sensor |

Example: `@tags Tilt, MIDI in, Physics, Humidity`

---

## Runtime lifecycle

- `activate(m)` is called once when the mode becomes active. Reset state here.
- `update(m)` is called every frame, roughly 60 fps. Draw pixels and trigger notes here.
- `deactivate(m)` is optional. Firmware always sends note-off and clears the display on mode exit.

---

## `m` properties

| Property | Type | Meaning |
|---|---|---|
| `m.dt` | ms | Frame delta time, clamped to `1..96ms` |
| `m.beatMs` | ms | Milliseconds per beat at current tempo or external MIDI clock, clamped to `40..4000ms` |
| `m.density` | 0..255 | Per-slot density knob value |
| `m.brightness` | 0..255 | Per-slot brightness value |
| `m.rootNote` | 0..127 | Current root MIDI note used by scale-degree output |
| `m.scale` | 0..9 | 0 Major, 1 Minor, 2 Dorian, 3 Pentatonic, 4 Chromatic, 5 Mixolydian, 6 Lydian, 7 Phrygian, 8 Harmonic Minor, 9 Whole Tone |
| `m.COLS` | 12 | Grid width |
| `m.ROWS` | 12 | Grid height |
| `m.accelX` | -128..127 | Tilt forward/back. Positive means the top edge is tilted down |
| `m.accelY` | -128..127 | Tilt left/right. Positive means tilted right |
| `m.accelZ` | -128..127 | Roughly +64 when flat, decreasing as the device tilts onto its side |
| `m.motion` | 0..255 | Motion magnitude. Spikes transiently on knock or shake |
| `m.temp` | number | Temperature in Celsius on supported hardware |
| `m.humidity` | number | Relative humidity percentage on supported hardware |

---

## Grid reference

`m.px(col, row, ...)` uses col 0 on the left and row 0 at the top.

| Position | Meaning |
|---|---|
| LED 1 | col 0, row 0 |
| LED 12 | col 11, row 0 |
| LED 132 | col 0, row 11 |
| LED 144 | col 11, row 11 |

---

## Accelerometer patterns

| Action | Result |
|---|---|
| Tilt right, LED 12/144 side down | `accelY` becomes positive |
| Tilt top-down, LED 1-12 edge down | `accelX` becomes positive |
| Lay flat, display up | `accelZ` is about `+64` |
| Stand on edge | `accelZ` moves toward `0` |

```js
// Slow tilt smoothing
var smooth = 0;
smooth += (m.accelY - smooth) * (m.dt / 8000.0);

// Motion knock detection
if (m.motion > 150 && lastMotion <= 150) {
  // fires once per knock
}
lastMotion = m.motion;
```

---

## Pixel functions

| Function | Meaning |
|---|---|
| `m.px(col, row, brightness)` | Set a pixel using `@hue` and `@sat` |
| `m.px(col, row, hue, sat, val)` | Set a pixel with explicit HSV values, all 0..255 |
| `m.fade(amount)` | Subtract amount from every pixel. Default is 3 |
| `m.clear()` | Set all pixels to black |
| `m.show()` | Push the pixel buffer to LEDs. Call once per update |

---

## MIDI functions

| Function | Meaning |
|---|---|
| `m.note(degree, velocity, durationMs)` | Play a scale degree. Velocity defaults to 80, duration to 1 beat |
| `m.noteMidi(note, velocity, durationMs)` | Play an absolute MIDI note, 0..127 |
| `m.noteOn(note, velocity)` | Raw note-on, held until `m.noteOff()` or `m.allOff()` |
| `m.noteOff(note)` | Raw note-off |
| `m.cc(cc, value)` | Send CC on the current output channel |
| `m.pitchBend(value)` | Signed pitch bend, clamped to -8192..8191 |
| `m.allOff()` | Cancel held notes on the current output channel |

`degree` maps through the active scale and root. Degree 0 is the selected root MIDI note exactly; degrees 0-6 span one octave diatonically and 7-13 continue into the next.

---

## MIDI In

Incoming USB and DIN MIDI messages are available each frame via read-once properties, filtered by the mode's selected MIDI In channel.

| Property | Type | Meaning |
|---|---|---|
| `m.midiType` | 0..4 | 0 none, 1 noteOn, 2 noteOff, 3 CC, 4 pitchBend |
| `m.midiChannel` | 0..16 | MIDI input channel, 1..16 when an event arrived |
| `m.midiNote` | 0..127 or 255 | Note number, 255 when no note event arrived |
| `m.midiVel` | 0..127 | Velocity, 0 for noteOff |
| `m.midiCC` | 0..127 or 255 | CC number, 255 when no CC arrived |
| `m.midiCCVal` | 0..127 | CC value |
| `m.midiBend` | -8192..8191 | Pitch bend amount, 0 centered |

```js
function update(m) {
  if (m.midiType === 1) {
    var col = Math.floor(m.midiNote * m.COLS / 128);
    // spawn something at col
  }
  m.show();
}
```

---

## Clock mode

| Mode | Meaning |
|---|---|
| Auto | Follow external clock when present, otherwise run internal clock and send clock out |
| Leader | Ignore external clock and send your own clock out |
| Follower | Follow external clock and do not send your own clock out |
| Internal | Ignore external clock and do not send clock out |

---

## Timing and helpers

| Helper | Meaning |
|---|---|
| `m.tick(timerId, intervalMs)` | Returns true once per interval. Timer id is 0..7 |
| `m.rnd()` | Random integer from 0..255 |
| `m.rnd(max)` | Random integer from 0..max-1 |
| `m.degreeToCol(degree)` | Map scale degree 0..6 to display column 0..11 |
| `m.colToDegree(col)` | Map display column 0..11 to scale degree 0..6 |
| `m.map(v, inLo, inHi, outLo, outHi)` | Linear float mapping |

---

## Practical rules

- Call `m.show()` exactly once per `update()`, at the end.
- Script globals persist while the mode is active. Reset them in `activate()`.
- Use `m.dt` for movement so speed is frame-rate independent.
- Use `m.tick()` for rhythmically stable events.
- Clamp unusually large `m.dt` or `m.beatMs` before using them in physics or divisions.
- Avoid startup note storms and cap note output in physics-heavy modes.
- Use current API names only: `m.dt`, `m.beatMs`, and `m.px()`.
- Avoid browser-only APIs like `setTimeout()`, `document`, `window`, and `fetch()`.
