const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { getDefaultUserTier } = require('./subscriptions');

const DATA_PATH = path.join(__dirname, '..', 'data', 'users.json');
const DEFAULT_USER = {
  email: 'existing@fincommand.local',
  password: 'FinCommand123!',
  tier: 'PRO_PLUS' // Demo user gets Pro Plus access
};
const PASSWORD_SALT_BYTES = 16;
const API_KEY_BYTES = 48;
const PASSWORD_HASH_KEYLEN = 64;
// Node 24 enforces a tighter default scrypt memory limit than older releases.
// This parameter set needs roughly 32 MiB plus overhead, so set an explicit
// safe ceiling to prevent a login request from terminating the server.
const PASSWORD_SCRYPT_OPTIONS = { cost: 32768, blockSize: 8, parallelization: 1, maxmem: 128 * 1024 * 1024 };
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function normalizePasswordInput(password) {
  return typeof password === 'string' ? password.normalize('NFKC').trim() : '';
}

function createSalt() {
  return crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, PASSWORD_HASH_KEYLEN, PASSWORD_SCRYPT_OPTIONS).toString('hex');
}

function generateApiKey() {
  return crypto.randomBytes(API_KEY_BYTES).toString('hex');
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function apiKeyMatches(user, apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;
  if (user.apiKeyHash) return secureCompare(user.apiKeyHash, hashApiKey(apiKey));
  return secureCompare(user.apiKey, apiKey);
}

async function ensureStore() {
  try {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, '[]', 'utf8');
  }
}

