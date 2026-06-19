#!/usr/bin/env node
/* Solar Drift — web-sdk story-data generator.
 *
 * Emits books in the StakeEngine web-sdk "ways" bookEvent format
 * (reveal -> winInfo -> setTotalWin -> setWin -> finalWin, and freegame spins
 * with updateFreeSpin / freeSpinEnd) from the same Solar Drift math used by the
 * RGS publication. Output drops into apps/solar-drift/src/stories/data/.
 *
 * Usage: node generate_websdk.js [outDir] [baseCount] [bonusCount]
 */
const fs = require("fs");
const path = require("path");
const Engine = require("./engine.js");
const Config = require("./config.js");

const OUT = process.argv[2] || path.join(__dirname, "websdk_data");
const BASE_COUNT = parseInt(process.argv[3], 10) || 200;
const BONUS_COUNT = parseInt(process.argv[4], 10) || 60;
fs.mkdirSync(OUT, { recursive: true });

const WIN_FACTOR = Config.WIN_FACTOR;
const round2 = (n) => +n.toFixed(2);

// Our symbol id -> web-sdk symbol key (ways template keys).
const KEY = {
	scatter: "S", wild: "W",
	singularity: "H5", commander: "H1", scientist: "H2", solar: "H3", ship: "H4", planet: "H4",
	core: "M", locked: "M",
	k: "L2", a: "L1", q: "L3", j: "L4", "10": "L4",
};
const PAD_KEYS = ["L1", "L2", "L3", "L4"];
const randPad = (rng) => PAD_KEYS[Math.floor(rng.next() * PAD_KEYS.length)];

const COLS = 5, ROWS = 4;

// Structured ways evaluation: returns total win + per-symbol wins with positions.
function evaluate(outcome, freeMult, mode) {
	const grid = [];
	for (let c = 0; c < COLS; c++) grid.push(outcome.slice(c * ROWS, c * ROWS + ROWS));
	const candidates = Engine.symbols.filter((s) => !["scatter", "wild"].includes(s.id));
	let total = 0;
	const wins = [];
	for (const sym of candidates) {
		let ways = 1, matchedCols = 0;
		const positions = [];
		for (let c = 0; c < COLS; c++) {
			const hits = [];
			for (let r = 0; r < ROWS; r++) {
				const s = grid[c][r];
				if (s.id === sym.id || s.id === "wild") hits.push({ reel: c, row: r });
			}
			if (hits.length === 0) break;
			matchedCols++; ways *= hits.length; positions.push(...hits);
		}
		if (matchedCols >= 3) {
			const pay = sym.pay[matchedCols - 1] || 0;
			const value = 1 * pay * ways * WIN_FACTOR;
			if (value > 0) {
				total += value;
				wins.push({ symbol: KEY[sym.id], kind: matchedCols, ways, value, positions });
			}
		}
	}
	const coreCount = outcome.filter((s) => s.id === "core").length;
	const scatterCount = outcome.filter((s) => s.id === "scatter").length;
	let multiplier = 1;
	if (coreCount) multiplier += Math.min(10, coreCount * (mode === "free" ? 0.5 : 0.25));
	if (mode === "free") multiplier *= freeMult || 1;
	total *= multiplier;
	return { win: round2(total), wins, multiplier, coreCount, scatterCount };
}

const winLevel = (mult) =>
	mult <= 0 ? 0 : mult < 5 ? 1 : mult < 12 ? 2 : mult < 25 ? 3 : mult < 50 ? 4 : 5;

// Build a padded board[reel][row+pad] of RawSymbol objects from an outcome.
function board(outcome, rng) {
	const b = [];
	for (let c = 0; c < COLS; c++) {
		const reel = [{ name: randPad(rng) }];
		for (let r = 0; r < ROWS; r++) {
			const s = outcome[c * ROWS + r];
			const cell = { name: KEY[s.id] };
			if (s.id === "scatter") cell.scatter = true;
			if (s.id === "wild") cell.wild = true;
			reel.push(cell);
		}
		reel.push({ name: randPad(rng) });
		b.push(reel);
	}
	return b;
}
const paddingPositions = (rng) => Array.from({ length: COLS }, () => Math.floor(rng.next() * 220));

