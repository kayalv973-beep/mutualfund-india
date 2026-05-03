# FundSeva – Indian Mutual Fund Tracker

Live NAV from AMFI · Returns for 1M to 10Y · Expense ratios · 5000+ funds

---

## 🗂️ File Structure

```
mutualfund-india/
├── server.js          ← Backend server (fetches AMFI data)
├── package.json       ← Project config
├── railway.toml       ← Railway deployment config
├── .gitignore         ← Files to ignore in git
└── public/
    └── index.html     ← The entire frontend website
```

---

## 🚀 DEPLOYMENT GUIDE FOR BEGINNERS

### Step 1: Create a GitHub account
1. Go to https://github.com
2. Click "Sign Up" and create a free account

### Step 2: Create a new repository
1. After login, click the "+" icon (top right) → "New repository"
2. Repository name: `mutualfund-india`
3. Make it **Public**
4. Click "Create repository"

### Step 3: Upload your files to GitHub
1. On the repository page, click "uploading an existing file"
2. Drag and drop ALL files:
   - `server.js`
   - `package.json`
   - `railway.toml`
   - `.gitignore`
   - The entire `public/` folder (with `index.html` inside)
3. Click "Commit changes"

### Step 4: Deploy on Railway
1. Go to https://railway.app
2. Click "Login with GitHub" and connect your GitHub account
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `mutualfund-india` repository
5. Railway will automatically detect Node.js and deploy!
6. Once deployed, click "Generate Domain" to get your free URL

### Step 5: Your site is live! 🎉
Railway will give you a URL like: `https://mutualfund-india-production.up.railway.app`

---

## 💰 Railway Pricing (~₹500/month plan)
- The **Hobby plan** costs $5/month (~₹420)
- This covers your server running 24/7 with live AMFI data
- Sign up at: https://railway.app/pricing

---

## 🔄 How Data Updates Work
- NAV data is fetched from AMFI every 4 hours automatically
- AMFI updates NAV data by ~9 PM on business days
- No manual action needed — it's fully automatic!

---

## ⚠️ Important Note About Returns Data
The historical returns (1M, 3M, 6Y, 1Y, 3Y, 5Y, 10Y) shown are 
ESTIMATED based on category averages. They are NOT the actual 
historical returns of each specific fund.

To get REAL historical returns, you would need:
- MFI API (paid): https://www.mfapi.in
- This gives actual NAV history to calculate real returns

The current setup is perfect for a demo/MVP. You can upgrade later.
