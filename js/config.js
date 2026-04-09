/**
 * SPICE MARKET SIMULATOR – Configuration
 * =======================================
 * Edit the values below to customise the game.
 *
 * DATABASE MODES
 *  'demo'     – Uses localStorage + BroadcastChannel.
 *               Works for multiple tabs in the SAME browser on ONE device.
 *               Great for testing or a single-computer classroom.
 *  'firebase' – Uses Firebase Realtime Database.
 *               Works for multiple devices over any network.
 *               See README.md for Firebase setup instructions.
 */
const CONFIG = {

  /* ── Admin ─────────────────────────────────────────────────────────── */
  ADMIN_CODE: 'SPICEMASTER1500',   // Change this to YOUR secret admin code

  /* ── Round ──────────────────────────────────────────────────────────── */
  ROUND_DURATION: 300,             // Round length in seconds (300 = 5 min)

  /* ── Prices ─────────────────────────────────────────────────────────── */
  STARTING_PRICES: {
    pepper:   100,
    cinnamon: 150,
    cardamom: 200,
  },
  STARTING_GOLD:       500,        // Gold coins every player starts with
  MAX_FLUCTUATION:     0.05,       // Max random ±% per price tick (0.04 = ±4 %)
  BUY_PRICE_IMPACT:    0.03,       // Price increase when someone buys (2 %)
  SELL_PRICE_IMPACT:   0.03,       // Price decrease when someone sells (2 %)
  MIN_PRICE:           10,         // Prices never fall below this

  /* ── Timing ─────────────────────────────────────────────────────────── */
  PRICE_UPDATE_INTERVAL: 3000,     // ms between automatic price ticks
  EVENT_MIN_INTERVAL:   15000,     // ms minimum gap between random events
  EVENT_MAX_INTERVAL:   35000,     // ms maximum gap between random events

  /* ── Chart ──────────────────────────────────────────────────────────── */
  CHART_HISTORY_POINTS: 30,        // Number of data points shown on chart

  /* ── Database mode ──────────────────────────────────────────────────── */
  DB_MODE: 'demo',                 // 'demo' | 'firebase'

  /* ── Firebase config (only needed when DB_MODE = 'firebase') ─────────
   * 1. Go to https://console.firebase.google.com and create a project.
   * 2. Enable the Realtime Database (start in test mode for the event).
   * 3. Copy your project's config object here.
   * 4. Change DB_MODE above to 'firebase'.
   * 5. See README.md for the required Realtime Database security rules.
   */
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyDjXUwoP0nYwU0ANF73Zr77CYr9hRDz5Rw",
    authDomain: "geschichte-spiel.firebaseapp.com",
    databaseURL: "https://geschichte-spiel-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "geschichte-spiel",
    storageBucket: "geschichte-spiel.firebasestorage.app",
    messagingSenderId: "82513844067",
    appId: "1:82513844067:web:9f58983ffa39ffbfd92556",
    measurementId: "G-S956XBWKE2"
  },
};
