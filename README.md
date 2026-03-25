# The Spice Market of 1500 ⚜ — History Class Simulator

> **"Black Gold"** — A fast-paced, classroom stock-market simulator set in the age of spice trade.

## What Is This?

A browser-based trading simulator where students buy and sell Pepper, Cinnamon, and Cardamom while random **historical events** crash or spike prices — just like the volatile 16th-century spice market.

| Feature | Description |
|---------|-------------|
| 📈 Live price chart | Prices tick up and down every 3 seconds |
| 📜 Historical Events | Random events fire mid-round (e.g. "Portuguese Fleet Sighted!") |
| ⚖️ Buy / Sell | Each trade moves the market price ±2 % (like a real market!) |
| ⏱️ 5-minute timer | Started by the teacher from the Admin console |
| 🏆 Leaderboard | Admin sees live rankings sorted by net worth |
| 🔑 Admin code | Admin page protected by a secret code |

---

## Quick Start (Demo Mode — Single Computer / Projector)

1. Download / clone this repository.
2. Open `index.html` in a browser (or use VS Code Live Server).
3. Open `admin.html` in **another browser tab**.
4. Enter the admin code: **`SPICEMASTER1500`** (you can change this in `js/config.js`).
5. Click **Start Round** on the admin tab → prices start moving.
6. Open more tabs of `index.html` for additional players, or project the admin tab.

> **Demo mode** uses `localStorage` + `BroadcastChannel`, so multiple tabs in the **same browser** share live state. Students on different devices need Firebase (see below).

---

## Multi-Device Setup (Real Classroom — Firebase)

For an actual classroom where every student is on their own device:

### 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add project**, follow the wizard.
3. In the left sidebar, click **Build → Realtime Database → Create database**.
4. Start in **test mode** (allows all reads/writes for 30 days — fine for a class event).

### 2 — Get Your Config

1. In Firebase Console → ⚙️ Project settings → **Your apps → Web app** (click `</>`).
2. Register the app, copy the `firebaseConfig` object.

### 3 — Paste Config into `js/config.js`

```javascript
DB_MODE: 'firebase',    // ← change 'demo' to 'firebase'

FIREBASE_CONFIG: {
  apiKey:            'AIza...',
  authDomain:        'your-project.firebaseapp.com',
  databaseURL:       'https://your-project-default-rtdb.firebaseio.com',
  projectId:         'your-project',
  storageBucket:     'your-project.appspot.com',
  messagingSenderId: '123456789',
  appId:             '1:123...',
},
```

### 4 — Uncomment Firebase SDK in HTML

In **both** `index.html` and `admin.html`, uncomment these two lines:

```html
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
```

### 5 — Recommended Realtime Database Security Rules

Paste these in **Realtime Database → Rules**:

```json
{
  "rules": {
    ".read":  true,
    ".write": true
  }
}
```

> ⚠️ These open rules are intentional for a short classroom event. Reset the database and tighten rules after class.

### 6 — Deploy to GitHub Pages

1. Push changes to your repo.
2. In GitHub → Settings → Pages → set Source to `main` branch, `/` root.
3. Share the URL (e.g. `https://your-username.github.io/gewuerze-aktien.github.io/`) as a QR code.

---

## Customisation

Open `js/config.js` to change:

| Setting | Default | Description |
|---------|---------|-------------|
| `ADMIN_CODE` | `SPICEMASTER1500` | Admin page password |
| `ROUND_DURATION` | `300` (5 min) | Round length in seconds |
| `STARTING_GOLD` | `500` | Starting gold per player |
| `STARTING_PRICES` | `100/150/200` | Starting prices (Pepper/Cinnamon/Cardamom) |
| `MAX_FLUCTUATION` | `0.04` | Max random ±% per tick |
| `BUY_PRICE_IMPACT` | `0.02` | Price increase per buy |
| `SELL_PRICE_IMPACT` | `0.02` | Price decrease per sell |

Add or edit historical events in `js/game.js` in the `HISTORICAL_EVENTS` array.

---

## Generating QR Codes for Students

Use any free QR-code generator (e.g. [qr-code-generator.com](https://www.qr-code-generator.com)) to encode your GitHub Pages URL. Print or project the QR code — students scan it and land directly on the player page.

---

## File Structure

```
index.html       — Player trading page
admin.html       — Admin console (password protected)
css/style.css    — All styles
js/config.js     — All configuration (edit this!)
js/game.js       — Historical events + price logic
js/db.js         — Database abstraction (demo / Firebase)
js/player.js     — Player page logic
js/admin.js      — Admin page logic
```

