# Shimmer v0

Generative MIDI + LED desktop instrument by [Thawney LTD](https://thawney.com).

**[Open the web UI →](https://thawney.github.io/Shimmer)**

> **Version tracking:** firmware version is indicated by the LED colour flash at startup. v0 flashes dim warm orange.

---

## What it does

Shimmer is a small desktop box with a 12×12 LED grid, USB MIDI, and physical MIDI in/out. It runs generative music scripts that evolve slowly and autonomously; sparse notes, long sustains, and ambient patterns.

The web UI (this repo) lets you:
- Choose and configure the built-in scripts
- Upload custom scripts over SysEx
- Flash firmware updates

Physical MIDI in/out is available on the DIN connector. Incoming notes and CC messages are exposed to mode scripts via `m.midiNote`, `m.midiType`, etc. — see [`user-modes/README.md`](user-modes/README.md). MIDI output is sent simultaneously to both USB MIDI and the DIN connector.

## Adding your own scripts

Drop a `.js` file into the `user-modes/` folder and push to `main`.

See [`user-modes/README.md`](user-modes/README.md) for the scripting API.
