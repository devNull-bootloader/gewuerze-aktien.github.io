/**
 * SPICE MARKET SIMULATOR – Player Page Logic
 * ===========================================
 * Runs on index.html.
 * Responsibilities:
 *  - Join screen (enter trading name)
 *  - Live price chart (Chart.js)
 *  - Spice price cards with buy/sell buttons
 *  - Portfolio display (gold, holdings, net worth)
 *  - Historical event notifications
 *  - Timer countdown
 */

/* ── Module-level state ─────────────────────────────────────────────────── */
let db;
let playerId   = null;
let playerName = null;
let playerGold     = CONFIG.STARTING_GOLD;
let playerHoldings = { pepper: 0, cinnamon: 0, cardamom: 0 };
let currentPrices  = { ...CONFIG.STARTING_PRICES };
let roundActive    = false;
let roundStartTime = null;
let priceChart     = null;
let timerInterval  = null;
let lastEventTs    = 0;   // prevent re-showing the same event
let latestPlayers  = {};

/* ── Spice display metadata ─────────────────────────────────────────────── */
const SPICE_META = {
  pepper:   { label: 'Pfeffer',   color: '#e74c3c', emoji: '🌶️' },
  cinnamon: { label: 'Zimt',      color: '#e67e22', emoji: '🪵' },
  cardamom: { label: 'Kardamom',  color: '#2ecc71', emoji: '🌿' },
};

/* ════════════════════════════════════════════════════════════════════════
 * Bootstrap
 * ════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  db = createDB(CONFIG);
  await db.init();

  // Subscribe to live updates
  db.subscribeGameState(onGameStateUpdate);
  db.subscribePlayers(onPlayersUpdate);

  // Load initial game state FIRST (so roundActive is set before showGameUI)
  const gs = await db.getGameState();
  onGameStateUpdate(gs);

  // Check for existing player session
  playerId = localStorage.getItem('spicemarket_player_id');
  if (playerId) {
    const players = await db.getPlayers();
    if (players[playerId]) {
      playerName     = players[playerId].name;
      playerGold     = players[playerId].gold     ?? CONFIG.STARTING_GOLD;
      playerHoldings = players[playerId].holdings ?? { pepper: 0, cinnamon: 0, cardamom: 0 };
      showGameUI();
    } else {
      playerId = null;
      localStorage.removeItem('spicemarket_player_id');
      showJoinScreen();
    }
  } else {
    showJoinScreen();
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * Join flow
 * ════════════════════════════════════════════════════════════════════════ */
function showJoinScreen() {
  document.getElementById('join-screen').classList.remove('hidden');
  document.getElementById('game-ui').classList.add('hidden');

  const form = document.getElementById('join-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim().slice(0, 30);
    if (!name) return;

    playerId   = generatePlayerId();
    playerName = name;
    playerGold = CONFIG.STARTING_GOLD;
    playerHoldings = { pepper: 0, cinnamon: 0, cardamom: 0 };

    localStorage.setItem('spicemarket_player_id', playerId);
    await db.upsertPlayer(playerId, {
      name,
      gold:      playerGold,
      holdings:  playerHoldings,
      joinedAt:  Date.now(),
    });

    showGameUI();
  });
}

function showGameUI() {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');

  document.getElementById('player-name-display').textContent = playerName || 'Händler';
  initChart();
  renderSpiceCards();
  updatePortfolioDisplay();
  bindTradeButtons();

  // Set waiting overlay state based on current round status
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) overlay.classList.toggle('hidden', roundActive);
  updatePublicLeaderboardVisibility();
}

/* ════════════════════════════════════════════════════════════════════════
 * Chart
 * ════════════════════════════════════════════════════════════════════════ */
