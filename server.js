const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- CACHE ---------------- */
let navCache = { data: null, timestamp: null };
let historyCache = {};

const NAV_CACHE_DURATION = 4 * 60 * 60 * 1000;
const HISTORY_CACHE_DURATION = 12 * 60 * 60 * 1000;

/* ---------------- FETCH NAV ---------------- */
async function fetchNAVData() {
  const now = Date.now();

  if (navCache.data && (now - navCache.timestamp) < NAV_CACHE_DURATION) {
    return navCache.data;
  }

  try {
    const response = await axios.get(
      'https://www.amfiindia.com/spages/NAVAll.txt'
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

        if (!isNaN(nav)) {
          const name = parts[3]?.trim() || parts[1]?.trim();

          funds.push({
            schemeCode: parts[0],
            schemeName: name,
            nav,
            date: parts[5],
            schemeType: currentSchemeType,
            category: categorize(currentSchemeType, name)
          });
        }
      }
    }

    navCache = { data: funds, timestamp: now };
    return funds;

  } catch (err) {
    return navCache.data || [];
  }
}

/* ---------------- CATEGORY ---------------- */
function categorize(type, name) {
  const s = (type + name).toLowerCase();

  if (s.includes('large cap')) return 'large-cap';
  if (s.includes('mid cap')) return 'mid-cap';
  if (s.includes('small cap')) return 'small-cap';
  if (s.includes('flexi cap')) return 'flexi-cap';
  if (s.includes('multi cap')) return 'multi-cap';
  if (s.includes('elss')) return 'elss';
  if (s.includes('debt') || s.includes('bond')) return 'debt';

  return 'others';
}

/* ---------------- FETCH HISTORY ---------------- */
async function fetchHistory(schemeCode) {
  const now = Date.now();

  if (
    historyCache[schemeCode] &&
    (now - historyCache[schemeCode].timestamp) < HISTORY_CACHE_DURATION
  ) {
    return historyCache[schemeCode].data;
  }

  try {
    const res = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`);
    const data = res.data.data || [];

    historyCache[schemeCode] = {
      data,
      timestamp: now
    };

    return data;

  } catch {
    return [];
  }
}

/* ---------------- DATE LOGIC FIX ---------------- */
function parseDate(str) {
  const [dd, mm, yyyy] = str.split('-');
  return new Date(`${yyyy}-${mm}-${dd}`);
}

function findNavByDate(history, targetDate) {
  for (let i = 0; i < history.length; i++) {
    const d = parseDate(history[i].date);

    if (d <= targetDate) {
      return parseFloat(history[i].nav);
    }
  }
  return parseFloat(history[history.length - 1].nav);
}

/* ---------------- RETURNS ---------------- */
function pct(latest, old) {
  return ((latest - old) / old) * 100;
}

function cagr(latest, old, years) {
  return (Math.pow(latest / old, 1 / years) - 1) * 100;
}

async function generateReturnsReal(code, currentNav) {
  const history = await fetchHistory(code);

  if (!history.length) return {};

  const today = new Date();

  const getDate = (years = 0, months = 0) => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - years);
    d.setMonth(d.getMonth() - months);
    return d;
  };

  const nav1m = findNavByDate(history, getDate(0, 1));
  const nav3m = findNavByDate(history, getDate(0, 3));
  const nav6m = findNavByDate(history, getDate(0, 6));
  const nav1y = findNavByDate(history, getDate(1, 0));
  const nav3y = findNavByDate(history, getDate(3, 0));
  const nav5y = findNavByDate(history, getDate(5, 0));

  return {
    returns_1m: pct(currentNav, nav1m).toFixed(2),
    returns_3m: pct(currentNav, nav3m).toFixed(2),
    returns_6m: pct(currentNav, nav6m).toFixed(2),
    returns_1y: pct(currentNav, nav1y).toFixed(2),
    returns_3y: cagr(currentNav, nav3y, 3).toFixed(2),
    returns_5y: cagr(currentNav, nav5y, 5).toFixed(2),
    expense_ratio: null
  };
}

/* ---------------- API ---------------- */
app.get('/api/funds', async (req, res) => {
  let funds = await fetchNAVData();

  const enriched = await Promise.all(
    funds.slice(0, 20).map(async f => ({
      ...f,
      ...(await generateReturnsReal(f.schemeCode, f.nav))
    }))
  );

  res.json({ funds: enriched });
});

app.get('/api/funds/:code', async (req, res) => {
  const funds = await fetchNAVData();
  const fund = funds.find(f => f.schemeCode === req.params.code);

  if (!fund) return res.status(404).json({ error: 'Not found' });

  const data = {
    ...fund,
    ...(await generateReturnsReal(fund.schemeCode, fund.nav))
  };

  res.json(data);
});

/* ---------------- FRONTEND ---------------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
