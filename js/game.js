/**
 * SPICE MARKET SIMULATOR – Shared Game Logic
 * ===========================================
 * Historical events, price helpers, and formatting utilities used by
 * both the player page and the admin page.
 */

/* ── Historical Events ──────────────────────────────────────────────── */
// Each event has: text, effects (multipliers per spice), type (for CSS)
const HISTORICAL_EVENTS = [
  {
    text: '☔ Monsoon Delayed! Pepper supply cut short.',
    effects: { pepper: +0.50 },
    type: 'bad',
  },
  {
    text: '⚓ Portuguese Fleet Sighted Off Calicut! Panic selling!',
    effects: { pepper: -0.30, cinnamon: -0.25, cardamom: -0.20 },
    type: 'crash',
  },
  {
    text: '👑 Mughal Emperor Imposes New Tax on Cardamom!',
    effects: { cardamom: +0.40 },
    type: 'bad',
  },
  {
    text: '🌊 Storm Destroys Cinnamon Fleet in the Indian Ocean!',
    effects: { cinnamon: +0.60 },
    type: 'bad',
  },
  {
    text: '🛡️ Venetian Merchants Corner the Pepper Market!',
    effects: { pepper: +0.35 },
    type: 'bad',
  },
  {
    text: '💀 Plague Reaches Calicut! All trade disrupted!',
    effects: { pepper: +0.25, cinnamon: +0.20, cardamom: +0.15 },
    type: 'bad',
  },
  {
    text: '🚢 Dutch Traders Arrive in Lisbon! Competition is fierce!',
    effects: { pepper: -0.15, cinnamon: -0.15, cardamom: -0.20 },
    type: 'good',
  },
  {
    text: '🛤️ Silk Route Reopens! Spices flood the market!',
    effects: { cinnamon: -0.25, cardamom: -0.20 },
    type: 'good',
  },
  {
    text: '⚔️ War on the Malabar Coast! Pepper trade blocked!',
    effects: { pepper: +0.45 },
    type: 'bad',
  },
  {
    text: '🎉 Sultan of Malacca Grants New Trading Rights!',
    effects: { cinnamon: +0.30, cardamom: +0.25 },
    type: 'special',
  },
  {
    text: '🔥 Warehouse Fire Destroys Pepper Reserves!',
    effects: { pepper: +0.55 },
    type: 'bad',
  },
  {
    text: '✝️ Pope Bans Trade with the Ottoman Empire!',
    effects: { cardamom: +0.35, cinnamon: +0.30 },
    type: 'bad',
  },
  {
    text: '🌿 Bumper Harvest in Ceylon — Cardamom Floods the Market!',
    effects: { cardamom: -0.35 },
    type: 'good',
  },
  {
    text: '💰 Medici Bank Funds a New Spice Expedition!',
    effects: { pepper: +0.20, cinnamon: +0.15, cardamom: +0.10 },
    type: 'special',
  },
  {
    text: '🏴‍☠️ Pirates Hijack Cinnamon Shipment Near Goa!',
    effects: { cinnamon: +0.50 },
    type: 'bad',
  },
  {
    text: '🌞 Perfect Growing Season — All Spices Abundant!',
    effects: { pepper: -0.20, cinnamon: -0.20, cardamom: -0.25 },
    type: 'good',
  },
  {
    text: '🐘 Elephant Caravans Blocked at Mountain Pass!',
    effects: { cardamom: +0.30, pepper: +0.15 },
    type: 'bad',
  },
  {
    text: '⚡ Lightning Strikes Spice Depot in Cochin!',
    effects: { pepper: +0.40, cinnamon: +0.20 },
    type: 'bad',
  },
];

/* ── Price helpers ──────────────────────────────────────────────────── */

/**
 * Apply random price fluctuation to a prices object.
 * Returns a NEW prices object (does not mutate the original).
 * @param {Object} prices  – { pepper, cinnamon, cardamom }
 * @param {number} maxFlux – maximum absolute fraction (e.g. 0.04 for ±4 %)
 * @param {number} minPrice
 * @returns {Object}
 */
function applyRandomFluctuation(prices, maxFlux, minPrice) {
  const result = {};
  for (const spice of Object.keys(prices)) {
    const delta = (Math.random() * 2 - 1) * maxFlux;
    result[spice] = Math.max(minPrice, Math.round(prices[spice] * (1 + delta)));
  }
  return result;
}

/**
 * Apply a historical event's effects to a prices object.
 * Returns a NEW prices object.
 * @param {Object} prices  – { pepper, cinnamon, cardamom }
 * @param {Object} effects – partial { spice: multiplier } (e.g. { pepper: 0.5 })
 * @param {number} minPrice
 * @returns {Object}
 */
function applyEventEffects(prices, effects, minPrice) {
  const result = { ...prices };
  for (const [spice, multiplier] of Object.entries(effects)) {
    if (result[spice] !== undefined) {
      result[spice] = Math.max(minPrice, Math.round(result[spice] * (1 + multiplier)));
    }
  }
  return result;
}

/**
 * Apply a single buy/sell trade price impact.
 * Returns a NEW prices object.
 * @param {Object} prices
 * @param {string} spice   – 'pepper' | 'cinnamon' | 'cardamom'
 * @param {'buy'|'sell'} type
 * @param {number} impact  – fraction (CONFIG.BUY_PRICE_IMPACT)
 * @param {number} minPrice
 * @returns {Object}
 */
function applyTradeImpact(prices, spice, type, impact, minPrice) {
  const result = { ...prices };
  const direction = type === 'buy' ? 1 : -1;
  result[spice] = Math.max(minPrice, Math.round(result[spice] * (1 + direction * impact)));
  return result;
}

/* ── Formatting helpers ─────────────────────────────────────────────── */

/**
 * Format a number as "1,234 ⚜" (gold coins).
 * @param {number} amount
 * @returns {string}
 */
function formatGold(amount) {
  return Math.floor(amount).toLocaleString() + ' ⚜';
}

/**
 * Format seconds as "M:SS".
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Calculate net worth for a player.
 * @param {number} gold
 * @param {Object} holdings – { pepper, cinnamon, cardamom }
 * @param {Object} prices   – { pepper, cinnamon, cardamom }
 * @returns {number}
 */
function calcNetWorth(gold, holdings, prices) {
  let worth = gold;
  for (const spice of Object.keys(holdings)) {
    worth += (holdings[spice] || 0) * (prices[spice] || 0);
  }
  return Math.floor(worth);
}

/**
 * Generate a random alphanumeric player ID.
 * @returns {string}
 */
function generatePlayerId() {
  return Math.random().toString(36).slice(2, 10) +
         Math.random().toString(36).slice(2, 10);
}