function initChart() {
  const ctx = document.getElementById('price-chart')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = Array.from({ length: CONFIG.CHART_HISTORY_POINTS }, (_, i) => i + 1);
  const emptyData = () => Array(CONFIG.CHART_HISTORY_POINTS).fill(null);

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: Object.entries(SPICE_META).map(([spice, meta]) => ({
        label:          meta.label,
        data:           emptyData(),
        borderColor:    meta.color,
        backgroundColor: meta.color + '22',
        borderWidth:    2,
        pointRadius:    2,
        tension:        0.3,
        fill:           false,
      })),
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 500 },
      scales: {
        x: {
          display: false,
        },
        y: {
          ticks: { color: '#c9a84c' },
          grid:  { color: 'rgba(212,160,23,0.15)' },
        },
      },
      plugins: {
        legend: {
          labels: { color: '#f5e6c8', font: { size: 13 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatGold(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

function updateChart(priceHistory) {
  if (!priceChart) return;
  const spices = Object.keys(SPICE_META);
  spices.forEach((spice, i) => {
    const hist = priceHistory[spice] || [];
    const pts  = CONFIG.CHART_HISTORY_POINTS;
    // Pad short history with nulls on the left
    const padded = Array(Math.max(0, pts - hist.length)).fill(null).concat(hist.slice(-pts));
    priceChart.data.datasets[i].data = padded;
  });
  priceChart.update('none');
}

/* ════════════════════════════════════════════════════════════════════════
 * Spice cards
 * ════════════════════════════════════════════════════════════════════════ */
function renderSpiceCards() {
  const container = document.getElementById('spice-cards');
  if (!container) return;
  container.innerHTML = '';

  for (const [spice, meta] of Object.entries(SPICE_META)) {
    container.insertAdjacentHTML('beforeend', `
      <div class="spice-card" id="card-${spice}" data-spice="${spice}">
        <div class="spice-icon">${meta.emoji}</div>
        <div class="spice-name">${meta.label}</div>
        <div class="spice-price" id="spice-price-${spice}">${formatGold(currentPrices[spice])}</div>
        <div class="spice-change" id="spice-change-${spice}"></div>
        <div class="trade-buttons">
          <button class="btn btn-buy"  data-spice="${spice}" data-action="buy">Kaufen 1 ⬆</button>
          <button class="btn btn-sell" data-spice="${spice}" data-action="sell">Verkaufen 1 ⬇</button>
        </div>
        <div class="holding-display" id="holding-${spice}">Bestand: 0</div>
      </div>`);
  }
  updateSpiceCardPrices(currentPrices, null);
}

function updateSpiceCardPrices(prices, prevPrices) {
  for (const spice of Object.keys(SPICE_META)) {
    const priceEl  = document.getElementById(`spice-price-${spice}`);
    const changeEl = document.getElementById(`spice-change-${spice}`);
    const card     = document.getElementById(`card-${spice}`);
    if (!priceEl) continue;

    priceEl.textContent = formatGold(prices[spice]);

    if (prevPrices && prevPrices[spice] !== undefined) {
      const diff = prices[spice] - prevPrices[spice];
      if (diff > 0) {
        changeEl.textContent = `▲ +${formatGold(diff)}`;
        changeEl.className   = 'spice-change price-up';
        card.classList.add('flash-up');
        setTimeout(() => card.classList.remove('flash-up'), 600);
      } else if (diff < 0) {
        changeEl.textContent = `▼ ${formatGold(diff)}`;
        changeEl.className   = 'spice-change price-down';
        card.classList.add('flash-down');
        setTimeout(() => card.classList.remove('flash-down'), 600);
      } else {
        changeEl.textContent = '–';
        changeEl.className   = 'spice-change';
      }
    }

    const holdingEl = document.getElementById(`holding-${spice}`);
    if (holdingEl) holdingEl.textContent = `Bestand: ${playerHoldings[spice] || 0}`;
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * Trade buttons
 * ════════════════════════════════════════════════════════════════════════ */
function bindTradeButtons() {
  document.getElementById('spice-cards')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const spice  = btn.dataset.spice;
    const action = btn.dataset.action;

    if (!roundActive) {
      showToast('⏳ Warte auf den Rundenbeginn!');
      return;
    }

    await executeTrade(spice, action);
  });
}

async function executeTrade(spice, action) {
  const price = currentPrices[spice];
  if (!price) return;

  if (action === 'buy') {
    if (playerGold < price) {
      showToast('❌ Nicht genug Gold!');
      return;
    }
    playerGold -= price;
    playerHoldings[spice] = (playerHoldings[spice] || 0) + 1;
  } else {
    if ((playerHoldings[spice] || 0) < 1) {
      showToast(`❌ Kein ${SPICE_META[spice].label} zum Verkaufen!`);
      return;
    }
    playerGold += price;
    playerHoldings[spice] -= 1;
  }

  // Apply price impact to market
  const direction = action === 'buy' ? 1 : -1;
  await db.applyPriceImpact(spice, direction, CONFIG.BUY_PRICE_IMPACT, CONFIG.MIN_PRICE);

  // Persist portfolio
  await db.updatePlayerPortfolio(playerId, playerGold, playerHoldings);

  updatePortfolioDisplay();
  updateSpiceCardPrices(currentPrices, null);
  showToast(action === 'buy'
    ? `✅ 1 ${SPICE_META[spice].label} gekauft für ${formatGold(price)}`
    : `✅ 1 ${SPICE_META[spice].label} verkauft für ${formatGold(price)}`);
}

/* ════════════════════════════════════════════════════════════════════════
 * Portfolio display
 * ════════════════════════════════════════════════════════════════════════ */
function updatePortfolioDisplay() {
  const goldEl  = document.getElementById('player-gold');
  const worthEl = document.getElementById('player-worth');
  if (goldEl)  goldEl.textContent  = formatGold(playerGold);
  if (worthEl) worthEl.textContent = formatGold(calcNetWorth(playerGold, playerHoldings, currentPrices));

  for (const spice of Object.keys(SPICE_META)) {
    const el = document.getElementById(`holding-${spice}`);
    if (el) el.textContent = `Bestand: ${playerHoldings[spice] || 0}`;
    const portEl = document.getElementById(`port-${spice}`);
    if (portEl) portEl.textContent = playerHoldings[spice] || 0;
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * Reactive updates from DB
 * ════════════════════════════════════════════════════════════════════════ */
function onGameStateUpdate(gs) {
  const prevPrices  = { ...currentPrices };
  const wasActive   = roundActive;

  roundActive    = gs.active;
  roundStartTime = gs.startTime;
  if (gs.prices) currentPrices = { ...gs.prices };

  // Update chart
  if (gs.priceHistory) updateChart(gs.priceHistory);

  // Update price cards
  updateSpiceCardPrices(currentPrices, prevPrices);
  updatePortfolioDisplay();
  updatePublicLeaderboardVisibility();
  if (!roundActive) renderPublicLeaderboard(latestPlayers, currentPrices);

  // Show/hide waiting overlay (only if player has joined)
  if (playerId) {
    const overlay = document.getElementById('waiting-overlay');
    if (overlay) overlay.classList.toggle('hidden', gs.active);
  }

  // Enable/disable trade buttons based on round state
  document.querySelectorAll('.btn-buy, .btn-sell').forEach(btn => {
    btn.disabled = !gs.active;
  });

  // Timer
  updateTimerDisplay();
  if (!wasActive && gs.active) {
    startLocalTimer();
  } else if (wasActive && !gs.active) {
    stopLocalTimer();
  }

  // Historical event notification
  if (gs.currentEvent && gs.currentEvent.ts !== lastEventTs) {
    lastEventTs = gs.currentEvent.ts;
    showEventOverlay(gs.currentEvent);
  }
}

function onPlayersUpdate(players) {
  latestPlayers = players || {};
  if (!playerId) return;
  const me = players[playerId];
  if (!me) return;
  // Sync own portfolio from DB (in case of conflict with another tab/device)
  playerGold     = me.gold     ?? playerGold;
  playerHoldings = me.holdings ?? playerHoldings;
  updatePortfolioDisplay();
  if (!roundActive) renderPublicLeaderboard(latestPlayers, currentPrices);
}

/* ════════════════════════════════════════════════════════════════════════
 * Timer
 * ════════════════════════════════════════════════════════════════════════ */
function startLocalTimer() {
  stopLocalTimer();
  timerInterval = setInterval(updateTimerDisplay, 500);
}
function stopLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  if (!el) return;
  if (!roundActive || !roundStartTime) {
    el.textContent = roundActive ? '…' : 'Warten…';
    return;
  }
  const elapsed = (Date.now() - roundStartTime) / 1000;
  const remaining = CONFIG.ROUND_DURATION - elapsed;
  el.textContent = formatTime(remaining);
  el.classList.toggle('timer-urgent', remaining > 0 && remaining < 30);
}

/* ════════════════════════════════════════════════════════════════════════
 * Event overlay
 * ════════════════════════════════════════════════════════════════════════ */
function showEventOverlay(event) {
  const overlay = document.getElementById('event-overlay');
  const textEl  = document.getElementById('event-overlay-text');
  if (!overlay || !textEl) return;

  textEl.textContent   = event.text;
  overlay.className    = `event-overlay event-${event.type} show`;
  setTimeout(() => overlay.classList.remove('show'), 7000);
}

/* ════════════════════════════════════════════════════════════════════════
 * Toast notifications
 * ════════════════════════════════════════════════════════════════════════ */
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function updatePublicLeaderboardVisibility() {
  const section = document.getElementById('public-leaderboard-section');
  if (!section) return;
  section.classList.toggle('hidden', roundActive);
}

function renderPublicLeaderboard(players, prices) {
  const body = document.getElementById('public-leaderboard-body');
  if (!body) return;

  const entries = Object.values(players || {})
    .filter(p => p && p.name)
    .map(p => ({
      name: p.name,
      worth: calcNetWorth(p.gold || 0, p.holdings || {}, prices),
    }))
    .sort((a, b) => b.worth - a.worth);

  body.innerHTML = '';
  entries.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
    tr.innerHTML = `
      <td>${medal}</td>
      <td>${escHtml(entry.name)}</td>
      <td>${formatGold(entry.worth)}</td>`;
    if (idx === 0) tr.classList.add('rank-gold');
    else if (idx === 1) tr.classList.add('rank-silver');
    else if (idx === 2) tr.classList.add('rank-bronze');
    body.appendChild(tr);
  });

  if (!entries.length) {
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;opacity:.6">Noch keine Spieler</td></tr>';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
