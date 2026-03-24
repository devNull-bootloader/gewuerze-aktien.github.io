/**
 * SPICE MARKET SIMULATOR – Database Abstraction Layer
 * ====================================================
 * Provides a unified API for storing game state.
 *
 * DB_MODE = 'demo':
 *   Uses localStorage + BroadcastChannel.
 *   All tabs in the SAME browser on ONE device share state in real-time.
 *   Perfect for single-computer testing / projector demos.
 *
 * DB_MODE = 'firebase':
 *   Uses Firebase Realtime Database.
 *   Works across any number of devices on any network.
 *   Requires Firebase project setup (see README.md).
 *
 * Public API (async unless noted):
 *   db.init()
 *   db.subscribeGameState(fn)     – fn(gameState) called on every change
 *   db.subscribePlayers(fn)       – fn(playersMap) called on every change
 *   db.getGameState()             → gameState object
 *   db.getPlayers()               → { [id]: player }
 *   db.setRoundState(active, startTime)
 *   db.updatePrices(prices, historyPoint)
 *   db.setCurrentEvent(eventObj | null)
 *   db.upsertPlayer(id, data)
 *   db.updatePlayerPortfolio(id, gold, holdings)
 *   db.applyPriceImpact(spice, direction, impact, minPrice)
 *   db.resetGame(startingPrices, startingGold)
 */

