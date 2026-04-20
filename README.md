# FinCommand - Professional Financial Calculator Platform

A modern, fully-functioning financial calculator application with user authentication, real-time bank rate syncing, and advanced financial calculations.

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

# 2. Install dependencies
npm install

# 3. Start the server
npm start
# OR for development (auto-reload):
npm run dev

# 4. Open in browser
# http://localhost:3000
```

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

### Option 1: GitHub Pages (Frontend only)
```bash
npm run build
# Deploy dist/ folder to GitHub Pages
```

### Option 2: Heroku (Full Stack)
```bash
# Create Heroku app
# Set buildpacks to Node.js
# Deploy with git push heroku main
```

### Option 3: Self-Hosted (VPS/EC2)
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