function winInfoEvent(index, res) {
	return {
		index, type: "winInfo", totalWin: res.win,
		wins: res.wins.map((w, i) => ({
			symbol: w.symbol, kind: w.kind, win: round2(w.value * res.multiplier),
			positions: w.positions,
			meta: { lineIndex: i, multiplier: res.multiplier, winWithoutMult: round2(w.value),
				globalMult: res.multiplier, lineMultiplier: 1 },
		})),
	};
}

// ---- base book: one base-game spin -----------------------------------------
function baseBook(rng, id) {
	const outcome = Engine.buildOutcome(rng, "base", COLS * ROWS);
	const res = evaluate(outcome, 1, "base");
	let i = 0;
	const events = [{ index: i++, type: "reveal", board: board(outcome, rng),
		paddingPositions: paddingPositions(rng), gameType: "basegame", anticipation: [0, 0, 0, 0, 0] }];
	if (res.win > 0) {
		events.push(winInfoEvent(i++, res));
		events.push({ index: i++, type: "setTotalWin", amount: res.win });
		events.push({ index: i++, type: "setWin", amount: res.win, winLevel: winLevel(res.win) });
	} else {
		events.push({ index: i++, type: "setTotalWin", amount: 0 });
	}
	events.push({ index: i++, type: "finalWin", amount: res.win });
	return { id, payoutMultiplier: res.win, events, criteria: res.win > 0 ? "win" : "0",
		baseGameWins: res.win, freeGameWins: 0 };
}

// ---- bonus book: a full bought free-spins session ---------------------------
function bonusBook(rng, id) {
	let i = 0, total = 0, mult = 2, left = 10;
	const events = [{ index: i++, type: "freeSpinTrigger", totalFs: 10, positions: [] }];
	const totalFs = 10;
	let done = 0;
	while (left > 0) {
		left--; done++;
		const outcome = Engine.buildOutcome(rng, "free", COLS * ROWS);
		const res = evaluate(outcome, mult, "free");
		total += res.win;
		events.push({ index: i++, type: "reveal", board: board(outcome, rng),
			paddingPositions: paddingPositions(rng), gameType: "freegame", anticipation: [0, 0, 0, 0, 0] });
		events.push({ index: i++, type: "updateFreeSpin", amount: done, total: totalFs });
		if (res.win > 0) {
			events.push(winInfoEvent(i++, res));
			events.push({ index: i++, type: "setTotalWin", amount: round2(total) });
			events.push({ index: i++, type: "setWin", amount: res.win, winLevel: winLevel(res.win) });
		}
		if (res.coreCount > 0) mult = Math.min(25, mult + res.coreCount);
		if (res.scatterCount >= 3) left += 3;
	}
	events.push({ index: i++, type: "freeSpinEnd", amount: round2(total), winLevel: winLevel(total) });
	events.push({ index: i++, type: "finalWin", amount: round2(total) });
	return { id, payoutMultiplier: round2(total), events, criteria: "freegame",
		baseGameWins: 0, freeGameWins: round2(total) };
}

function writeBooks(file, books) {
	fs.writeFileSync(path.join(OUT, file),
		"export default " + JSON.stringify(books, null, "\t") + ";\n");
}

const rngBase = Engine.createRNG(0xb0a7);
const baseBooks = Array.from({ length: BASE_COUNT }, (_, k) => baseBook(rngBase, k + 1));
writeBooks("base_books.ts", baseBooks);
writeBooks("base_events.ts", [baseBooks.find((b) => b.payoutMultiplier > 0)?.events[0] || baseBooks[0].events[0]]);

const rngBonus = Engine.createRNG(0xb09005);
const bonusBooks = Array.from({ length: BONUS_COUNT }, (_, k) => bonusBook(rngBonus, k + 1));
writeBooks("bonus_books.ts", bonusBooks);
writeBooks("bonus_events.ts", [bonusBooks[0].events[1]]);

const baseRtp = baseBooks.reduce((a, b) => a + b.payoutMultiplier, 0) / baseBooks.length;
const bonusAvg = bonusBooks.reduce((a, b) => a + b.payoutMultiplier, 0) / bonusBooks.length;
console.log(`Wrote web-sdk story data to ${OUT}`);
console.log(`  base_books.ts:  ${baseBooks.length} books, avg payout ${baseRtp.toFixed(2)}x`);
console.log(`  bonus_books.ts: ${bonusBooks.length} sessions, avg payout ${bonusAvg.toFixed(2)}x`);
