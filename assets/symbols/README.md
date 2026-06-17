# Symbol artwork — drop your EXACT PNGs here

The game loads each symbol from this folder **verbatim** (no SVG, no edits).
Drop the individual PNGs from your MedBot package using these exact filenames.
Any file that is present overrides the built-in fallback art with **zero code
changes**. Missing files fall back to procedural art so the game still runs.

Recommended: square, transparent-background PNGs, **512×512** (or 256×256),
each symbol centered with a little padding.

| Filename | Symbol | Sheet section |
| --- | --- | --- |
| `dr_nova.png` | Dr. Nova | High pay (characters) |
| `nurse_bot.png` | Nurse Bot | High pay (characters) |
| `virus_king.png` | Virus King | High pay (characters) |
| `germ_blob.png` | Germ Blob | High pay (characters) |
| `med_drone.png` | Med Drone | High pay (characters) |
| `serum_vial.png` | Serum Vial | Premium |
| `bio_capsule.png` | Bio Capsule | Premium |
| `lab_crystal.png` | Lab Crystal | Premium |
| `ace.png` | A | Low pay (card value) |
| `king.png` | K | Low pay (card value) |
| `queen.png` | Q | Low pay (card value) |
| `jack.png` | J | Low pay (card value) |
| `ten.png` | 10 | Low pay (card value) |
| `wild_med_kit.png` | Wild Med Kit | Special |
| `lab_portal.png` | Lab Portal (Scatter) | Special |
| `serum_multiplier_orb.png` | Serum Multiplier Orb | Special |

Notes:
- The **orb** multiplier value (×2 … ×100) is drawn dynamically on top of
  `serum_multiplier_orb.png`, so provide the orb **without** a baked-in number.
- After adding files, just reload the page — no build step.
