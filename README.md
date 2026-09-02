# FinCommand - Professional Financial Calculator Platform

## New planning and account capabilities

- SIP, retirement, insurance, budget, and loan comparison calculations are available alongside the original tools. `POST /api/v1/amortization` returns the full monthly schedule.
- Remember-me sessions use rotating refresh tokens. New accounts can verify email and can opt into OTP-based two-factor authentication.
- The dashboard provides dark mode, multi-currency display, saved scenarios, activity history, interactive result charts, CSV download, and browser print-to-PDF.
- In development, email and OTP endpoints return a short-lived code because no mail provider is configured. Production responses never expose those codes.

All calculator requests require `x-api-key`:

```bash
curl -X POST http://localhost:3000/api/v1/amortization \
  -H "Content-Type: application/json" -H "x-api-key: YOUR_KEY" \
  -d '{"principal":1000000,"annualRate":9.5,"years":10}'
```

Other protected additions include `POST /api/v1/sip`, `/loan-comparison`, `/insurance`, `/budget`, `/retirement`, and `GET`/`POST /api/v1/scenarios`. Run `npm test` locally; GitHub Actions runs checks and tests on pushes and pull requests.

[![Project Status](https://img.shields.io/badge/status-production-green.svg)](https://github.com/nikhilanand616-coder/codespaces-blank-1)
[![GitHub Repo Size](https://img.shields.io/github/repo-size/nikhilanand616-coder/codespaces-blank-1.svg)](https://github.com/nikhilanand616-coder/codespaces-blank-1)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A modern, fully-functioning financial calculator application with user authentication, real-time bank rate syncing, and advanced financial calculations.

This repository now uses a Node.js backend only, so the project runs without requiring Python for backend startup.

## 📌 Project Overview

FinCommand is a complete full-stack finance dashboard that delivers secure login, live bank rates, and powerful calculators for RD, FD, EMI, and net worth planning. The project is designed to be visible immediately on the GitHub front page and ready for deployment.

## 🎯 Features

### Authentication & Security
- ✅ User login and registration with secure password hashing
- ✅ API key-based authentication for protected endpoints
- ✅ Session management with localStorage
- ✅ Separate user database (`data/users.json`)

### Financial Calculators
- ✅ **Recurring Deposit (RD)**: Calculate maturity with monthly contributions
- ✅ **Fixed Deposit (FD)**: Project FD maturity with quarterly compounding
- ✅ **EMI Calculator**: Loan EMI with full amortization breakdown
- ✅ **Net Worth**: Calculate total assets vs liabilities

### Real-Time Features
- ✅ **Live Bank Rates**: 50+ major global and Indian banks
- ✅ **Auto-Sync**: Bank rates refresh every 15 seconds
- ✅ **Rate Updates**: Instantly reflects rate changes from backend
- ✅ **Responsive UI**: Glassmorphism design with smooth animations

## 📦 Project Structure

```
FinCommand/
├── server.js                # Express.js backend (PORT 3000)
├── FinCommands.html         # Main dashboard UI
├── login.html              # Login/registration page
├── auth.js                 # Frontend auth logic
├── script.js               # Dashboard logic & calculators
├── styles.css              # Complete styling (glassmorphism)
├── package.json            # Dependencies
├── src/
│   ├── calculators.js      # Pure calculation functions
│   ├── userStore.js        # User CRUD & crypto hashing
│   └── bankRates.js        # Bank rate data loader
├── data/
│   ├── users.json          # User database (encrypted passwords)
│   └── bankRates.json      # Live bank rates (50+ banks)
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ (LTS)
- **npm** v9+
- **Git** (for deployment)

### Installation & Running

```bash
# 1. Clone the repository
git clone https://github.com/nikhilanand616-coder/codespaces-blank-1.git
cd fincommand
```

#### Option A: Run with Node.js

```bash
# Install Node dependencies
npm install

# Start the Node backend
npm start
# OR for development with auto-reload:
npm run dev
```

#### Recommended Windows launcher (always use this)

Double-click `Start-FinCommand.cmd`, or run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-server.ps1
```

It uses the repository's bundled Node.js when available, installs missing dependencies, verifies the real `/api/v1/health` response (not merely whether port 3000 is open), opens `http://localhost:3000`, and writes startup diagnostics to `.fincommand/server.stderr.log`. If another application has taken port 3000, it reports that process instead of opening a broken page.

### UPI Payment Setup (Optional)

FinCommand now supports real UPI payments through Razorpay integration, just like major e-commerce platforms.

#### 1. Create Razorpay Account
1. Sign up at [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Complete KYC verification
3. Enable UPI payments in your account

#### 2. Configure Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your Razorpay credentials
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_key_secret_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Optional Gemini AI integration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-4.0
# If using a plain API key instead of a bearer token, uncomment the next line:
# GEMINI_USE_API_KEY=true
# Optional external real bank rate provider
# BANK_RATES_SOURCE_URL=https://yourbankprovider.com/api/v1/bank-rates
# BANK_RATES_CACHE_TTL_SECONDS=30
```

#### 3. Webhook Configuration
- Set webhook URL in Razorpay Dashboard: `https://yourdomain.com/api/v1/razorpay-webhook`
- Subscribe to `payment.captured` event
- Copy the webhook secret to your `.env` file

#### 4. Test Payments
- Use Razorpay's test mode with test cards/UPI IDs
- Switch to live mode after testing

### Default Test Credentials

**Existing User**:
```
Email:    existing@fincommand.local
Password: FinCommand123!
```

**New User**: 
- Use the "New User" tab on login page to register

## 🔌 API Endpoints

### Public Endpoints
- `GET /` — Serve login.html
- `GET /api/v1/health` — Health check

### Auth Endpoints
- `POST /api/v1/login` — Login (returns apiKey)
- `POST /api/v1/register` — Register new user

### Protected Endpoints (Require `x-api-key` header)
- `POST /api/v1/rd` — Calculate RD returns
- `POST /api/v1/fd` — Calculate FD maturity
- `POST /api/v1/emi` — Calculate loan EMI
- `POST /api/v1/nw` — Calculate net worth
- `GET /api/v1/bank-rates` — Get live bank rates (updates every 15s)
- `GET /api/v1/profile` — Get user profile

## 🏦 Supported Banks (50+)

**Indian Private Banks**:
- HDFC, ICICI, Axis, Kotak, IndusInd, YES, IDFC, Federal Bank

**Indian Public Banks (PSU)**:
- SBI, PNB, BoB, Canara, Union, Bank of India, Central Bank

**Small Finance Banks**:
- AU Small Finance, Equitas, Ujjivan, Utkarsh, Suryoday

**US Banks**:
- JPMorgan Chase, Bank of America, Wells Fargo, Goldman Sachs, Citigroup

**European Banks**:
- HSBC (UK), Barclays (UK), BNP Paribas (France), Deutsche Bank, UBS

**Asia-Pacific Banks**:
- ICBC (China), Mitsubishi UFJ (Japan), Commonwealth Bank (Australia), ANZ

## 🔄 Real-Time Rate Sync

```javascript
// Frontend automatically polls every 15 seconds
fetch('http://localhost:3000/api/v1/bank-rates')
  .then(res => res.json())
  .then(data => {
    // Updates bank dropdowns with live rates
    // Preserves user's current selection
    populateBankSelector('rd', data.rdBanks);
    populateBankSelector('fd', data.fdBanks);
  });
```

To update rates, edit `data/bankRates.json`:
```json
{
  "updatedAt": "2026-04-20T00:00:00.000Z",
  "rdBanks": [
    { "id": "hdfc", "name": "HDFC Bank", "rate": 7.0 }
  ],
  "fdBanks": [...]
}
```

## 🛠️ npm Scripts

```bash
npm start              # Start production server
npm run dev            # Start with nodemon (auto-reload)
npm install            # Install dependencies
npm run deploy         # Deployment helper (see deploy.js)
```

> **Note:** The app only works when the Node server is running. If you close VS Code or stop the terminal, restart the server before opening `http://localhost:3000`.
>
> If `npm` is not installed or not available in your shell, use the bundled Node binary:
>
> ```powershell
> .\node\node-v24.15.0-win-x64\node.exe server.js
> ```
>
> The workspace now includes a VS Code task that starts the server automatically when the folder opens. If prompted, allow the task to run on folder open.
>
> Alternatively, run the task manually: `Terminal → Run Task → Start FinCommand server`.

## 🔐 Security

- ✅ Passwords hashed with `crypto.scryptSync()`
- ✅ API keys generated with `crypto.randomBytes()`
- ✅ CORS enabled for cross-origin requests
- ✅ Input validation on all endpoints
- ✅ Middleware for API key verification

## 📊 Calculator Formulas

### Recurring Deposit (RD)
```
Monthly Rate = Annual Rate / 400
Maturity = Σ(monthly × (1 + rate)^(months-i+1)/3) for i=1 to months
Interest = Maturity - (Monthly × Months)
```

### Fixed Deposit (FD)
```
Quarterly Rate = Annual Rate / 4
Maturity = Principal × (1 + quarterly_rate)^(4 × years)
Interest = Maturity - Principal
```

### EMI (Equated Monthly Installment)
```
Monthly Rate = Annual Rate / 1200
EMI = (Principal × rate × (1 + rate)^months) / ((1 + rate)^months - 1)
```

## 🚀 Deployment Options

### Option 1: Render (Recommended)
Render is configured to run the full Node backend and serve the app from a single web service.

```bash
# Connect this GitHub repo to Render
# Use the existing render.yaml manifest
# Set environment variables in the Render dashboard:
#   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
# Then deploy from branch main.
```

### Option 2: GitHub Pages (Frontend only)
```bash
npm run build
# Deploy dist/ folder to GitHub Pages
```

### Option 3: Heroku (Full Stack)
```bash
# Create Heroku app
# Set buildpacks to Node.js
# Deploy with git push heroku main
```

### Option 4: Self-Hosted (VPS/EC2)
```bash
# Install Node.js, npm, and git on server
# Clone repo and run npm install
# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name "fincommand"
```

## 📝 License

MIT License — Free for personal and commercial use.

## 👨‍💻 Author

**Nikhil Anand**  
Created: April 2026  
Repository: https://github.com/nikhilanand616-coder/codespaces-blank-1

## 📞 Support

For issues or feature requests, open an issue on GitHub.

---

**FinCommand** — Empowering Financial Intelligence
