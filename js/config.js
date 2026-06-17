/* =========================================================================
 * MEDBOT INVASION 1000 — Game Configuration ("math config")
 *
 * Mirrors the Stake Engine math-sdk configuration concept: every tunable
 * number that defines the game's math model lives here, separate from
 * presentation. The engine (engine.js) consumes this config and produces a
 * deterministic event book; the frontend only replays it.
 *
 * Win evaluation type: "scatter" / pay-anywhere (one of the four supported by
 * Stake Engine: lines | ways | cluster | scatter). 8+ matching symbols
 * anywhere on the 6x5 grid pay, then tumble (germ explosion) and refill.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'medbot_invasion_1000',
    gameName: 'MEDBOT INVASION 1000',
    providerName: 'YOUR STUDIO',       // publisher logo / name placeholder
    version: '1.0.0',
    rtp: 0.965,                        // target RTP (tuned via tools/simulate.js)
    maxWinX: 5000,                     // max win cap in bet multiples (round ends at cap)
    winType: 'scatter',                // pay-anywhere

    grid: { cols: 6, rows: 5 },
    minPay: 8,                         // 8+ of a kind anywhere pays

    /* ---- Symbols ------------------------------------------------------ */
    // tier: hi (characters) | prem (premium) | low (card values)
    // The procedural artist (symbols.js) draws each id from name + colors.
    symbols: [
      { id: 'dr_nova',    name: 'Dr. Nova',    tier: 'hi',   color: '#19d3ff', color2: '#0b6fb0' },
      { id: 'nurse_bot',  name: 'Nurse Bot',   tier: 'hi',   color: '#e9f3ff', color2: '#ff4d6d' },
      { id: 'virus_king', name: 'Virus King',  tier: 'hi',   color: '#c264ff', color2: '#6a1fb0' },
      { id: 'germ_blob',  name: 'Germ Blob',   tier: 'hi',   color: '#8aff3a', color2: '#3a9e12' },
      { id: 'med_drone',  name: 'Med Drone',   tier: 'hi',   color: '#9fd0ff', color2: '#3a6fa0' },

      { id: 'serum_vial', name: 'Serum Vial',  tier: 'prem', color: '#36b6ff', color2: '#1364b0' },
      { id: 'bio_capsule',name: 'Bio Capsule', tier: 'prem', color: '#7dff5a', color2: '#2f9e2a' },
      { id: 'lab_crystal',name: 'Lab Crystal', tier: 'prem', color: '#c87dff', color2: '#7a2dc9' },

      { id: 'ace',   name: 'A',  tier: 'low', color: '#ff5a6e', color2: '#b3123a' },
      { id: 'king',  name: 'K',  tier: 'low', color: '#5ee06a', color2: '#1da53a' },
      { id: 'queen', name: 'Q',  tier: 'low', color: '#c264ff', color2: '#6f2dc9' },
      { id: 'jack',  name: 'J',  tier: 'low', color: '#4fc3ff', color2: '#1671d9' },
      { id: 'ten',   name: '10', tier: 'low', color: '#ffd24a', color2: '#e07c0a' }
    ],

    wild:    { id: 'wild',    name: 'Wild Med Kit' },           // substitutes paying symbols
    scatter: { id: 'scatter', name: 'Lab Portal' },             // 3+ trigger free spins
    orb:     { id: 'orb',     name: 'Serum Multiplier Orb' },   // carries a multiplier value

    /* ---- Reel weights (per-cell weighted draw) ------------------------ */
    // Pay-anywhere needs commons to appear often enough to hit 8+, while the
    // characters stay rare and explosive. Same pool for reveal and refills.
    weights: {
      base: {
        dr_nova: 0.9, nurse_bot: 1.3, virus_king: 1.6, germ_blob: 2.1, med_drone: 2.7,
        serum_vial: 3.3, bio_capsule: 3.9, lab_crystal: 4.5,
        ace: 7.8, king: 8.8, queen: 9.8, jack: 10.8, ten: 11.8,
        wild: 0.76, scatter: 0.78, orb: 0.0
      },
      // Free spins ("Emergency Lab Spins"): hotter reels + multiplier orbs in play
      fs: {
        dr_nova: 1.05, nurse_bot: 1.45, virus_king: 1.75, germ_blob: 2.25, med_drone: 2.85,
        serum_vial: 3.4, bio_capsule: 4.0, lab_crystal: 4.6,
        ace: 7.6, king: 8.6, queen: 9.6, jack: 10.6, ten: 11.6,
        wild: 1.15, scatter: 0.34, orb: 2.0
      }
    },

    /* ---- Multiplier orb values (Serum Multiplier Orb) ------------------ */
    // When an orb lands it carries one of these multipliers. In the base game
    // orbs are inert flavour; in free spins their values are COLLECTED into a
    // running total (capped) that multiplies every win — "up to x100".
    orbValues: { 2: 34, 3: 26, 5: 18, 10: 11, 15: 6, 25: 3, 50: 1.5, 100: 0.5 },
    orbTotalCap: 86,

    /* ---- Paytable (bet multiples, pay-anywhere count tiers) ------------ */
    // Tiers by count of matching symbols: 8-9 / 10-11 / 12+
    payTiers: [8, 10, 12],
    paytable: {
      dr_nova:    [14.0, 36.0, 72.0],
      nurse_bot:  [ 7.0, 18.0, 36.0],
      virus_king: [ 6.0, 14.0, 28.0],
      germ_blob:  [ 4.4,  8.4, 21.0],
      med_drone:  [ 3.0,  7.0, 17.0],
      serum_vial: [ 2.2,  4.4, 12.0],
      bio_capsule:[ 1.7,  3.0,  8.4],
      lab_crystal:[ 1.4,  2.2,  7.0],
      ace:        [ 1.2,  1.8,  6.0],
      king:       [ 0.85, 1.4,  4.4],
      queen:      [ 0.7,  1.2,  3.6],
      jack:       [ 0.6,  0.85, 3.0],
      ten:        [ 0.4,  0.7,  2.2]
    },
    // Lab Portal scatter pays (count: 3..6), paid once on the triggering spin
    scatterPays: { 3: 3, 4: 5, 5: 20, 6: 100 },

    /* ---- Free spins ("Emergency Lab Spins") ---------------------------- */
    freeSpins: {
      trigger: 3,
      awards: { 3: 10, 4: 12, 5: 15, 6: 20 },
      retrigger: 3,
      retriggerSpins: 5
    },

    /* ---- Invasion Meter ------------------------------------------------ */
    // Germ Blobs that explode in a paid base-game round fill the meter. When
    // it tops out, a Scanner Beam fires (random symbols become wild). Purely
    // additive base-game feature; tuned to stay inside RTP.
    invasionMeter: { capacity: 12, scannerWildsMin: 1, scannerWildsMax: 3, fireChance: 0.01 },

    /* ---- Bet modes (base + the four Bonus Buys from the sheet) ---------- */
    betModes: {
      base:     { cost: 1.0,  label: 'Base Game' },
      buy:      { cost: 100,  label: 'Buy Free Spins',  forcedScatters: { 3: 86, 4: 11, 5: 3 },
                  orbCap: 86 },
      scanner:  { cost: 250,  label: 'Scanner Mode',    forcedScatters: { 3: 70, 4: 22, 5: 8 },
                  extraWilds: true,  orbBoost: 1.05, orbCap: 112, extraSpins: 3 },
      outbreak: { cost: 500,  label: 'Outbreak Mode',   forcedScatters: { 3: 55, 4: 30, 5: 15 },
                  germBoost: true,   bigOrbs: true, orbBoost: 1.15, orbCap: 132, extraSpins: 5 },
      virusking:{ cost: 1000, label: 'Virus King Mode', forcedScatters: { 3: 40, 4: 35, 5: 25 },
                  bigOrbs: true,     orbBoost: 1.15, orbCap: 295, extraSpins: 5 }
    },

    /* ---- Bet limits (demo wallet) -------------------------------------- */
    bet: { min: 0.10, max: 100, default: 1.00, steps: [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100] },
    coinValues: [0.01, 0.02, 0.05, 0.10, 0.20, 0.50, 1.00],
    startBalance: 1000
  };

  CONFIG.tierForCount = function (count) {
    var tiers = CONFIG.payTiers, idx = -1;
    for (var i = 0; i < tiers.length; i++) if (count >= tiers[i]) idx = i;
    return idx; // -1 if below min pay
  };

  CONFIG.symbolById = function (id) {
    for (var i = 0; i < CONFIG.symbols.length; i++)
      if (CONFIG.symbols[i].id === id) return CONFIG.symbols[i];
    return null;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
