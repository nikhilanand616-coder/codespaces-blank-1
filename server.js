const express = require('express');
const path = require('path');
const cors = require('cors');
const { calcRD, calcFD, calcEMI, calcNW } = require('./src/calculators');
const bankRates = require('./src/bankRates');
const userStore = require('./src/userStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.ip}`);
  next();
});

userStore.seedDefaultUser().catch((error) => {
  console.error('Unable to initialize user store:', error);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api/v1/bank-rates', async (req, res) => {
  try {
    const rates = await bankRates.getBankRates();
    res.json(rates);
  } catch (error) {
    console.error('Unable to load bank rates:', error);
    res.status(500).json({ error: 'Unable to load bank rates' });
  }
});

function getApiKey(req) {
  return req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^ApiKey\s+/i, '');
}

async function authenticateApiKey(req, res, next) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  const user = await userStore.findByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.user = user;
  next();
}

app.post('/api/v1/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await userStore.verifyUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ email: user.email, apiKey: user.apiKey });
});

app.post('/api/v1/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await userStore.createUser(email, password);
    return res.status(201).json(result);
  } catch (error) {
    if (error.code === 'USER_EXISTS') {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Unable to register user' });
  }
});

app.post('/api/v1/rd', authenticateApiKey, (req, res) => {
  const { monthly, annualRate, months } = req.body;
  const result = calcRD(monthly, annualRate, months);

  res.json({
    ...result,
    monthly: Number(monthly) || 0,
    annualRate: Number(annualRate) || 0,
    months: Number(months) || 0
  });
});

app.post('/api/v1/fd', authenticateApiKey, (req, res) => {
  const { principal, annualRate, years } = req.body;
  const result = calcFD(principal, annualRate, years);

  res.json({
    ...result,
    principal: Number(principal) || 0,
    annualRate: Number(annualRate) || 0,
    years: Number(years) || 0
  });
});

app.post('/api/v1/emi', authenticateApiKey, (req, res) => {
  const { principal, annualRate, years } = req.body;
  const result = calcEMI(principal, annualRate, years);

  res.json({
    ...result,
    principal: Number(principal) || 0,
    annualRate: Number(annualRate) || 0,
    years: Number(years) || 0
  });
});

app.post('/api/v1/nw', authenticateApiKey, (req, res) => {
  const { assets, liabilities } = req.body;
  const result = calcNW(assets, liabilities);

  res.json({
    ...result,
    assets: Number(assets) || 0,
    liabilities: Number(liabilities) || 0
  });
});

app.get('/api/v1/profile', authenticateApiKey, (req, res) => {
  const user = req.user;
  res.json({ email: user.email, createdAt: user.createdAt });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`FinCommand backend started at http://localhost:${PORT}`);
});
