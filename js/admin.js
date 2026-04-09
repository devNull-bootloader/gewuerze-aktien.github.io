/**
 * SPICE MARKET SIMULATOR – Admin Page Logic
 * ==========================================
 * Runs on admin.html.
 * Responsibilities:
 *  - Authenticate admin via code
 *  - Start / stop rounds
 *  - Drive the price simulation (setInterval)
 *  - Schedule and dispatch random historical events
 *  - Show live leaderboard, price overview, event log
 */

/* ── Module-level state ────────────────────────────────────────────────── */
let db;
let priceInterval    = null;
let eventTimeout     = null;
let leaderboardInterval = null;
let currentPrices    = { ...CONFIG.STARTING_PRICES };
let roundActive      = false;
let roundStartTime   = null;
let tradingMode      = false;
let tradingChart     = null;
let latestGameState  = null;
const TRADING_VIEW_CODE = 'TRADING';
const TRADING_SPICE_META = {
  pepper:   { label: 'Pfeffer', color: '#e74c3c' },
  cinnamon: { label: 'Zimt', color: '#e67e22' },
  cardamom: { label: 'Kardamom', color: '#2ecc71' },
};

/* ── DOM refs (populated on DOMContentLoaded) ──────────────────────────── */
let loginSection, adminPanel, codeInput, loginError;
let tradingPanel, tradingChartCanvas;
let btnStart, btnStop, btnReset;
let timerDisplay, timerDisplayLarge;
let lbBody;
let priceEls = {};          // { pepper: el, cinnamon: el, cardamom: el }
let eventLogEl;
let eventBannerEl;
let manualEventBtns;

/* ════════════════════════════════════════════════════════════════════════
 * Bootstrap
 * ════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  bindDOMRefs();
  setupLoginForm();

  // Check if already authenticated this session
  const savedAuth = sessionStorage.getItem('spice_admin_auth');
  const savedMode = sessionStorage.getItem('spice_admin_mode');
  if (savedAuth === CONFIG.ADMIN_CODE || (savedAuth === TRADING_VIEW_CODE && savedMode === 'trading')) {
    tradingMode = savedAuth === TRADING_VIEW_CODE && savedMode === 'trading';
    showAuthenticatedView();
    await bootByMode();
  }
});

/* ── DOM binding ────────────────────────────────────────────────────────── */
function bindDOMRefs() {
  loginSection  = document.getElementById('login-section');
  adminPanel    = document.getElementById('admin-panel');
  tradingPanel  = document.getElementById('trading-panel');
  tradingChartCanvas = document.getElementById('trading-price-chart');
  codeInput     = document.getElementById('admin-code-input');
  loginError    = document.getElementById('login-error');
  btnStart      = document.getElementById('btn-start');
  btnStop       = document.getElementById('btn-stop');
  btnReset      = document.getElementById('btn-reset');
  timerDisplay      = document.getElementById('timer-display');
  timerDisplayLarge = document.getElementById('timer-display-large');
  lbBody        = document.getElementById('leaderboard-body');
  eventLogEl    = document.getElementById('event-log');
  eventBannerEl = document.getElementById('event-banner');
  manualEventBtns = document.querySelectorAll('[data-event-idx]');

  // Price display elements
  for (const spice of ['pepper', 'cinnamon', 'cardamom']) {
    priceEls[spice] = document.getElementById(`price-${spice}`);
  }
}

/* ── Login ──────────────────────────────────────────────────────────────── */
function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entered = codeInput.value.trim();
    if (entered === CONFIG.ADMIN_CODE || entered === TRADING_VIEW_CODE) {
      tradingMode = entered === TRADING_VIEW_CODE;
      sessionStorage.setItem('spice_admin_auth', entered);
      sessionStorage.setItem('spice_admin_mode', tradingMode ? 'trading' : 'admin');
      loginError.textContent = '';
      showAuthenticatedView();
      await bootByMode();
    } else {
      loginError.textContent = '❌ Falscher Code. Bitte erneut versuchen.';
      codeInput.value = '';
      codeInput.focus();
    }
  });
}

