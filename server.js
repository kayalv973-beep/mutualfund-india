const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* --------------------------------------------------
   CACHE
-------------------------------------------------- */
let navCache = { data: null, timestamp: 0 };
let historyCache = {}; // schemeCode => { data, timestamp }

const NAV_CACHE_MS = 4 * 60 * 60 * 1000;      // 4 hours
const HISTORY_CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours

/* --------------------------------------------------
   CATEGORY
-------------------------------------------------- */
function categorize(schemeType, name) {
  const s = `${schemeType} ${name}`.toLowerCase();

  if (s.includes('large cap')) return 'large-cap';
  if (s.includes('mid cap')) return 'mid-cap';
  if (s.includes('small cap')) return 'small-cap';
  if (s.includes('flexi cap')) return 'flexi-cap';
  if (s.includes('multi cap')) return 'multi-cap';
  if (s.includes('elss') || s.includes('tax')) return 'elss';
  if (s.includes('liquid') || s.includes('overnight')) return 'liquid';
  if (s.includes('debt') || s.includes('bond') || s.includes('gilt')) return 'debt';
  if (s.includes('hybrid') || s.includes('balanced')) return 'hybrid';
  if (s.includes('index') || s.includes('etf') || s.includes('nifty')) return 'index';

  return 'others';
}

/* --------------------------------------------------
   FETCH AMFI LIVE NAV
-------------------------------------------------- */
async function fetchNAVData() {
  const now = Date.now();

  if (navCache.data && now - navCache.timestamp < NAV_CACHE_MS) {
    return navCache.data;
  }

  try {
    const response = await axios.get(
      'https://www.amfiindia.com/spages/NAVAll.txt',
      {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }
    );

    const lines = response.data.split('\n');
    const funds = [];
    let currentSchemeType = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (
        trimmed.startsWith('Open Ended') ||
        trimmed.startsWith('Close Ended') ||
        trimmed.startsWith('Interval')
      ) {
        currentSchemeType = trimmed;
        continue;
      }

      if (trimmed.startsWith('Scheme Code')) continue;

      const parts = trimmed.split(';');

      if (parts.length >= 6) {
        const nav = parseFloat(parts[4]);

        if (!isNaN(nav) && nav > 0) {
          const schemeName = parts[3]?.trim() || parts[1]?.trim();

          funds.push({
            schemeCode: parts[0]?.trim(),
            schemeName,
            nav,
            date: parts[5]?.trim(),
            schemeType: currentSchemeType,
            category: categorize(currentSchemeType, schemeName)
          });
        }
      }
    }

    navCache = { data: funds, timestamp: now };

    console.log(`Loaded ${funds.length} funds from AMFI`);
    return funds;

  } catch (error) {
    console.log('AMFI fetch failed:', error.message);
    return navCache.data || [];
  }
}

/* --------------------------------------------------
   FETCH HISTORICAL NAV (REAL RETURNS)
-------------------------------------------------- */
async function fetchHistory(schemeCode) {
  const now = Date.now();

  if (
    historyCache[schemeCode] &&
    now - historyCache[schemeCode].timestamp < HISTORY_CACHE_MS
  ) {
    return historyCache[schemeCode].data;
  }

  try {
    const response = await axios.get(
      `https://api.mfapi.in/mf/${schemeCode}`,
      { timeout: 15000 }
    );

    const history = response.data.data || [];

    historyCache[schemeCode] = {
      data: history,
      timestamp: now
    };

    return history;

  } catch (error) {
    return [];
  }
}

/* --------------------------------------------------
   HELPERS
-------------------------------------------------- */
function pct(latest, oldNav) {
  if (!oldNav || oldNav <= 0) return null;
  return +(((latest - oldNav) / oldNav) * 100).toFixed(2);
}

function cagr(latest, oldNav, years) {
  if (!oldNav || oldNav <= 0) return null;
  return +((Math.pow(latest / oldNav, 1 / years) - 1) * 100).toFixed(2);
}

/* --------------------------------------------------
   REAL RETURN CALCULATION
-------------------------------------------------- */
async function generateReturnsReal(schemeCode, currentNav) {
  const history = await fetchHistory(schemeCode);

  if (!history || history.length < 30) {
    return {
      returns_1m: null,
      returns_3m: null,
      returns_6m: null,
      returns_1y: null,
      returns_3y: null,
      returns_5y: null,
      returns_10y: null,
      expense_ratio: null
    };
  }

  const nav1m = parseFloat(history[Math.min(30, history.length - 1)]?.nav);
  const nav3m = parseFloat(history[Math.min(90, history.length - 1)]?.nav);
  const nav6m = parseFloat(history[Math.min(180, history.length - 1)]?.nav);
  const nav1y = parseFloat(history[Math.min(365, history.length - 1)]?.nav);
  const nav3y = parseFloat(history[Math.min(1095, history.length - 1)]?.nav);
  const nav5y = parseFloat(history[Math.min(1825, history.length - 1)]?.nav);
  const nav10y = parseFloat(history[Math.min(3650, history.length - 1)]?.nav);

  return {
    returns_1m: pct(currentNav, nav1m),
    returns_3m: pct(currentNav, nav3m),
    returns_6m: pct(currentNav, nav6m),
    returns_1y: pct(currentNav, nav1y),
    returns_3y: cagr(currentNav, nav3y, 3),
    returns_5y: cagr(currentNav, nav5y, 5),
    returns_10y: cagr(currentNav, nav10y, 10),

    // Placeholder until real source added
    expense_ratio: null
  };
}

/* --------------------------------------------------
   API: ALL FUNDS
-------------------------------------------------- */
app.get('/api/funds', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;

    let funds = await fetchNAVData();

    if (category && category !== 'all') {
      funds = funds.filter(f => f.category === category);
    }

    if (search) {
      const q = search.toLowerCase();
      funds = funds.filter(f =>
        f.schemeName.toLowerCase().includes(q)
      );
    }

    const total = funds.length;

    const start = (page - 1) * limit;
    const paginated = funds.slice(start, start + Number(limit));

    const enriched = await Promise.all(
      paginated.map(async (f) => ({
        ...f,
        ...(await generateReturnsReal(f.schemeCode, f.nav))
      }))
    );

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      funds: enriched
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* --------------------------------------------------
   API: SINGLE FUND
-------------------------------------------------- */
app.get('/api/funds/:schemeCode', async (req, res) => {
  try {
    const funds = await fetchNAVData();

    const fund = funds.find(
      f => f.schemeCode === req.params.schemeCode
    );

    if (!fund) {
      return res.status(404).json({ error: 'Fund not found' });
    }

    const data = {
      ...fund,
      ...(await generateReturnsReal(fund.schemeCode, fund.nav))
    };

    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* --------------------------------------------------
   API: STATS
-------------------------------------------------- */
app.get('/api/stats', async (req, res) => {
  const funds = await fetchNAVData();

  const byCategory = {};

  funds.forEach(f => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  });

  res.json({
    total: funds.length,
    byCategory,
    lastUpdated: navCache.timestamp
  });
});

/* --------------------------------------------------
   FRONTEND
-------------------------------------------------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* --------------------------------------------------
   START
-------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
