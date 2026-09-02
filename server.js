const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Razorpay = require('razorpay');
const { exec } = require('child_process');
const { calcRD, calcFD, calcEMI, calcNW, calcSIP, calcAmortization, calcLoanComparison, calcInsurance, calcBudget, calcRetirement } = require('./src/calculators');
const bankRates = require('./src/bankRates');
const userStore = require('./src/userStore');
const { canUseCalculator, getTierInfo, SUBSCRIPTION_TIERS } = require('./src/subscriptions');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    if (key && value && process.env[key] === undefined) {
      process.env[key] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  });
}

// Read local settings before evaluating port, CORS, or third-party settings.
loadDotEnv();

const app = express();
// Required when HTTPS is terminated by a trusted production proxy.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const CORS_WHITELIST = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : process.env.NODE_ENV === 'production'
    ? []
    : [process.env.CORS_ORIGIN || 'http://localhost:3000'];
const ALLOWED_ORIGINS = new Set(CORS_WHITELIST);

function isAllowedOrigin(origin) {
  if (!origin || ALLOWED_ORIGINS.has(origin)) return true;
  // Permit local preview tools in development while keeping production CORS
  // strictly limited to CORS_ORIGINS. This avoids false "unable to reach
  // server" errors when login.html is opened through Live Server or 127.0.0.1.
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
const razorpay = razorpayConfigured ? new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
}) : null;

console.log(`[AI] Gemini key loaded from environment: ${Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_APIKEY || process.env.GEMINI_APIKEY)}`);
console.log(`[Security] Hardened security controls enabled. Razorpay live verification configured: ${razorpayConfigured}`);

app.disable('x-powered-by');

app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://checkout.razorpay.com', 'https://accounts.google.com/gsi/client'],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (process.env.NODE_ENV === 'production' && req.protocol !== 'https') {
    return res.status(400).json({ error: 'HTTPS is required.' });
  }
  const origin = req.get('origin');
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  next();
});

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  next();
});

const ALLOWED_STATIC_FILES = new Set([
  'login.html',
  'FinCommands.html',
  'styles.css',
  'auth.js',
  'script.js',
  'motion.js',
  'subscriptions.js',
  'logo.svg',
  'favicon.ico'
]);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/' || req.path === '') {
    return next();
  }

  const requestPath = req.path.replace(/^\//, '');
  if (!ALLOWED_STATIC_FILES.has(requestPath)) {
    return res.status(404).end();
  }

  next();
});

app.use(express.json({ limit: '10kb', strict: true }));
// Do not cache the HTML/JS entry points for a day: a local restart should
// always use the current auth script and API configuration.
app.use(express.static(path.join(__dirname), { dotfiles: 'ignore', index: false, extensions: ['html'], maxAge: 0 }));

