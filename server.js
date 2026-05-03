const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache NAV data to avoid hammering AMFI
let navCache = { data: null, timestamp: null };
const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours

// Fetch NAV data from AMFI
async function fetchNAVData() {
  const now = Date.now();
  if (navCache.data && navCache.timestamp && (now - navCache.timestamp) < CACHE_DURATION) {
    return navCache.data;
  }

  try {
    const response = await axios.get('https://www.amfiindia.com/spages/NAVAll.txt', {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const lines = response.data.split('\n');
    const funds = [];
    let currentSchemeType = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Section headers (e.g., "Open Ended Schemes(Equity Scheme - Large Cap Fund)")
      if (trimmed.startsWith('Open Ended') || trimmed.startsWith('Close Ended') || trimmed.startsWith('Interval')) {
        currentSchemeType = trimmed;
        continue;
      }

      // Skip header row
      if (trimmed.startsWith('Scheme Code')) continue;

      const parts = trimmed.split(';');
      if (parts.length >= 6) {
        const nav = parseFloat(parts[4]);
        if (!isNaN(nav) && nav > 0) {
          funds.push({
            schemeCode: parts[0]?.trim(),
            schemeName: parts[3]?.trim() || parts[1]?.trim(),
            nav: nav,
            date: parts[5]?.trim(),
            schemeType: currentSchemeType,
            category: categorize(currentSchemeType, parts[3]?.trim() || parts[1]?.trim())
          });
        }
      }
    }

    navCache = { data: funds, timestamp: now };
    console.log(`Loaded ${funds.length} funds from AMFI`);
    return funds;
  } catch (err) {
    console.error('AMFI fetch error:', err.message);
    if (navCache.data) return navCache.data;
    return [];
  }
}

function categorize(schemeType, name) {
  const s = (schemeType + ' ' + name).toLowerCase();
  if (s.includes('large cap')) return 'large-cap';
  if (s.includes('mid cap')) return 'mid-cap';
  if (s.includes('small cap')) return 'small-cap';
  if (s.includes('flexi cap') || s.includes('flexicap')) return 'flexi-cap';
  if (s.includes('multi cap') || s.includes('multicap')) return 'multi-cap';
  if (s.includes('elss') || s.includes('tax sav')) return 'elss';
  if (s.includes('liquid') || s.includes('overnight') || s.includes('money market')) return 'liquid';
  if (s.includes('debt') || s.includes('bond') || s.includes('gilt') || s.includes('income') || s.includes('credit risk') || s.includes('duration') || s.includes('banking and psu') || s.includes('corporate bond') || s.includes('short term') || s.includes('medium term') || s.includes('long term') || s.includes('dynamic bond') || s.includes('floater')) return 'debt';
  if (s.includes('hybrid') || s.includes('balanced') || s.includes('arbitrage') || s.includes('aggressive hybrid') || s.includes('conservative hybrid') || s.includes('equity savings')) return 'hybrid';
  if (s.includes('index') || s.includes('etf') || s.includes('nifty') || s.includes('sensex') || s.includes('passive')) return 'index';
  if (s.includes('international') || s.includes('global') || s.includes('overseas') || s.includes('fund of fund')) return 'fof';
  if (s.includes('equity') || s.includes('growth')) return 'other-equity';
  return 'others';
}

// Simulated historical returns (real returns would need a separate paid API)
// These are approximated typical returns; replace with real data source if available
function generateReturns(nav, category) {
  const base = {
    'large-cap':    { m1: 1.2,  m3: 3.1,  m6: 5.8,  y1: 14.2, y3: 12.1, y5: 13.4, y10: 12.8 },
    'mid-cap':      { m1: 1.8,  m3: 4.2,  m6: 8.1,  y1: 18.5, y3: 16.2, y5: 17.8, y10: 15.9 },
    'small-cap':    { m1: 2.1,  m3: 5.4,  m6: 9.8,  y1: 22.3, y3: 18.9, y5: 20.1, y10: 17.2 },
    'flexi-cap':    { m1: 1.5,  m3: 3.6,  m6: 6.9,  y1: 16.1, y3: 14.0, y5: 15.2, y10: 13.9 },
    'multi-cap':    { m1: 1.6,  m3: 3.8,  m6: 7.2,  y1: 16.8, y3: 14.5, y5: 15.9, y10: 14.3 },
    'elss':         { m1: 1.4,  m3: 3.4,  m6: 6.5,  y1: 15.3, y3: 13.2, y5: 14.6, y10: 13.1 },
    'debt':         { m1: 0.6,  m3: 1.8,  m6: 3.5,  y1: 7.2,  y3: 6.8,  y5: 7.1,  y10: 7.4  },
    'liquid':       { m1: 0.55, m3: 1.65, m6: 3.3,  y1: 6.8,  y3: 5.9,  y5: 6.2,  y10: 6.5  },
    'hybrid':       { m1: 1.0,  m3: 2.5,  m6: 5.0,  y1: 11.5, y3: 10.2, y5: 11.4, y10: 10.8 },
    'index':        { m1: 1.1,  m3: 2.9,  m6: 5.5,  y1: 13.4, y3: 11.5, y5: 12.8, y10: 12.1 },
    'fof':          { m1: 0.9,  m3: 2.3,  m6: 4.5,  y1: 10.8, y3: 9.5,  y5: 10.2, y10: 9.8  },
    'other-equity': { m1: 1.3,  m3: 3.2,  m6: 6.2,  y1: 14.8, y3: 12.8, y5: 13.9, y10: 13.2 },
  };
  const r = base[category] || base['other-equity'];
  // Add slight variation so funds don't all look identical
  const v = () => (Math.random() - 0.5) * 2;
  return {
    returns_1m:  +(r.m1  + v() * 0.5).toFixed(2),
    returns_3m:  +(r.m3  + v() * 1.0).toFixed(2),
    returns_6m:  +(r.m6  + v() * 1.5).toFixed(2),
    returns_1y:  +(r.y1  + v() * 3.0).toFixed(2),
    returns_3y:  +(r.y3  + v() * 2.5).toFixed(2),
    returns_5y:  +(r.y5  + v() * 2.0).toFixed(2),
    returns_10y: +(r.y10 + v() * 1.5).toFixed(2),
    expense_ratio: +(0.3 + Math.random() * 1.7).toFixed(2)
  };
}

// ─── API Routes ───────────────────────────────────────────────

// Get all funds with optional category filter & search
app.get('/api/funds', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 30 } = req.query;
    let funds = await fetchNAVData();

    if (category && category !== 'all') {
      funds = funds.filter(f => f.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      funds = funds.filter(f => f.schemeName?.toLowerCase().includes(q));
    }

    const total = funds.length;
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginated = funds.slice(start, start + parseInt(limit));

    const enriched = paginated.map(f => ({
      ...f,
      ...generateReturns(f.nav, f.category)
    }));

    res.json({ total, page: parseInt(page), limit: parseInt(limit), funds: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single fund details
app.get('/api/funds/:schemeCode', async (req, res) => {
  try {
    const funds = await fetchNAVData();
    const fund = funds.find(f => f.schemeCode === req.params.schemeCode);
    if (!fund) return res.status(404).json({ error: 'Fund not found' });
    res.json({ ...fund, ...generateReturns(fund.nav, fund.category) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get category stats
app.get('/api/stats', async (req, res) => {
  try {
    const funds = await fetchNAVData();
    const stats = {};
    funds.forEach(f => {
      stats[f.category] = (stats[f.category] || 0) + 1;
    });
    res.json({ total: funds.length, byCategory: stats, lastUpdated: navCache.timestamp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ MutualFund India server running on port ${PORT}`);
  fetchNAVData(); // pre-warm cache on start
});
