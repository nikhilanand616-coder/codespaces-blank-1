const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_PATH = path.join(__dirname, '..', 'data', 'users.json');
const DEFAULT_USER = {
  email: 'existing@fincommand.local',
  password: 'FinCommand123!'
};

function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
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
  const parsed = JSON.parse(file || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function writeUsers(users) {
  await fs.writeFile(DATA_PATH, JSON.stringify(users, null, 2), 'utf8');
}

async function seedDefaultUser() {
  const users = await readUsers();
  if (users.length === 0) {
    const salt = createSalt();
    const passwordHash = hashPassword(DEFAULT_USER.password, salt);
    const apiKey = generateApiKey();
    users.push({
      email: DEFAULT_USER.email,
      passwordHash,
      salt,
      apiKey,
      createdAt: new Date().toISOString()
    });
    await writeUsers(users);
  }
}

async function findByEmail(email) {
  const users = await readUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findByApiKey(apiKey) {
  const users = await readUsers();
  return users.find((user) => user.apiKey === apiKey) || null;
}

async function createUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    const error = new Error('A user with that email already exists');
    error.code = 'USER_EXISTS';
    throw error;
  }

  const salt = createSalt();
  const passwordHash = hashPassword(password, salt);
  const apiKey = generateApiKey();
  const user = {
    email: normalizedEmail,
    passwordHash,
    salt,
    apiKey,
    createdAt: new Date().toISOString()
  };

  const users = await readUsers();
  users.push(user);
  await writeUsers(users);

  return { email: user.email, apiKey: user.apiKey };
}

async function verifyUser(email, password) {
  const user = await findByEmail(email);
  if (!user) return null;

  const passwordHash = hashPassword(password, user.salt);
  return passwordHash === user.passwordHash ? user : null;
}

module.exports = {
  seedDefaultUser,
  findByEmail,
  findByApiKey,
  createUser,
  verifyUser
};