function showAuthenticatedView() {
  if (tradingMode) showTradingPanel();
  else showAdminPanel();
}

function showAdminPanel() {
  loginSection.classList.add('hidden');
  tradingPanel?.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  document.body.classList.remove('trading-only');
}

function showTradingPanel() {
  loginSection.classList.add('hidden');
  adminPanel.classList.add('hidden');
  tradingPanel?.classList.remove('hidden');
  document.body.classList.add('trading-only');
}

async function bootByMode() {
  if (tradingMode) await bootTradingPanel();
  else await bootAdminPanel();
}

/* ════════════════════════════════════════════════════════════════════════
 * Admin panel boot
 * ════════════════════════════════════════════════════════════════════════ */
async function bootAdminPanel() {
  db = createDB(CONFIG);
  await db.init();

  // Subscribe to live updates
  db.subscribeGameState(onGameStateUpdate);
  db.subscribePlayers(onPlayersUpdate);

  // Wire buttons
  btnStart.addEventListener('click', startRound);
  btnStop.addEventListener('click',  stopRound);
  btnReset.addEventListener('click', resetGame);

  // Manual event injection buttons
  manualEventBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.eventIdx, 10);
      if (HISTORICAL_EVENTS[idx]) fireEvent(HISTORICAL_EVENTS[idx]);
    });
  });

  // Load current state
  const gs = await db.getGameState();
  applyGameState(gs);

  // If a round is already active (e.g., page was refreshed), resume simulation
  if (gs.active) {
    currentPrices = { ...gs.prices };
    resumeSimulation();
  }

  // Update leaderboard immediately and every 5 s
  const players = await db.getPlayers();
  renderLeaderboard(players, gs.prices);
}

async function bootTradingPanel() {
  db = createDB(CONFIG);
  await db.init();
  initTradingChart();
  db.subscribeGameState(onGameStateUpdate);
  const gs = await db.getGameState();
  latestGameState = gs;
  applyGameState(gs);
  updateTradingChart(gs.priceHistory || {}, gs.prices || currentPrices);
}

/* ════════════════════════════════════════════════════════════════════════
 * Round management
 * ════════════════════════════════════════════════════════════════════════ */
async function startRound() {
  if (roundActive) return;
  roundActive   = true;
  roundStartTime = Date.now();

  currentPrices = { ...CONFIG.STARTING_PRICES };
  await db.setRoundState(true, roundStartTime);
  await db.updatePrices(currentPrices, { ...currentPrices });

  btnStart.disabled = true;
  btnStop.disabled  = false;

  startSimulation();
}

async function stopRound() {
  roundActive = false;
  clearSimulation();

  await db.setRoundState(false, null);

  btnStart.disabled = false;
  btnStop.disabled  = true;
  timerDisplay.textContent = '—';
  if (timerDisplayLarge) timerDisplayLarge.textContent = '—';

  // Snapshot leaderboard
  const players = await db.getPlayers();
  renderLeaderboard(players, currentPrices);
}

async function resetGame() {
  if (!confirm('Alle Spielerportfolios und Preise zurücksetzen? Dies kann nicht rückgängig gemacht werden.')) return;
  roundActive = false;
  clearSimulation();

  await db.resetGame(CONFIG.STARTING_PRICES, CONFIG.STARTING_GOLD);
  currentPrices = { ...CONFIG.STARTING_PRICES };

  btnStart.disabled = false;
  btnStop.disabled  = true;
  timerDisplay.textContent = formatTime(CONFIG.ROUND_DURATION);
  if (timerDisplayLarge) timerDisplayLarge.textContent = formatTime(CONFIG.ROUND_DURATION);
  updatePriceDisplays(currentPrices);
}

/* ════════════════════════════════════════════════════════════════════════
 * Price Simulation
 * ════════════════════════════════════════════════════════════════════════ */