/* ── Default game-state shape ─────────────────────────────────────────── */
function defaultGameState(startingPrices) {
  return {
    active: false,
    startTime: null,
    prices: { ...startingPrices },
    priceHistory: {
      pepper:   [],
      cinnamon: [],
      cardamom: [],
    },
    currentEvent: null,
    eventLog: [],
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * DEMO DB  (localStorage + BroadcastChannel)
 * ════════════════════════════════════════════════════════════════════════ */
class DemoDB {
  constructor(config) {
    this._cfg = config;
    this._gsKey = 'spicemarket_gamestate';
    this._plKey = 'spicemarket_players';
    this._channel = null;
    this._gsListeners = [];
    this._plListeners = [];
  }

  async init() {
    // Ensure defaults exist
    if (!localStorage.getItem(this._gsKey)) {
      this._writeGS(defaultGameState(this._cfg.STARTING_PRICES));
    }
    if (!localStorage.getItem(this._plKey)) {
      this._writePL({});
    }

    // BroadcastChannel gives cross-tab updates instantly
    if (typeof BroadcastChannel !== 'undefined') {
      this._channel = new BroadcastChannel('spicemarket');
      this._channel.onmessage = (e) => {
        if (e.data.type === 'gs') this._notifyGS(e.data.payload);
        if (e.data.type === 'pl') this._notifyPL(e.data.payload);
      };
    }

    // Also listen to storage events (for browsers without BroadcastChannel)
    window.addEventListener('storage', (e) => {
      if (e.key === this._gsKey && e.newValue) {
        this._notifyGS(JSON.parse(e.newValue));
      }
      if (e.key === this._plKey && e.newValue) {
        this._notifyPL(JSON.parse(e.newValue));
      }
    });
  }

  subscribeGameState(fn) { this._gsListeners.push(fn); }
  subscribePlayers(fn)   { this._plListeners.push(fn); }

  async getGameState() { return this._readGS(); }
  async getPlayers()   { return this._readPL(); }

  async setRoundState(active, startTime) {
    const gs = this._readGS();
    gs.active = active;
    gs.startTime = startTime;
    this._broadcast_gs(gs);
  }

  async updatePrices(prices, historyPoint) {
    const gs = this._readGS();
    gs.prices = prices;
    for (const spice of Object.keys(historyPoint)) {
      if (!gs.priceHistory[spice]) gs.priceHistory[spice] = [];
      gs.priceHistory[spice].push(historyPoint[spice]);
      if (gs.priceHistory[spice].length > this._cfg.CHART_HISTORY_POINTS) {
        gs.priceHistory[spice].shift();
      }
    }
    this._broadcast_gs(gs);
  }

  async setCurrentEvent(event) {
    const gs = this._readGS();
    gs.currentEvent = event;
    if (event) {
      gs.eventLog = [event, ...(gs.eventLog || [])].slice(0, 20);
    }
    this._broadcast_gs(gs);
  }

  async upsertPlayer(id, data) {
    const pl = this._readPL();
    pl[id] = { ...(pl[id] || {}), ...data };
    this._broadcast_pl(pl);
  }

  async updatePlayerPortfolio(id, gold, holdings) {
    const pl = this._readPL();
    if (!pl[id]) return;
    pl[id].gold = gold;
    pl[id].holdings = holdings;
    this._broadcast_pl(pl);
  }

  async applyPriceImpact(spice, direction, impact, minPrice) {
    const gs = this._readGS();
    const current = gs.prices[spice] || 0;
    gs.prices[spice] = Math.max(minPrice, Math.round(current * (1 + direction * impact)));
    this._broadcast_gs(gs);
  }

  async resetGame(startingPrices, startingGold) {
    this._broadcast_gs(defaultGameState(startingPrices));
    // Reset all player gold / holdings but keep names
    const pl = this._readPL();
    for (const id of Object.keys(pl)) {
      pl[id].gold = startingGold;
      pl[id].holdings = { pepper: 0, cinnamon: 0, cardamom: 0 };
    }
    this._broadcast_pl(pl);
  }

  /* ── private ── */
  _readGS()  { return JSON.parse(localStorage.getItem(this._gsKey) || 'null') || defaultGameState(this._cfg.STARTING_PRICES); }
  _readPL()  { return JSON.parse(localStorage.getItem(this._plKey) || '{}'); }

  _writeGS(gs) { localStorage.setItem(this._gsKey, JSON.stringify(gs)); }
  _writePL(pl) { localStorage.setItem(this._plKey, JSON.stringify(pl)); }

  _broadcast_gs(gs) {
    this._writeGS(gs);
    if (this._channel) this._channel.postMessage({ type: 'gs', payload: gs });
    this._notifyGS(gs);
  }
  _broadcast_pl(pl) {
    this._writePL(pl);
    if (this._channel) this._channel.postMessage({ type: 'pl', payload: pl });
    this._notifyPL(pl);
  }

  _notifyGS(gs) { this._gsListeners.forEach(fn => fn(gs)); }
  _notifyPL(pl) { this._plListeners.forEach(fn => fn(pl)); }
}

/* ════════════════════════════════════════════════════════════════════════
 * FIREBASE DB  (Firebase Realtime Database)
 * ════════════════════════════════════════════════════════════════════════ */
class FirebaseDB {
  constructor(config) {
    this._cfg = config;
    this._db = null;
    this._gsRef = null;
    this._plRef = null;
  }

  async init() {
    // Firebase SDK must be loaded via CDN before this runs.
    // The SDK is loaded in admin.html and index.html when DB_MODE === 'firebase'.
    if (!window.firebase) throw new Error('Firebase SDK not loaded.');

    firebase.initializeApp(this._cfg.FIREBASE_CONFIG);
    this._db = firebase.database();
    this._gsRef = this._db.ref('game/state');
    this._plRef = this._db.ref('game/players');

    // Ensure default game state exists
    const snap = await this._gsRef.once('value');
    if (!snap.exists()) {
      await this._gsRef.set(defaultGameState(this._cfg.STARTING_PRICES));
    }
  }

  subscribeGameState(fn) {
    this._gsRef.on('value', snap => fn(snap.val() || defaultGameState(this._cfg.STARTING_PRICES)));
  }
  subscribePlayers(fn) {
    this._plRef.on('value', snap => fn(snap.val() || {}));
  }

  async getGameState() {
    const snap = await this._gsRef.once('value');
    return snap.val() || defaultGameState(this._cfg.STARTING_PRICES);
  }
  async getPlayers() {
    const snap = await this._plRef.once('value');
    return snap.val() || {};
  }

  async setRoundState(active, startTime) {
    await this._gsRef.update({ active, startTime });
  }

  async updatePrices(prices, historyPoint) {
    const snap = await this._gsRef.child('priceHistory').once('value');
    const hist = snap.val() || { pepper: [], cinnamon: [], cardamom: [] };
    const maxPts = this._cfg.CHART_HISTORY_POINTS;
    for (const spice of Object.keys(historyPoint)) {
      const arr = hist[spice] || [];
      arr.push(historyPoint[spice]);
      if (arr.length > maxPts) arr.splice(0, arr.length - maxPts);
      hist[spice] = arr;
    }
    await this._gsRef.update({ prices, priceHistory: hist });
  }

  async setCurrentEvent(event) {
    const updates = { currentEvent: event || null };
    if (event) {
      // prepend to event log
      const snap = await this._gsRef.child('eventLog').once('value');
      const log = snap.val() || [];
      log.unshift(event);
      updates.eventLog = log.slice(0, 20);
    }
    await this._gsRef.update(updates);
  }

  async upsertPlayer(id, data) {
    await this._plRef.child(id).update(data);
  }

  async updatePlayerPortfolio(id, gold, holdings) {
    await this._plRef.child(id).update({ gold, holdings });
  }

  async applyPriceImpact(spice, direction, impact, minPrice) {
    const snap = await this._gsRef.child('prices').once('value');
    const prices = snap.val() || {};
    const current = prices[spice] || 0;
    prices[spice] = Math.max(minPrice, Math.round(current * (1 + direction * impact)));
    await this._gsRef.child('prices').set(prices);
  }

  async resetGame(startingPrices, startingGold) {
    await this._gsRef.set(defaultGameState(startingPrices));
    const snap = await this._plRef.once('value');
    const players = snap.val() || {};
    const updates = {};
    for (const id of Object.keys(players)) {
      updates[`${id}/gold`] = startingGold;
      updates[`${id}/holdings`] = { pepper: 0, cinnamon: 0, cardamom: 0 };
    }
    if (Object.keys(updates).length) await this._plRef.update(updates);
  }
}

/* ── Factory ──────────────────────────────────────────────────────────── */
// Instantiated by admin.js and player.js after CONFIG is loaded.
function createDB(config) {
  if (config.DB_MODE === 'firebase') return new FirebaseDB(config);
  return new DemoDB(config);
}
