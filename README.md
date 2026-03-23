# Shimmer v0

Generative MIDI + LED desktop instrument by [Thawney LTD](https://thawney.com).

**[Open the web UI →](https://thawney.github.io/Shimmer)**

> **Version tracking:** firmware version is indicated by the LED colour flash at startup. v0 flashes a dim warm yellow based on `#ffc60a`.

---

## What it does

Shimmer is a small desktop box with a 12×12 LED grid, USB MIDI, and physical MIDI in/out. It runs generative music scripts that evolve slowly and autonomously; sparse notes, long sustains, and ambient patterns.

The web UI (this repo) lets you:
- Choose and configure the built-in scripts
- Upload custom scripts over SysEx
- Flash firmware updates

The script editor and simulator now share the same safety checks. They warn about risky runtime patterns before you run or upload, the bundled example scripts have been patched to cap catch-up loops, the device now shows a dedicated dim `#ffc60a` upload screen during script transfer, and the firmware pauses mode execution during script transfer so busy-but-valid scripts are less likely to hit false ACK timeouts. The only red device screen is the fault warning display. There is also a practical script-size limit below the absolute 12,288-byte upload cap: large maths-heavy scripts can still compile less reliably on hardware than small ones, so the editor now warns once a script gets above about 6 KB. The firmware now also keeps the JS engine heap in internal SRAM, which makes heavier user scripts much less likely to destabilize mode switches. Faulted slots stay visible while they are active, but once you leave them the mode-step button skips them until that slot is changed again. Empty slots now show an amber `?` with the slot number on-device so they are distinct from real faults. If the device is stuck boot-looping, holding the button during boot wipes the on-device script files and leaves the unit on an amber recovery screen with an `R` until a script is uploaded again.

Physical MIDI in/out is available on the DIN connector. Incoming USB/DIN notes, CC, and pitch bend are exposed to mode scripts via `m.midiNote`, `m.midiType`, etc., and scripts can emit absolute notes, CC, and pitch bend as well. `m.beatMs` can follow external MIDI clock, but that is now configurable per mode from the Controls page with `Clock In`, `Prefer Ext`, and `Clock Out`, alongside separate MIDI output and input channel selection — see [`user-modes/README.md`](user-modes/README.md). MIDI output is sent simultaneously to both USB MIDI and the DIN connector. The browser simulator now mirrors that more closely too, with separate MIDI in/out port selection, a dedicated MIDI input channel selector, and external MIDI clock driving simulated tempo.

## Adding your own scripts

Drop a `.js` file into the `user-modes/` folder and push to `main`.

See [`user-modes/README.md`](user-modes/README.md) for the scripting API.
