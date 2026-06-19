# Solar Drift

A cosmic-themed **5×4, 1024-ways** HTML5 slot game — a self-contained, dependency-free
frontend build. Drop the folder on any static host (or open `index.html`) and it runs.

> **Frontend presentation demo.** All math in this build is computed **client-side** for
> demonstration only. Before any real-money deployment it must be connected to
> server-authoritative outcomes and certified RTP simulation — the in-game Paytable, Rules,
> and Math Info panels state this explicitly. No real-money play, no wallet integration.

## Run it

No build step. Either open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Serving over HTTP (rather than `file://`) is recommended so audio and image preloading
behave consistently across browsers.

## Controls

| Action | Input |
| --- | --- |
| Spin | `SPACE`, the on-stage SPIN button, or the mobile dock SPIN |
| Close modal / dismiss win | `ESC` |
| Bet up / down | on-stage bet buttons or mobile `+` / `−` |
| Buy Bonus, Autoplay, Turbo, Menu, Paytable, History, Sound | on-stage hotspots / menu |

## Features

- Base game: 1024 ways, wins pay left-to-right on adjacent reels.
- **Cosmic Wild** substitutes for regular pay symbols.
- **Black Hole Scatter** — 3+ trigger Free Spins (3/4/5+ → 10/12/15 spins, retriggerable).
- **Energy Core** multipliers and core-collection behavior.
- **Solar Storm Respins** — Locked Cores hold while new symbols land.
- **Singularity Mode** — a 7×7 grid with enhanced multipliers.
- **Buy Bonus / Super Buy** with a disclosed cost and an animated suspense launch.
- Autoplay with stop conditions, Turbo, Quick Spin, paytable / rules / history / settings.
- Responsive 1920×1080 artboard scaled with `min(vw/1920, vh/1080)` to fit any screen,
  including a dedicated mobile portrait control dock and iOS safe-area handling.

## Project layout

```
index.html            markup + screen structure
css/styles.css        all styling and animations
js/game.js            game state, reels, win evaluation (demo math), UI wiring
js/audio-manager.js   WAV sound playback / looping
js/cinematic.js       cinematic overlays, cutscenes, pacing
js/frontend-100.js    reel-by-reel stop, scatter tease, screen audio loops
assets/               backgrounds, logos, symbol art, UI reference
audio/                ambient loops and win/feature SFX (.wav)
```

## QA preview routes

Append a hash to the URL to jump straight to a screen for review, e.g.:

```
index.html#preview              → straight to the game screen
index.html#preview-bonus        → game screen with Buy Bonus open
index.html#preview-free         → Free Spins intro
index.html#preview-storm        → Solar Storm Respins
index.html#preview-singularity  → Singularity Mode
index.html#preview-cutscene     → Black Hole cutscene
```

## Math summary (demo)

| Property | Value |
| --- | --- |
| Grid | 5×4, 1024 ways |
| Target RTP | 96.20% (demo target) |
| Volatility | High |
| Max win | 10,000× bet |

Malfunction voids all pays and plays.
