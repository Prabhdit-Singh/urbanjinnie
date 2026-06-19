// Solar Drift — web-sdk game config (math identity).
// Symbol KEYS follow the ways template (W, S, H1-H5, L1-L4, M) so the template's
// components/assets keep working; the MEANING + paytable below are Solar Drift's.
//
// Symbol mapping:
//   W  = Cosmic Wild            S  = Black Hole Scatter
//   H5 = Singularity            H1 = Solar Commander    H2 = Energy Scientist
//   H3 = Solar Core             H4 = Drift Ship
//   M  = Energy Core (multiplier)
//   L2 = K   L1 = A   L3 = Q   L4 = J/10
export default {
	providerName: 'urbanjinnie',
	gameName: 'solar_drift',
	gameID: '0_0_solar_drift',
	rtp: 0.962,
	numReels: 5,
	numRows: [4, 4, 4, 4, 4], // 5x4 = 1024 ways
	betModes: {
		base: {
			cost: 1.0,
			feature: true,
			buyBonus: false,
			rtp: 0.962,
			max_win: 10000,
		},
		bonus: {
			cost: 100.0,
			feature: false,
			buyBonus: true,
			rtp: 0.962,
			max_win: 10000,
		},
	},
	symbols: {
		W: { paytable: null, special_properties: ['wild'] },
		S: { paytable: null, special_properties: ['scatter'] },
		H5: { paytable: [{ '5': 45 }, { '4': 15 }, { '3': 5 }] }, // Singularity
		H1: { paytable: [{ '5': 32 }, { '4': 12 }, { '3': 4 }] }, // Solar Commander
		H2: { paytable: [{ '5': 28 }, { '4': 10 }, { '3': 3.5 }] }, // Energy Scientist
		H3: { paytable: [{ '5': 22 }, { '4': 8 }, { '3': 3 }] }, // Solar Core
		H4: { paytable: [{ '5': 18 }, { '4': 7 }, { '3': 2.5 }] }, // Drift Ship
		M: { paytable: [{ '5': 10 }, { '4': 4 }, { '3': 1.5 }] }, // Energy Core
		L2: { paytable: [{ '5': 8 }, { '4': 3 }, { '3': 1.2 }] }, // K
		L1: { paytable: [{ '5': 7 }, { '4': 2.5 }, { '3': 1 }] }, // A
		L3: { paytable: [{ '5': 6 }, { '4': 2.2 }, { '3': 0.9 }] }, // Q
		L4: { paytable: [{ '5': 5 }, { '4': 2 }, { '3': 0.8 }] }, // J / 10
	},
	paddingReels: {
		basegame: '',
		freegame: '',
		superspingame: '',
	},
};