function startSimulation() {
  clearSimulation();
  priceInterval = setInterval(priceTick, CONFIG.PRICE_UPDATE_INTERVAL);
  scheduleNextEvent();
}

function resumeSimulation() {
  roundActive = true;
  // roundStartTime is already set from the loaded game state in applyGameState().
  // If somehow it's missing, fall back to treating the full round as just starting.
  if (!roundStartTime) roundStartTime = Date.now();
  startSimulation();
}

function clearSimulation() {
  if (priceInterval)  clearInterval(priceInterval);
  if (eventTimeout)   clearTimeout(eventTimeout);
  priceInterval = null;
  eventTimeout  = null;
}

/** Called every PRICE_UPDATE_INTERVAL ms during an active round. */
async function priceTick() {
  if (!roundActive) return;

  // Check if time is up
  const elapsed = (Date.now() - roundStartTime) / 1000;
  if (elapsed >= CONFIG.ROUND_DURATION) {
    await stopRound();
    return;
  }

  // Random fluctuation
  currentPrices = applyRandomFluctuation(currentPrices, CONFIG.MAX_FLUCTUATION, CONFIG.MIN_PRICE);
  await db.updatePrices(currentPrices, { ...currentPrices });
  updatePriceDisplays(currentPrices);

  // Update timer
  const t = formatTime(CONFIG.ROUND_DURATION - elapsed);
  timerDisplay.textContent = t;
  if (timerDisplayLarge) timerDisplayLarge.textContent = t;
}

function remainingTime() {
  if (!roundStartTime) return CONFIG.ROUND_DURATION;
  return Math.max(0, CONFIG.ROUND_DURATION - (Date.now() - roundStartTime) / 1000);
}

/* ════════════════════════════════════════════════════════════════════════
 * Historical Events
 * ════════════════════════════════════════════════════════════════════════ */
function scheduleNextEvent() {
  const delay = CONFIG.EVENT_MIN_INTERVAL +
    Math.random() * (CONFIG.EVENT_MAX_INTERVAL - CONFIG.EVENT_MIN_INTERVAL);
  eventTimeout = setTimeout(() => {
    if (!roundActive) return;
    const event = HISTORICAL_EVENTS[Math.floor(Math.random() * HISTORICAL_EVENTS.length)];
    fireEvent(event);
    scheduleNextEvent(); // schedule the next one
  }, delay);
}

async function fireEvent(event) {
  // Apply price effects
  currentPrices = applyEventEffects(currentPrices, event.effects, CONFIG.MIN_PRICE);
  await db.updatePrices(currentPrices, { ...currentPrices });
  await db.setCurrentEvent({ text: event.text, type: event.type, ts: Date.now() });

  updatePriceDisplays(currentPrices);
  showEventBanner(event);
  appendEventLog(event);

  // Clear current event after 8 s
  setTimeout(() => db.setCurrentEvent(null), 8000);
}

/* ════════════════════════════════════════════════════════════════════════
 * Reactive updates from DB
 * ════════════════════════════════════════════════════════════════════════ */
function onGameStateUpdate(gs) {
  latestGameState = gs;
  applyGameState(gs);
  if (tradingMode) updateTradingChart(gs.priceHistory || {}, gs.prices || currentPrices);
}

function applyGameState(gs) {
  roundActive    = gs.active;
  roundStartTime = gs.startTime;
  if (gs.prices) {
    currentPrices = { ...gs.prices };
    updatePriceDisplays(currentPrices);
  }

  btnStart.disabled = gs.active;
  btnStop.disabled  = !gs.active;

  if (gs.active && gs.startTime) {
    const elapsed = (Date.now() - gs.startTime) / 1000;
    const t = formatTime(CONFIG.ROUND_DURATION - elapsed);
    timerDisplay.textContent = t;
    if (timerDisplayLarge) timerDisplayLarge.textContent = t;
  } else {
    const t = gs.active ? '…' : formatTime(CONFIG.ROUND_DURATION);
    timerDisplay.textContent = t;
    if (timerDisplayLarge) timerDisplayLarge.textContent = t;
  }
}

