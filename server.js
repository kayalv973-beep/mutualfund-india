const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* CACHE */
let navCache = { data: null, timestamp: null };
let historyCache = {};

const NAV_CACHE_DURATION = 4 * 60 * 60 * 1000;
const HISTORY_CACHE_DURATION = 12 * 60 * 60 * 1000;

/* FETCH NAV */
async function fetchNAVData() {
  const now = Date.now();

  if (navCache.data && (now - navCache.timestamp) < NAV_CACHE_DURATION) {
    return navCache.data;
  }

  try {
    const res = await axios.get('https://www.amfiindia.com/spages/NAVAll.txt');
    const lines = res.data.split('\n');

    let funds = [];
    let currentType = '';

    for (let line of lines) {
      const t = line.trim();
      if (!t) continue;

      if (t.startsWith('Open Ended') || t.startsWith('Close Ended')) {
        currentType = t;
        continue;
      }

      if (t.startsWith('Scheme Code')) continue;

      const p = t.split(';');

      if (p.length >= 6) {
        const nav = parseFloat(p[4]);
        if (!isNaN(nav)) {
          const name = p[3] || p[1];

          funds.push({
            schemeCode: p[0],
            schemeName: name,
            nav,
            date: p[5],
            category: categorize(currentType, name)
          });
        }
      }
    }

    navCache = { data: funds, timestamp: now };
    return funds;

  } catch {
    return navCache.data || [];
  }
}

/* CATEGORY */
function categorize(type, name) {
  const s = (type + name).toLowerCase();
  if (s.includes('small cap')) return 'small-cap';
  if (s.includes('mid cap')) return 'mid-cap';
  if (s.includes('large cap')) return 'large-cap';
  if (s.includes('flexi')) return 'flexi-cap';
  if (s.includes('multi')) return 'multi-cap';
  if (s.includes('elss')) return 'elss';
  if (s.includes('debt') || s.includes('bond')) return 'debt';
  return 'others';
}

/* HISTORY */
async function fetchHistory(code) {
  const now = Date.now();

  if (historyCache[code] && now - historyCache[code].timestamp < HISTORY_CACHE_DURATION) {
    return historyCache[code].data;
  }

  try {
    const res = await axios.get(`https://api.mfapi.in/mf/${code}`);
    const data = res.data.data || [];

    historyCache[code] = { data, timestamp: now };
    return data;

  } catch {
    return [];
  }
}

/* DATE FIX */
function parseDate(str) {
  const [d, m, y] = str.split('-');
  return new Date(`${y}-${m}-${d}`);
}

function findNav(history, target) {
  for (let h of history) {
    if (parseDate(h.date) <= target) return parseFloat(h.nav);
  }
  return parseFloat(history[history.length - 1].nav);
}

/* RETURNS */
function pct(a, b) {
  return ((a - b) / b) * 100;
}

function cagr(a, b, y) {
  return (Math.pow(a / b, 1 / y) - 1) * 100;
}

async function getReturns(code, nav) {
  const h = await fetchHistory(code);
  if (!h.length) return {};

  const now = new Date();

  const d = (y = 0, m = 0) => {
    const t = new Date(now);
    t.setFullYear(t.getFullYear() - y);
    t.setMonth(t.getMonth() - m);
    return t;
  };

  return {
    returns_1m: pct(nav, findNav(h, d(0,1))).toFixed(2),
    returns_3m: pct(nav, findNav(h, d(0,3))).toFixed(2),
    returns_6m: pct(nav, findNav(h, d(0,6))).toFixed(2),
    returns_1y: pct(nav, findNav(h, d(1,0))).toFixed(2),
    returns_3y: cagr(nav, findNav(h, d(3,0)), 3).toFixed(2),
    returns_5y: cagr(nav, findNav(h, d(5,0)), 5).toFixed(2)
  };
}

/* API */
app.get('/api/funds', async (req, res) => {
  const funds = await fetchNAVData();

  const enriched = await Promise.all(
    funds.slice(0, 50).map(async f => ({
      ...f,
      ...(await getReturns(f.schemeCode, f.nav))
    }))
  );

  res.json({
    total: funds.length,
    funds: enriched
  });
});

app.get('/api/funds/:code', async (req, res) => {
  const funds = await fetchNAVData();
  const f = funds.find(x => x.schemeCode === req.params.code);

  if (!f) return res.status(404).json({ error: 'Not found' });

  res.json({
    ...f,
    ...(await getReturns(f.schemeCode, f.nav))
  });
});

/* FRONTEND */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log("Running on " + PORT));
