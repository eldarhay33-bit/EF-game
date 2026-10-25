// Static game catalogue: shop prices, equipment tiers, starter weapons, maps, achievement chains and mission templates.
const CATALOG = {
  skinPrice: [0, 900, 2200, 5000, 11000, 0, 40000],           // by rarity index (6 = ULTRA MAX)
  tierPrice: [350, 1100, 3000, 7500, 17000],                  // equipment tiers 1..5 (rarity common..legendary)
  equipSlots: ['vest', 'helmet', 'boots', 'gloves', 'pack'],
  equip: {
    vest:   { shield: [10, 20, 30, 45, 60], dr: [0.04, 0.08, 0.12, 0.17, 0.22] },
    helmet: { hs: [0.06, 0.12, 0.2, 0.28, 0.38], flash: [0, 0, 0.2, 0.35, 0.5] },
    boots:  { speed: [0.01, 0.02, 0.035, 0.05, 0.07], quiet: [0.1, 0.2, 0.3, 0.4, 0.5] },
    gloves: { reload: [0.05, 0.1, 0.16, 0.23, 0.3], equip: [0.05, 0.1, 0.15, 0.2, 0.3] },
    pack:   { meds: [1, 1, 2, 2, 3], shields: [0, 1, 1, 2, 2], frags: [0, 1, 1, 2, 2] }
  },
  // weapons the player starts a match with (slot 1) instead of the plain pistol
  starters: [
    { id: 'pistol_0', w: 'pistol', r: 0, price: 0 }, { id: 'pistol_2', w: 'pistol', r: 2, price: 700 }, { id: 'smg_1', w: 'smg', r: 1, price: 1900 },
    { id: 'ar_1', w: 'ar', r: 1, price: 4000 }, { id: 'ar_2', w: 'ar', r: 2, price: 7800 }, { id: 'shotgun_3', w: 'shotgun', r: 3, price: 10000 },
    { id: 'dmr_3', w: 'dmr', r: 3, price: 15000 }, { id: 'ak_4', w: 'ak', r: 4, price: 25000 }
  ],
  maps: [
    { id: 'classic', type: 'br', price: 0 }, { id: 'winter', type: 'br', price: 3000 }, { id: 'night', type: 'br', price: 4500 },
    { id: 'colosseum', type: 'duel', price: 0 }, { id: 'ruins', type: 'duel', price: 2500 }, { id: 'neon', type: 'duel', price: 4000 }
  ],
  achPts: [10, 25, 75, 200, 500], achCoins: [60, 150, 400, 1000, 2500],
  chains: [
    { id: 'wins', stat: 'wins', goals: [1, 5, 15, 40, 100], m: 1 },
    { id: 'streak', stat: 'bestStreak', kind: 'max', goals: [2, 3, 5, 10, 20], m: 3, special: true },
    { id: 'kills', stat: 'kills', goals: [10, 50, 200, 600, 2000], m: 1 },
    { id: 'matchKills', stat: 'maxMatchKills', kind: 'max', goals: [5, 8, 10, 12, 15], m: 3, special: true },
    { id: 'headshots', stat: 'headshots', goals: [5, 25, 100, 300, 1000], m: 1 },
    { id: 'longShot', stat: 'longShot', kind: 'max', goals: [50, 100, 160, 250, 400], m: 2 },
    { id: 'duelInsane', stat: 'duelInsaneWins', goals: [1, 3, 6, 10, 20], m: 3, special: true },
    { id: 'duelWins', stat: 'duelWins', goals: [1, 5, 15, 40, 100], m: 1.5 },
    { id: 'bike', stat: 'bikeKills', goals: [1, 3, 10, 25, 60], m: 1.5 },
    { id: 'explosive', stat: 'explosiveKills', goals: [1, 5, 20, 60, 150], m: 1.5 },
    { id: 'multi', stat: 'maxMulti', kind: 'max', goals: [2, 3, 4, 5, 6], m: 2 },
    { id: 'survive', stat: 'maxSurvive', kind: 'max', goals: [120, 240, 360, 480, 600], m: 1.5 },
    { id: 'games', stat: 'games', goals: [1, 10, 50, 150, 500], m: 1 },
    { id: 'swim', stat: 'swimDist', goals: [100, 500, 1500, 4000, 10000], m: 1 },
    { id: 'grass', stat: 'grassTime', goals: [30, 120, 400, 1200, 3600], m: 1 },
    { id: 'supply', stat: 'supply', goals: [1, 5, 15, 40, 100], m: 1 },
    { id: 'flawless', stat: 'flawless', goals: [1, 2, 3, 5, 10], m: 3, special: true },
    { id: 'pistolWin', stat: 'pistolWins', goals: [1, 2, 4, 8, 15], m: 3, special: true },
    { id: 'ultraWins', stat: 'ultraWins', goals: [1, 5, 15, 40, 100], m: 3, special: true },
    { id: 'exotic', stat: 'exotic', goals: [1], m: 10, special: true },
    { id: 'damage', stat: 'damage', goals: [1000, 10000, 50000, 200000, 1000000], m: 1 },
    { id: 'insaneKills', stat: 'insaneKills', goals: [10, 50, 200, 600, 2000], m: 2 },
    { id: 'ghost', stat: 'ghostWins', goals: [1, 3, 6, 12, 25], m: 3, special: true },
    { id: 'distance', stat: 'distance', goals: [1000, 10000, 50000, 200000, 1000000], m: 1 }
  ],
  missions: [
    { id: 'kills', stat: 'kills', g: [3, 8, 15] }, { id: 'wins', stat: 'wins', g: [1, 2, 3] }, { id: 'play', stat: 'games', g: [2, 4, 6] },
    { id: 'headshots', stat: 'headshots', g: [3, 8, 15] }, { id: 'explosive', stat: 'explosiveKills', g: [1, 3, 5] }, { id: 'bike', stat: 'bikeKills', g: [1, 2, 4] },
    { id: 'survive', stat: 'maxSurvive', kind: 'max', g: [150, 240, 330] }, { id: 'grass', stat: 'grassTime', g: [30, 75, 150] }, { id: 'swim', stat: 'swimDist', g: [40, 120, 250] },
    { id: 'supply', stat: 'supply', g: [1, 2, 3] }, { id: 'damage', stat: 'damage', g: [400, 1200, 2500] }, { id: 'duel', stat: 'duelWins', g: [1, 2, 3] }
  ],
  missionReward: [{ coins: 100, pts: 10 }, { coins: 260, pts: 25 }, { coins: 620, pts: 60 }]
};