const isProduction = process.env.NODE_ENV === 'production';
const authRateLimiter = rateLimit({
  // Keep brute-force protection strict in production. A local app is commonly
  // refreshed, tested, and used with password-reset retries, so five combined
  // requests across all auth endpoints is needlessly lockout-prone there.
  windowMs: isProduction ? 15 * 60 * 1000 : 60 * 1000,
  max: isProduction ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' }
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

app.use('/api/v1/login', authRateLimiter);
app.use('/api/v1/register', authRateLimiter);
app.use('/api/v1/password-reset', authRateLimiter);
app.use('/api/v1/google-login', authRateLimiter);
app.use('/api/v1/email-verification', authRateLimiter);
app.use('/api/v1/refresh', authRateLimiter);
app.use('/api/v1/', generalApiLimiter);

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.ip}`);
  next();
});

async function initializeServer() {
  try {
    if (process.env.NODE_ENV !== 'production') await userStore.seedDefaultUser();
    console.log('User store initialized successfully.');
  } catch (error) {
    console.error('Unable to initialize user store:', error);
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api/v1/auth-config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
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

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length > 0;
}

function normalizePasswordInput(password) {
  // Passwords pasted from chat/apps can contain invisible surrounding spaces
  // or visually identical Unicode characters. Normalize these before applying
  // the documented policy so a valid password is not falsely rejected.
  return typeof password === 'string' ? password.normalize('NFKC').trim() : '';
}

function isFiniteNumber(value, { min = 0, max = 1000000000 } = {}) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function hasOnlyFields(body, fields) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every((key) => fields.includes(key));
}

function validCalculation(body, fields) {
  return hasOnlyFields(body, fields) && fields.every((field) => isFiniteNumber(body[field]));
}

async function recordCalculation(req, calculator) {
  await userStore.trackUsage(getApiKey(req), calculator);
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
  const { email, rememberMe, otp } = req.body;
  // Registration and reset already normalize password input. Do the same at
  // sign-in so an accidental pasted space or Unicode look-alike is not
  // reported as invalid credentials.
  const password = normalizePasswordInput(req.body.password);
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!isValidEmail(email) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid login payload' });
  }

  const user = await userStore.verifyUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.twoFactorEnabled && !(await userStore.verifyOtp(user.email, otp))) {
    const devOtp = await userStore.createOtp(user.email);
    return res.status(202).json({ requiresOtp: true, message: 'Enter the one-time verification code.', ...(isProduction ? {} : { devOtp }) });
  }
  const apiKey = await userStore.issueApiKey(user.email);
  const refreshToken = rememberMe === true ? await userStore.issueRefreshToken(user.email) : null;
  res.json({
    email: user.email,
    apiKey,
    tier: user.tier || 'FREE',
    tierInfo: getTierInfo(user.tier || 'FREE'),
    ...(refreshToken ? { refreshToken } : {})
  });
});

app.post('/api/v1/register', async (req, res) => {
  const { email } = req.body;
  const password = normalizePasswordInput(req.body.password);
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  try {
    const result = await userStore.createUser(email, password);
    const { verificationToken, ...registration } = result;
    return res.status(201).json({
      ...registration,
      tierInfo: getTierInfo(result.tier || 'FREE'),
      ...(isProduction ? {} : { verificationToken })
    });
  } catch (error) {
    if (error.code === 'USER_EXISTS') {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Unable to register user' });
  }
});

app.post('/api/v1/email-verification/request', async (req, res) => {
  if (!isValidEmail(req.body?.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const token = await userStore.createEmailVerification(req.body.email);
  res.json({ message: 'If that account exists, a verification message was issued.', ...(token && !isProduction ? { verificationToken: token } : {}) });
});

app.post('/api/v1/email-verification/confirm', async (req, res) => {
  if (!isValidEmail(req.body?.email) || typeof req.body?.token !== 'string' || req.body.token.length > 200) return res.status(400).json({ error: 'Invalid verification request.' });
  const verified = await userStore.verifyEmail(req.body.email, req.body.token);
  if (!verified) return res.status(400).json({ error: 'The verification code is invalid or expired.' });
  res.json({ message: 'Email verified.' });
});

app.post('/api/v1/refresh', async (req, res) => {
  const token = req.body?.refreshToken;
  if (typeof token !== 'string' || token.length < 40 || token.length > 200) return res.status(400).json({ error: 'Invalid refresh token.' });
  const user = await userStore.consumeRefreshToken(token);
  if (!user) return res.status(401).json({ error: 'Refresh token expired or invalid.' });
  const apiKey = await userStore.issueApiKey(user.email);
  const refreshToken = await userStore.issueRefreshToken(user.email);
  res.json({ email: user.email, apiKey, refreshToken, tier: user.tier || 'FREE', tierInfo: getTierInfo(user.tier || 'FREE') });
});

app.post('/api/v1/two-factor/request', authenticateApiKey, async (req, res) => {
  const code = await userStore.createOtp(req.user.email);
  res.json({ message: 'One-time code issued.', ...(isProduction ? {} : { devOtp: code }) });
});

app.post('/api/v1/two-factor/enable', authenticateApiKey, async (req, res) => {
  if (!(await userStore.verifyOtp(req.user.email, req.body?.otp))) return res.status(400).json({ error: 'Invalid or expired one-time code.' });
  await userStore.updateTwoFactor?.(req.user.email, true);
  res.json({ message: 'Two-factor authentication enabled.' });
});

app.post('/api/v1/password-reset/request', async (req, res) => {
  const { email } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });

  const resetToken = await userStore.createPasswordReset(email);
  // Avoid account enumeration: this response remains the same whether the user exists.
  const response = { message: 'If that account exists, a password reset code has been issued.' };
  // This project has no email delivery provider configured. In local mode,
  // return the generated code to the browser so the reset flow is usable. It
  // is never returned when NODE_ENV is production.
  if (resetToken && !isProduction) {
    response.resetToken = resetToken;
    response.message = 'A reset code was issued. It has been filled in below for this local-development app.';
  }
  res.json(response);
});

app.post('/api/v1/password-reset/confirm', async (req, res) => {
  const { email, token } = req.body;
  const password = normalizePasswordInput(req.body.password);
  if (!isValidEmail(email) || typeof token !== 'string' || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Provide a valid email, reset code, and password.' });
  }

  const changed = await userStore.resetPassword(email, token, password);
  if (!changed) return res.status(400).json({ error: 'That reset code is invalid or has expired.' });
  res.json({ message: 'Password updated. You can now sign in.' });
});

app.post('/api/v1/google-login', async (req, res) => {
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length > 10000) {
    return res.status(400).json({ error: 'Invalid Google sign-in credential' });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in has not been configured yet.' });
  }

  try {
    const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const payload = await googleResponse.json();
    if (!googleResponse.ok || payload.aud !== process.env.GOOGLE_CLIENT_ID || payload.email_verified !== 'true' || !isValidEmail(payload.email)) {
      return res.status(401).json({ error: 'Google could not verify this sign-in.' });
    }
    const result = await userStore.findOrCreateGoogleUser(payload.email, payload.sub);
    return res.json({ ...result, tierInfo: getTierInfo(result.tier || 'FREE') });
  } catch (error) {
    if (error.code === 'GOOGLE_ACCOUNT_MISMATCH') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Google sign-in verification failed:', error.message);
    return res.status(502).json({ error: 'Unable to verify Google sign-in. Please try again.' });
  }
});

app.post('/api/v1/rd', authenticateApiKey, async (req, res) => {
  const { monthly, annualRate, months } = req.body;
  if (!validCalculation(req.body, ['monthly', 'annualRate', 'months']) || months > 1200 || annualRate > 100) return res.status(400).json({ error: 'Invalid RD inputs.' });
  await recordCalculation(req, 'rd');
  const result = calcRD(monthly, annualRate, months);

  res.json({
    ...result,
    monthly: Number(monthly) || 0,
    annualRate: Number(annualRate) || 0,
    months: Number(months) || 0
  });
});

app.post('/api/v1/fd', authenticateApiKey, async (req, res) => {
  const { principal, annualRate, years } = req.body;
  if (!validCalculation(req.body, ['principal', 'annualRate', 'years']) || years > 100 || annualRate > 100) return res.status(400).json({ error: 'Invalid FD inputs.' });
  await recordCalculation(req, 'fd');
  const result = calcFD(principal, annualRate, years);

  res.json({
    ...result,
    principal: Number(principal) || 0,
    annualRate: Number(annualRate) || 0,
    years: Number(years) || 0
  });
});

app.post('/api/v1/emi', authenticateApiKey, async (req, res) => {
  const { principal, annualRate, years } = req.body;
  if (!validCalculation(req.body, ['principal', 'annualRate', 'years']) || years > 100 || annualRate > 100) return res.status(400).json({ error: 'Invalid EMI inputs.' });
  await recordCalculation(req, 'emi');
  const result = calcEMI(principal, annualRate, years);

  res.json({
    ...result,
    principal: Number(principal) || 0,
    annualRate: Number(annualRate) || 0,
    years: Number(years) || 0
  });
});

app.post('/api/v1/nw', authenticateApiKey, async (req, res) => {
  const { assets, liabilities } = req.body;
  if (!validCalculation(req.body, ['assets', 'liabilities'])) return res.status(400).json({ error: 'Invalid net-worth inputs.' });
  await recordCalculation(req, 'nw');
  const result = calcNW(assets, liabilities);

  res.json({
    ...result,
    assets: Number(assets) || 0,
    liabilities: Number(liabilities) || 0
  });
});

app.post('/api/v1/sip', authenticateApiKey, async (req, res) => {
  const { monthly, annualRate, years } = req.body;
  if (!validCalculation(req.body, ['monthly', 'annualRate', 'years']) || years > 100 || annualRate > 100) return res.status(400).json({ error: 'Invalid SIP inputs.' });
  await recordCalculation(req, 'sip');
  res.json(calcSIP(monthly, annualRate, years));
});

app.post('/api/v1/loan-comparison', authenticateApiKey, async (req, res) => {
  const { loanA, loanB } = req.body || {};
  const loanIsValid = (loan) => loan && validCalculation(loan, ['principal', 'annualRate', 'years']) && loan.years <= 100 && loan.annualRate <= 100;
  if (!hasOnlyFields(req.body, ['loanA', 'loanB']) || !loanIsValid(loanA) || !loanIsValid(loanB)) return res.status(400).json({ error: 'Invalid loan-comparison inputs.' });
  await recordCalculation(req, 'loan');
  res.json(calcLoanComparison(loanA, loanB));
});

app.post('/api/v1/amortization', authenticateApiKey, async (req, res) => {
  const { principal, annualRate, years } = req.body;
  if (!validCalculation(req.body, ['principal', 'annualRate', 'years']) || years > 50 || annualRate > 100) return res.status(400).json({ error: 'Invalid amortization inputs.' });
  await recordCalculation(req, 'amortization');
  res.json(calcAmortization(principal, annualRate, years));
});

app.post('/api/v1/insurance', authenticateApiKey, async (req, res) => {
  const { coverage, term, age, healthFactor } = req.body;
  if (!validCalculation(req.body, ['coverage', 'term', 'age', 'healthFactor']) || age < 18 || age > 100 || term > 100 || healthFactor > 5) return res.status(400).json({ error: 'Invalid insurance inputs.' });
  await recordCalculation(req, 'insurance');
  res.json(calcInsurance(coverage, term, age, healthFactor));
});

app.post('/api/v1/budget', authenticateApiKey, async (req, res) => {
  const { income, expenses, savingsTarget } = req.body || {};
  if (!hasOnlyFields(req.body, ['income', 'expenses', 'savingsTarget']) || !isFiniteNumber(income) || !isFiniteNumber(savingsTarget, { min: 0, max: 100 }) || !expenses || typeof expenses !== 'object' || Array.isArray(expenses) || Object.keys(expenses).length > 20 || !Object.values(expenses).every((value) => isFiniteNumber(value))) return res.status(400).json({ error: 'Invalid budget inputs.' });
  await recordCalculation(req, 'budget');
  res.json(calcBudget(income, expenses, savingsTarget));
});

app.post('/api/v1/retirement', authenticateApiKey, async (req, res) => {
  const { currentAge, retirementAge, currentSavings, monthlyContribution, annualRate } = req.body;
  if (!validCalculation(req.body, ['currentAge', 'retirementAge', 'currentSavings', 'monthlyContribution', 'annualRate']) || currentAge < 18 || retirementAge > 100 || retirementAge < currentAge || annualRate > 100) return res.status(400).json({ error: 'Invalid retirement inputs.' });
  await recordCalculation(req, 'retirement');
  res.json(calcRetirement(currentAge, retirementAge, currentSavings, monthlyContribution, annualRate));
});

app.get('/api/v1/profile', authenticateApiKey, (req, res) => {
  const user = req.user;
  res.json({
    email: user.email,
    tier: user.tier || 'FREE',
    tierInfo: getTierInfo(user.tier || 'FREE'),
    subscriptionStartDate: user.subscriptionStartDate,
    dailyUsage: user.dailyUsage,
    createdAt: user.createdAt,
    emailVerified: Boolean(user.emailVerified),
    twoFactorEnabled: Boolean(user.twoFactorEnabled)
  });
});

app.get('/api/v1/dashboard', authenticateApiKey, async (req, res) => {
  const data = await userStore.listUserData(getApiKey(req));
  if (!data) return res.status(404).json({ error: 'Account not found.' });
  res.json(data);
});

app.get('/api/v1/scenarios', authenticateApiKey, async (req, res) => {
  const data = await userStore.listUserData(getApiKey(req));
  res.json({ scenarios: data?.scenarios || [] });
});

app.post('/api/v1/scenarios', authenticateApiKey, async (req, res) => {
  const { name, calculator, inputs } = req.body || {};
  if (!hasOnlyFields(req.body, ['name', 'calculator', 'inputs']) || typeof name !== 'string' || !name.trim() || name.length > 80 || typeof calculator !== 'string' || !/^[a-z-]{2,30}$/.test(calculator) || !inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return res.status(400).json({ error: 'Invalid scenario.' });
  const scenario = await userStore.saveScenario(getApiKey(req), { name, calculator, inputs });
  res.status(201).json(scenario);
});

app.get('/api/v1/activity', authenticateApiKey, async (req, res) => {
  const data = await userStore.listUserData(getApiKey(req));
  res.json({ activity: data?.activity || [] });
});

app.get('/api/v1/subscriptions', (req, res) => {
  res.json(SUBSCRIPTION_TIERS);
});

app.post('/api/v1/upgrade', authenticateApiKey, (req, res) => {
  return res.status(403).json({ 
    error: 'Direct upgrades are not allowed. Please use the payment endpoint.',
    code: 'PAYMENT_REQUIRED'
  });
});

app.post('/api/v1/process-payment', authenticateApiKey, async (req, res) => {
  return res.status(410).json({ error: 'Payments are disabled until a signed, server-verified payment flow is configured.' });
  /*
  const { tier, amount, lastFourDigits } = req.body;
  
  // Validate tier
  if (!SUBSCRIPTION_TIERS[tier]) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  // Validate amount matches tier pricing
  const expectedAmount = tier === 'PRO' ? 99 : 299;
  if (amount !== expectedAmount) {
    return res.status(400).json({ error: 'Amount mismatch - upgrade rejected' });
  }

  // Validate card info provided
  if (!lastFourDigits || lastFourDigits.length !== 4 || !/^\d{4}$/.test(lastFourDigits)) {
    return res.status(400).json({ error: 'Invalid card details' });
  }

  try {
    // Generate unique payment token (in production, this would come from payment gateway)
    const paymentToken = require('crypto').randomBytes(16).toString('hex');
    const paymentId = paymentToken.slice(0, 8).toUpperCase();
    
    // Log payment attempt
    console.log(`[Payment] Processing upgrade to ${tier} for user ${req.user.email}, Card: ****${lastFourDigits}, Amount: ₹${amount}`);
    
    // Process upgrade with payment verification
    const updatedUser = await userStore.upgradeTier(req.user.apiKey, tier, paymentToken);
    
    if (!updatedUser) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Success response
    console.log(`[Payment] ✓ Upgrade successful - Payment ID: ${paymentId}`);
    res.json({
      message: `Successfully upgraded to ${tier}`,
      tier: updatedUser.tier,
      tierInfo: getTierInfo(updatedUser.tier),
      paymentId: paymentId,
      paymentAmount: amount,
      lastFourDigits: lastFourDigits
    });
  } catch (error) {
    console.error('[Payment] Error:', error.message);
    
    if (error.code === 'INVALID_PAYMENT') {
      return res.status(400).json({ error: 'Payment verification failed - invalid token' });
    }
    if (error.code === 'DUPLICATE_PAYMENT') {
      return res.status(400).json({ error: 'Payment token already used - duplicate upgrade blocked' });
    }
    
    return res.status(500).json({ error: 'Payment processing error' });
  }
  */
});

app.post('/api/v1/process-upi-payment', authenticateApiKey, async (req, res) => {
  return res.status(410).json({ error: 'Payments are disabled until a signed, server-verified payment flow is configured.' });
  /*
  const { tier, amount, upiProvider, upiId } = req.body;

  // Validate tier
  if (!SUBSCRIPTION_TIERS[tier]) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  // Validate amount matches tier pricing
  const expectedAmount = tier === 'PRO' ? 99 : 299;
  if (amount !== expectedAmount) {
    return res.status(400).json({ error: 'Amount mismatch - upgrade rejected' });
  }

  // Validate UPI provider
  const validProviders = ['googlepay', 'googleplay', 'phonepe', 'bhim', 'paytm', 'navi'];
  if (!validProviders.includes(upiProvider)) {
    return res.status(400).json({ error: 'Invalid UPI provider' });
  }

  // Validate UPI ID format (if provided)
  const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$|^\d{10}@[a-zA-Z0-9]+$/;
  if (upiId && !upiPattern.test(upiId)) {
    return res.status(400).json({ error: 'Invalid UPI ID format' });
  }

  try {
    // Create Razorpay order for UPI payment
    const options = {
      amount: amount * 100, // Razorpay expects amount in paisa
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        tier: tier,
        user_email: req.user.email,
        upi_provider: upiProvider,
        upi_id: upiId
      }
    };

    const order = await razorpay.orders.create(options);

    console.log(`[UPI Payment] Created Razorpay order ${order.id} for user ${req.user.email}`);
    console.log(`[UPI Payment] Amount: ₹${amount}, Provider: ${upiProvider}, UPI: ${upiId || 'system-selected'}`);

    res.json({
      message: 'UPI payment order created',
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      upiProvider: upiProvider,
      upiId: upiId,
      tier: tier,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag'
    });

  } catch (error) {
    const orderErrorMessage = error?.message || error?.error?.description || error?.error_description || error?.statusMessage || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error('[UPI Payment] Error creating order:', orderErrorMessage, { error });

    const shouldSimulate = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET ||
      error?.statusCode === 401 ||
      error?.error?.code === 'BAD_REQUEST_ERROR' ||
      String(error?.error?.description || '').toLowerCase().includes('auth');

    if (shouldSimulate) {
      console.warn('[UPI Payment] Falling back to simulation for Razorpay order creation.');
      return res.json({
        message: 'UPI payment simulation enabled',
        orderId: null,
        amount: amount * 100,
        currency: 'INR',
        upiProvider: upiProvider,
        upiId: upiId,
        tier: tier,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag',
        simulate: true
      });
    }

    return res.status(500).json({ error: 'Failed to create payment order: ' + orderErrorMessage });
  }
  */
});

app.post('/api/v1/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  return res.status(410).json({ error: 'Webhook disabled until signed order reconciliation is configured.' });
  /*
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';

  try {
    // Verify webhook signature (recommended for production)
    // const expectedSignature = crypto.createHmac('sha256', secret)
    //   .update(JSON.stringify(req.body))
    //   .digest('hex');
    // const receivedSignature = req.headers['x-razorpay-signature'];

    // if (expectedSignature !== receivedSignature) {
    //   return res.status(400).json({ error: 'Invalid signature' });
    // }

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    if (event === 'payment.captured') {
      const orderId = paymentEntity.order_id;
      const amount = paymentEntity.amount / 100; // Convert from paisa to rupees
      const notes = paymentEntity.notes || {};

      console.log(`[Razorpay Webhook] Payment captured for order ${orderId}`);
      console.log(`[Razorpay Webhook] Amount: ₹${amount}, Tier: ${notes.tier}, User: ${notes.user_email}`);

      // Find user by email and upgrade tier
      const user = await userStore.findByEmail(notes.user_email);
      if (user) {
        const paymentToken = require('crypto').randomBytes(16).toString('hex');
        const updatedUser = await userStore.upgradeTier(user.apiKey, notes.tier, paymentToken);

        if (updatedUser) {
          console.log(`[Razorpay Webhook] ✓ Upgrade successful for ${notes.user_email}`);
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('[Razorpay Webhook] Error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
  */
});

app.post('/api/v1/verify-upi-payment', authenticateApiKey, async (req, res) => {
  return res.status(410).json({ error: 'Payments are disabled until a signed, server-verified payment flow is configured.' });
  /*
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID required' });
  }

  try {
    // In production: verify with payment gateway
    console.log(`[UPI Verification] Verifying transaction ${transactionId}`);
    
    // For demo, assume success after payment was initiated
    const user = req.user;
    
    res.json({
      message: 'Payment verified',
      transactionId: transactionId,
      tier: user.tier,
      paymentStatus: user.paymentStatus || 'completed',
      tierInfo: getTierInfo(user.tier)
    });
  } catch (error) {
    console.error('[UPI Verification] Error:', error.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
  */
});

app.post('/api/v1/check-limit', authenticateApiKey, (req, res) => {
  const { calculator } = req.body;
  const userTier = req.user.tier || 'FREE';
  const dailyUsage = req.user.dailyUsage?.[calculator] || 0;
  const canUse = canUseCalculator(userTier, calculator, dailyUsage);

  res.json({
    canUse,
    tier: userTier,
    dailyUsage,
    calculator
  });
});

app.post('/api/v1/ai', authenticateApiKey, async (req, res) => {
  const { prompt, panel, context } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const result = await generateGeminiResponse(prompt, panel, context);
    if (!result?.answer) {
      return res.status(503).json({ error: 'Gemini AI is unavailable' });
    }

    res.json(result);
  } catch (error) {
    console.error('[AI] Gemini request failed:', error.message || error);
    res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS origin denied' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

async function generateGeminiResponse(prompt, panel = 'general', context = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_APIKEY || process.env.GEMINI_APIKEY;
  const model = (process.env.GEMINI_MODEL || 'gemini-3.6-flash').replace(/^models\//, '');

  const contextParts = [];
  if (panel) {
    contextParts.push(`Panel: ${panel}`);
  }

  if (context && typeof context === 'object') {
    const entries = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${value}`);
    if (entries.length) {
      contextParts.push('Inputs:');
      contextParts.push(entries.join(', '));
    }
  }

  const systemMessage = 'You are FinCommand AI, a smart financial assistant that gives concise, actionable guidance based on the selected calculator inputs. Keep advice practical and grounded in the provided numbers.';
  const userMessage = `${contextParts.join('\n')}${contextParts.length ? '\n' : ''}Question: ${prompt}`;

  if (!apiKey) {
    return { answer: generateGeminiFallback(prompt, panel, context), provider: 'local' };
  }

  // Gemini's current REST API uses generateContent with contents/parts, not
  // the retired generateMessage endpoint.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };

  const body = {
    systemInstruction: {
      parts: [{ text: systemMessage }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: { temperature: 0.7, maxOutputTokens: 350 }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      const bodyText = await response.text();
      console.error('[AI] Gemini response error:', response.status, bodyText);
      return { answer: generateGeminiFallback(prompt, panel, context), provider: 'local' };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    return { answer: text || generateGeminiFallback(prompt, panel, context), provider: text ? 'gemini' : 'local' };
  } catch (error) {
    console.error('[AI] Gemini request failed:', error);
    return { answer: generateGeminiFallback(prompt, panel, context), provider: 'local' };
  }
}

function generateGeminiFallback(prompt, panel = 'general', context = {}) {
  const safePrompt = String(prompt || '').trim();
  const values = Object.entries(context || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${value}`);

  const panelName = {
    rd: 'Recurring Deposit',
    fd: 'Fixed Deposit',
    emi: 'EMI',
    nw: 'Net Worth',
    sip: 'SIP',
    gst: 'GST'
  }[panel] || 'Finance';

  const details = values.length ? ` Based on your inputs (${values.join(', ')}).` : '';
  return `Here is a local ${panelName} guide:${details} For “${safePrompt || 'your plan'}”, focus on affordability, expected return, and risk. Check the calculator result, keep an emergency buffer, and review the plan before committing funds.`;
}

async function startServer() {
  await initializeServer();
  const server = app.listen(PORT, '::', () => {
    console.log(`FinCommand backend started on port ${PORT} and is accessible from any network interface.`);
  });

  // A second start is common when VS Code restores its folder-open task. Give a
  // clear actionable message instead of an unhandled crash in that situation.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. FinCommand may already be running at http://localhost:${PORT}.`);
    } else {
      console.error('Unable to start FinCommand server:', error);
    }
    process.exitCode = 1;
  });
}

startServer();