async function readUsers() {
  await ensureStore();
  const file = await fs.readFile(DATA_PATH, 'utf8');
  try {
    const parsed = JSON.parse(file || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Invalid users.json format, resetting store:', error.message);
    await writeUsers([]);
    return [];
  }
}

async function writeUsers(users) {
  await fs.writeFile(DATA_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function newUserBase(email, apiKey = generateApiKey()) {
  return {
    email,
    apiKeyHash: hashApiKey(apiKey),
    tier: getDefaultUserTier(),
    subscriptionStartDate: new Date().toISOString(),
    dailyUsage: { date: new Date().toISOString().split('T')[0], rd: 0, fd: 0, emi: 0, nw: 0 },
    failedLoginAttempts: 0,
    lockoutExpiresAt: null,
    lastActivityAt: new Date().toISOString(),
    emailVerified: false,
    activity: [],
    scenarios: [],
    createdAt: new Date().toISOString()
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { email: user.email, tier: user.tier || 'FREE', emailVerified: Boolean(user.emailVerified), createdAt: user.createdAt };
}

async function updateUser(email, updater) {
  const users = await readUsers();
  const index = users.findIndex((user) => user.email.toLowerCase() === email.toLowerCase());
  if (index === -1) return null;
  updater(users[index]);
  await writeUsers(users);
  return users[index];
}

async function seedDefaultUser() {
  const users = await readUsers();
  let changed = false;
  users.forEach((user) => {
    if (user.apiKey && !user.apiKeyHash) {
      user.apiKeyHash = hashApiKey(user.apiKey);
      delete user.apiKey;
      changed = true;
    }
  });
  if (users.length === 0) {
    const salt = createSalt();
    const passwordHash = hashPassword(DEFAULT_USER.password, salt);
    const apiKey = generateApiKey();
    users.push({
      email: DEFAULT_USER.email,
      passwordHash,
      salt,
      apiKeyHash: hashApiKey(apiKey),
      tier: DEFAULT_USER.tier,
      subscriptionStartDate: new Date().toISOString(),
      dailyUsage: {
        date: new Date().toISOString().split('T')[0],
        rd: 0,
        fd: 0,
        emi: 0,
        nw: 0
      },
      createdAt: new Date().toISOString()
    });
    changed = true;
  }
  if (changed) await writeUsers(users);
}

async function findByEmail(email) {
  const users = await readUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findByApiKey(apiKey) {
  const users = await readUsers();
  return users.find((user) => apiKeyMatches(user, apiKey)) || null;
}

async function createUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = normalizePasswordInput(password);
  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    const error = new Error('A user with that email already exists');
    error.code = 'USER_EXISTS';
    throw error;
  }

  const salt = createSalt();
  const passwordHash = hashPassword(normalizedPassword, salt);
  const apiKey = generateApiKey();
  const user = {
    ...newUserBase(normalizedEmail, apiKey),
    passwordHash,
    salt
  };

  const users = await readUsers();
  users.push(user);
  await writeUsers(users);

  const verificationToken = await createEmailVerification(user.email);
  return { email: user.email, apiKey, tier: user.tier, verificationToken };
}

async function verifyUser(email, password) {
  const users = await readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = normalizePasswordInput(password);
  const index = users.findIndex((user) => user.email.toLowerCase() === normalizedEmail);
  if (index === -1) return null;

  const user = users[index];
  const now = new Date();
  if (user.lockoutExpiresAt && new Date(user.lockoutExpiresAt) > now) {
    return null;
  }

  if (!user.passwordHash || !user.salt) return null;
  const passwordHash = hashPassword(normalizedPassword, user.salt);
  const passwordMatches = secureCompare(passwordHash, user.passwordHash);

  if (!passwordMatches) {
    users[index].failedLoginAttempts = (users[index].failedLoginAttempts || 0) + 1;
    if (users[index].failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      users[index].lockoutExpiresAt = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    }
    await writeUsers(users);
    return null;
  }

  users[index].failedLoginAttempts = 0;
  users[index].lockoutExpiresAt = null;
  users[index].lastActivityAt = now.toISOString();
  await writeUsers(users);

  return users[index];
}

async function issueApiKey(email) {
  const users = await readUsers();
  const user = users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return null;
  const apiKey = generateApiKey();
  user.apiKeyHash = hashApiKey(apiKey);
  user.lastActivityAt = new Date().toISOString();
  delete user.apiKey;
  await writeUsers(users);
  return apiKey;
}

async function createPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await readUsers();
  const index = users.findIndex((user) => user.email.toLowerCase() === normalizedEmail);
  if (index === -1) return null;
  const token = crypto.randomBytes(24).toString('hex');
  users[index].passwordResetHash = crypto.createHash('sha256').update(token).digest('hex');
  users[index].passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await writeUsers(users);
  return token;
}

async function resetPassword(email, token, password) {
  const users = await readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = typeof token === 'string' ? token.normalize('NFKC').trim() : '';
  const normalizedPassword = normalizePasswordInput(password);
  const index = users.findIndex((user) => user.email.toLowerCase() === normalizedEmail);
  if (index === -1) return false;
  const user = users[index];
  const tokenHash = crypto.createHash('sha256').update(normalizedToken).digest('hex');
  if (!user.passwordResetHash || !user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt) < new Date() || !secureCompare(user.passwordResetHash, tokenHash)) return false;
  user.salt = createSalt();
  user.passwordHash = hashPassword(normalizedPassword, user.salt);
  delete user.passwordResetHash;
  delete user.passwordResetExpiresAt;
  await writeUsers(users);
  return true;
}

async function findOrCreateGoogleUser(email, googleSubject) {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await readUsers();
  let user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
  if (user && user.googleSubject && user.googleSubject !== googleSubject) {
    const error = new Error('This email is linked to a different Google account');
    error.code = 'GOOGLE_ACCOUNT_MISMATCH';
    throw error;
  }
  if (!user) {
    user = { ...newUserBase(normalizedEmail), googleSubject, emailVerified: true };
    users.push(user);
  } else if (!user.googleSubject) {
    user.googleSubject = googleSubject;
  }
  await writeUsers(users);
  const apiKey = await issueApiKey(user.email);
  return { email: user.email, apiKey, tier: user.tier };
}

async function trackUsage(apiKey, calculator) {
  const users = await readUsers();
  const userIndex = users.findIndex((u) => apiKeyMatches(u, apiKey));
  if (userIndex === -1) return null;

  const today = new Date().toISOString().split('T')[0];
  const user = users[userIndex];

  // Reset daily usage if new day
  if (!user.dailyUsage || user.dailyUsage.date !== today) {
    user.dailyUsage = {
      date: today,
      rd: 0,
      fd: 0,
      emi: 0,
      nw: 0
    };
  }

  user.dailyUsage[calculator] = (user.dailyUsage[calculator] || 0) + 1;
  user.lastActivityAt = new Date().toISOString();
  user.activity = [{ type: 'calculation', calculator, at: user.lastActivityAt }, ...(user.activity || [])].slice(0, 100);
  await writeUsers(users);
  return user;
}

async function createEmailVerification(email) {
  const token = crypto.randomBytes(24).toString('hex');
  const updated = await updateUser(email, (user) => {
    user.emailVerificationHash = hashToken(token);
    user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  });
  return updated ? token : null;
}

async function verifyEmail(email, token) {
  const user = await findByEmail(email);
  if (!user || !user.emailVerificationHash || new Date(user.emailVerificationExpiresAt) < new Date() || !secureCompare(user.emailVerificationHash, hashToken(token))) return false;
  await updateUser(email, (item) => {
    item.emailVerified = true;
    delete item.emailVerificationHash;
    delete item.emailVerificationExpiresAt;
    item.activity = [{ type: 'email_verified', at: new Date().toISOString() }, ...(item.activity || [])].slice(0, 100);
  });
  return true;
}

async function createOtp(email) {
  const code = String(crypto.randomInt(100000, 1000000));
  const updated = await updateUser(email, (user) => {
    user.otpHash = hashToken(code);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  });
  return updated ? code : null;
}

async function verifyOtp(email, code) {
  const user = await findByEmail(email);
  if (!user || !user.otpHash || new Date(user.otpExpiresAt) < new Date() || !secureCompare(user.otpHash, hashToken(String(code)))) return false;
  await updateUser(email, (item) => { delete item.otpHash; delete item.otpExpiresAt; });
  return true;
}

async function issueRefreshToken(email) {
  const token = crypto.randomBytes(48).toString('hex');
  const updated = await updateUser(email, (user) => {
    user.refreshTokens = [{ hash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }, ...(user.refreshTokens || [])].slice(0, 5);
  });
  return updated ? token : null;
}

async function consumeRefreshToken(token) {
  const users = await readUsers();
  const tokenHash = hashToken(token);
  const user = users.find((item) => (item.refreshTokens || []).some((entry) => entry.hash === tokenHash && new Date(entry.expiresAt) > new Date()));
  if (!user) return null;
  user.refreshTokens = (user.refreshTokens || []).filter((entry) => entry.hash !== tokenHash && new Date(entry.expiresAt) > new Date());
  user.lastActivityAt = new Date().toISOString();
  await writeUsers(users);
  return user;
}

async function saveScenario(apiKey, scenario) {
  const users = await readUsers();
  const user = users.find((item) => apiKeyMatches(item, apiKey));
  if (!user) return null;
  const record = { id: crypto.randomUUID(), name: String(scenario.name || 'Untitled scenario').slice(0, 80), calculator: String(scenario.calculator || '').slice(0, 30), inputs: scenario.inputs || {}, createdAt: new Date().toISOString() };
  user.scenarios = [record, ...(user.scenarios || [])].slice(0, 50);
  user.activity = [{ type: 'scenario_saved', calculator: record.calculator, at: record.createdAt }, ...(user.activity || [])].slice(0, 100);
  await writeUsers(users);
  return record;
}

async function listUserData(apiKey) {
  const user = await findByApiKey(apiKey);
  return user ? { ...publicUser(user), scenarios: user.scenarios || [], activity: user.activity || [] } : null;
}

async function updateTwoFactor(email, enabled) {
  return updateUser(email, (user) => {
    user.twoFactorEnabled = Boolean(enabled);
    user.activity = [{ type: enabled ? 'two_factor_enabled' : 'two_factor_disabled', at: new Date().toISOString() }, ...(user.activity || [])].slice(0, 100);
  });
}

async function upgradeTier(apiKey, newTier, paymentToken) {
  const users = await readUsers();
  const userIndex = users.findIndex((u) => apiKeyMatches(u, apiKey));
  if (userIndex === -1) return null;

  // Validate payment token - security check
  if (!paymentToken || typeof paymentToken !== 'string' || paymentToken.length < 8) {
    const error = new Error('Invalid payment token - upgrade rejected');
    error.code = 'INVALID_PAYMENT';
    throw error;
  }

  // Prevent duplicate upgrades with same token
  if (users[userIndex].lastPaymentToken === paymentToken) {
    const error = new Error('Payment token already used - possible duplicate upgrade attempt');
    error.code = 'DUPLICATE_PAYMENT';
    throw error;
  }

  users[userIndex].tier = String(newTier || '').trim().toUpperCase();
  users[userIndex].subscriptionStartDate = new Date().toISOString();
  users[userIndex].lastPaymentToken = paymentToken;
  users[userIndex].lastPaymentDate = new Date().toISOString();
  users[userIndex].paymentStatus = 'completed';
  await writeUsers(users);
  return users[userIndex];
}

module.exports = {
  seedDefaultUser,
  findByEmail,
  findByApiKey,
  createUser,
  verifyUser,
  issueApiKey,
  createPasswordReset,
  resetPassword,
  findOrCreateGoogleUser,
  trackUsage,
  upgradeTier,
  createEmailVerification,
  verifyEmail,
  createOtp,
  verifyOtp,
  issueRefreshToken,
  consumeRefreshToken,
  saveScenario,
  listUserData,
  updateTwoFactor
};
