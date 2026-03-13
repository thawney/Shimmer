# Writing Custom Modes for Shimmer

Modes are plain JavaScript files running on-device in Duktape. Upload from the web UI, no compile step.

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
  // Called every frame.
  m.show();
}

// Optional:
// function deactivate(m) {}
```

---

## Metadata tags

Use `@tag value` lines (as shown above). Current tags:

- `@name`: mode name shown in slot labels and controls.
- `@author`: shown in the Scripts tab.
- `@param_label`: label for the per-slot Density slider in Controls.
- `@description`: shown in UI descriptions.
- `@sound`: informational text in Scripts tab.
- `@hue`: default hue for `m.px(col,row,brightness)`.
- `@sat`: default saturation for `m.px(col,row,brightness)`.

If a tag is missing, defaults are used.

---

## Runtime lifecycle

- `activate(m)`: called once when the mode becomes active.
- `update(m)`: called every frame. Draw and trigger notes here.
- `deactivate(m)`: optional cleanup hook on mode exit.
- Firmware always performs note-off + clear/show on mode deactivation.

---

## `m` API

### Properties (read-only)

| Property | Meaning |
|---|---|
| `m.dt` | frame delta in milliseconds |
| `m.beatMs` | milliseconds per beat at current tempo |
| `m.density` | 0..255 density value for this slot |
| `m.brightness` | 0..255 slot brightness |
| `m.COLS` | grid width (`12`) |
| `m.ROWS` | grid height (`12`) |

### Pixel functions

```js
m.px(col, row, brightness)     // uses @hue/@sat
m.px(col, row, hue, sat, val)  // explicit HSV (0..255)
m.fade(amount)                 // default amount = 3
m.clear()
m.show()
```

### MIDI functions

```js
m.note(degree)                        // default velocity 80, duration 1 beat
m.note(degree, velocity)              // velocity 0..127
m.note(degree, velocity, durationMs)
m.allOff()
```

`degree` follows the active scale/root and wraps across octaves.

### Timing and helpers

```js
m.tick(timerId, intervalMs)           // timerId 0..7
m.rnd()                               // 0..255
m.rnd(max)                            // 0..max-1
m.degreeToCol(degree)                 // 0..6 -> 0..11
m.colToDegree(col)                    // 0..11 -> 0..6
m.map(v, inLo, inHi, outLo, outHi)    // linear float mapping
```

---

## Practical rules

- Call `m.show()` in every `update()` call, after drawing.
- Keep script globals simple; they persist while the mode is active.
- Use `m.dt` for frame-rate-independent movement.
- Use `m.tick()` for stable periodic events.
- Max script size is **8192 bytes**.
- Out-of-range pixels are ignored safely.

---

## Upload flow (current UI)

1. Open the web page and connect your device.
2. Go to **Scripts**.
3. Edit/paste code into a slot card.
4. Click **Upload to device** for that slot.

The current UI exposes slots **0..3**. Upload takes effect immediately; no reboot is required.
