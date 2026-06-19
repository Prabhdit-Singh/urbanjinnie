/* =========================================================================
 * BOOK OF HALLOWEEN — Game Configuration
 *
 * A standalone Halloween-themed "Book of" slot demo, built alongside Candy
 * Surge 1000 (nothing in the original game is touched). Classic mechanics of
 * the genre: 5x3 reels, 10 fixed lines, an ancient Book that is BOTH the
 * scatter and the wild, and Free Spins where one random symbol becomes a
 * Special Expanding Symbol.
 *
 * Same house style as the sibling game: zero binary assets (all symbol art is
 * drawn procedurally on canvas) and zero dependencies. This file holds the
 * math/theme model only; rendering and play live in the other files.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'book_of_halloween',
    gameName: 'BOOK OF HALLOWEEN',
    providerName: 'YOUR STUDIO',     // publisher logo / name placeholder
    version: '1.0.0',
    rtp: 0.96,                       // declared target RTP (demo, not tuned)
    maxWinX: 5000,                   // max win cap, in bet multiples

    grid: { cols: 5, rows: 3 },

    /* ---- Symbols --------------------------------------------------------
     * id        engine identifier
     * name      shown in the paytable
     * tone      base art hue family (used by the procedural artist)
     * High themed symbols pay best; the five "royals" round out the reel. */
    symbols: [
      { id: 'pumpkin', name: 'Jack-o-Lantern', tone: '#ff8a1e' },
      { id: 'skull',   name: 'Sugar Skull',    tone: '#e9e4d6' },
      { id: 'potion',  name: 'Witch Potion',   tone: '#54e06a' },
      { id: 'spider',  name: 'Widow Spider',   tone: '#b06cff' },
      { id: 'ace',     name: 'A',              tone: '#ff5d73' },
      { id: 'king',    name: 'K',              tone: '#ffcf52' },
      { id: 'queen',   name: 'Q',              tone: '#7ad4ff' },
      { id: 'jack',    name: 'J',              tone: '#9be86a' },
      { id: 'ten',     name: '10',             tone: '#c9b8ff' }
    ],
    // The Book is scatter + wild + the expanding trigger, handled specially.
    book: { id: 'book', name: 'Book of Halloween' },

    // Symbols eligible to be drawn as the Free Spins expanding symbol.
    // (The Book itself is never the expanding pick.)
    expandableIds: ['pumpkin', 'skull', 'potion', 'spider', 'ace', 'king', 'queen', 'jack', 'ten'],

    /* ---- Reel weights (weighted draw per reel cell) ---------------------
     * Lower weight = rarer = pays more. Book is deliberately scarce. */
    weights: {
      base: {
        book: 2.4, pumpkin: 4, skull: 5, potion: 5.5, spider: 6,
        ace: 9, king: 9, queen: 11, jack: 11, ten: 12
      },
      // Free spins reels carry the Book a touch hotter for retriggers.
      fs: {
        book: 3.1, pumpkin: 4, skull: 5, potion: 5.5, spider: 6,
        ace: 9, king: 9, queen: 11, jack: 11, ten: 12
      }
    },

    /* ---- Paytable (x bet PER LINE, by count of a kind 3 / 4 / 5) -------- */
    // Values are per-line-bet multipliers (genre scale: line bet = total/10).
    paytable: {
      //          3     4      5
      pumpkin: [  20,  100,  1000 ],
      skull:   [   8,   40,   400 ],
      potion:  [   8,   40,   400 ],
      spider:  [   6,   20,   300 ],
      ace:     [   4,   15,   200 ],
      king:    [   4,   15,   200 ],
      queen:   [   2,    8,   100 ],
      jack:    [   2,    8,   100 ],
      ten:     [   1,    5,   100 ]
    },
    // Book pays as a SCATTER on total bet (count anywhere): 2 / 3 / 4 / 5.
    bookScatterPays: { 2: 1, 3: 2, 4: 20, 5: 200 },

    /* ---- Free spins ----------------------------------------------------- */
    freeSpins: {
      trigger: 3,        // Books needed to trigger
      award: 10,         // spins awarded (and per retrigger)
      retrigger: true
      // On trigger one random eligible symbol is chosen as the SPECIAL symbol.
      // During the bonus it can expand to cover its whole reel and pays on any
      // position (like the classic genre), book wins are also enhanced.
    },

    /* ---- 10 fixed paylines (row index 0=top .. 2=bottom per reel) ------- */
    paylines: [
      [1, 1, 1, 1, 1], // 1  middle
      [0, 0, 0, 0, 0], // 2  top
      [2, 2, 2, 2, 2], // 3  bottom
      [0, 1, 2, 1, 0], // 4  V
      [2, 1, 0, 1, 2], // 5  ^
      [0, 0, 1, 2, 2], // 6
      [2, 2, 1, 0, 0], // 7
      [1, 0, 1, 2, 1], // 8
      [1, 2, 1, 0, 1], // 9
      [0, 1, 1, 1, 0]  // 10
    ],

    /* ---- Bet limits (demo wallet) --------------------------------------- */
    bet: {
      levels: [0.20, 0.40, 0.60, 1.00, 2.00, 4.00, 10.00, 20.00, 40.00, 100.00],
      defaultIndex: 3
    },
    startBalance: 1000
  };

  g.BOH_Config = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