function onPlayersUpdate(players) {
  renderLeaderboard(players, currentPrices);
}

/* ════════════════════════════════════════════════════════════════════════
 * UI helpers
 * ════════════════════════════════════════════════════════════════════════ */
function updatePriceDisplays(prices) {
  for (const spice of Object.keys(prices)) {
    if (priceEls[spice]) priceEls[spice].textContent = formatGold(prices[spice]);
  }
}

function renderLeaderboard(players, prices) {
  if (!lbBody) return;
  const entries = Object.values(players)
    .filter(p => p.name)
    .map(p => ({
      name:     p.name,
      gold:     p.gold || 0,
      holdings: p.holdings || { pepper: 0, cinnamon: 0, cardamom: 0 },
      worth:    calcNetWorth(p.gold || 0, p.holdings || {}, prices),
    }))
    .sort((a, b) => b.worth - a.worth);

  lbBody.innerHTML = '';
  entries.forEach((e, i) => {
    const tr = document.createElement('tr');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    tr.innerHTML = `
      <td>${medal}</td>
      <td>${escHtml(e.name)}</td>
      <td>${formatGold(e.worth)}</td>
      <td>${formatGold(e.gold)}</td>
      <td>${e.holdings.pepper || 0} / ${e.holdings.cinnamon || 0} / ${e.holdings.cardamom || 0}</td>`;
    if (i === 0) tr.classList.add('rank-gold');
    else if (i === 1) tr.classList.add('rank-silver');
    else if (i === 2) tr.classList.add('rank-bronze');
    lbBody.appendChild(tr);
  });

  if (!entries.length) {
    lbBody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.6">Noch keine Spieler</td></tr>';
  }
}

function showEventBanner(event) {
  if (!eventBannerEl) return;
  eventBannerEl.textContent = event.text;
  eventBannerEl.className = `event-banner event-${event.type} show`;
  setTimeout(() => eventBannerEl.classList.remove('show'), 7000);
}

function appendEventLog(event) {
  if (!eventLogEl) return;
  const li = document.createElement('li');
  li.className = `event-log-item event-${event.type}`;
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `<span class="event-time">${t}</span> ${escHtml(event.text)}`;
  eventLogEl.prepend(li);
  // Keep max 20 items
  while (eventLogEl.children.length > 20) eventLogEl.lastChild.remove();
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initTradingChart() {
  if (!tradingChartCanvas || typeof Chart === 'undefined') return;
  const ctx = tradingChartCanvas.getContext('2d');
  if (!ctx) return;

  const labels = Array.from({ length: CONFIG.CHART_HISTORY_POINTS }, (_, i) => i + 1);
  tradingChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: Object.entries(TRADING_SPICE_META).map(([spice, meta]) => ({
        label: meta.label,
        data: Array(CONFIG.CHART_HISTORY_POINTS).fill(null),
        borderColor: meta.color,
        backgroundColor: `${meta.color}22`,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      scales: {
        x: { display: false },
        y: {
          ticks: { color: '#c9a84c' },
          grid: { color: 'rgba(212,160,23,0.15)' },
        },
      },
      plugins: {
        legend: { labels: { color: '#f5e6c8', font: { size: 13 } } },
        tooltip: {
          callbacks: { label: context => ` ${context.dataset.label}: ${formatGold(context.parsed.y)}` },
        },
      },
    },
  });
}

function updateTradingChart(priceHistory, prices) {
  if (!tradingChart) return;
  const points = CONFIG.CHART_HISTORY_POINTS;
  const spices = Object.keys(TRADING_SPICE_META);
  spices.forEach((spice, idx) => {
    const history = Array.isArray(priceHistory?.[spice]) ? [...priceHistory[spice]] : [];
    if (!history.length && prices?.[spice] !== undefined) history.push(prices[spice]);
    const padded = Array(Math.max(0, points - history.length)).fill(null).concat(history.slice(-points));
    tradingChart.data.datasets[idx].data = padded;
  });
  tradingChart.update('none');
}
