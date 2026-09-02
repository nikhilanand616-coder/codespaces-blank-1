const test = require('node:test');
const assert = require('node:assert/strict');
const { calcSIP, calcAmortization, calcBudget, calcRetirement } = require('../src/calculators');
const { createUser, verifyUser, createPasswordReset, resetPassword } = require('../src/userStore');

test('SIP returns invested amount and positive growth', () => {
  const result = calcSIP(10000, 12, 1);
  assert.equal(result.invested, 120000);
  assert.ok(result.maturity > result.invested);
});

test('amortization schedule pays a loan down to zero', () => {
  const result = calcAmortization(100000, 10, 2);
  assert.equal(result.schedule.length, 24);
  assert.ok(result.schedule.at(-1).balance < 0.01);
});

test('budget tracks surplus after savings target', () => {
  const result = calcBudget(100000, { housing: 30000, food: 10000 }, 20);
  assert.equal(result.totalExpenses, 40000);
  assert.equal(result.surplus, 40000);
});

test('retirement projection grows contributions', () => {
  const result = calcRetirement(30, 31, 100000, 10000, 10);
  assert.ok(result.futureValue > result.invested);
});

test('verifyUser accepts trimmed and Unicode-normalized password variants', async () => {
  const email = `normalize-${Date.now()}@example.com`;
  await createUser(email, '  ＦinCommand123!  ');
  const user = await verifyUser(email, 'FinCommand123!');
  assert.ok(user);
  assert.equal(user.email, email);
});

test('resetPassword accepts reset tokens and passwords with surrounding whitespace', async () => {
  const email = `reset-${Date.now()}@example.com`;
  await createUser(email, 'OldPassword123!');
  const token = await createPasswordReset(email);
  assert.ok(token);

  const changed = await resetPassword(email, `  ${token}  `, '  NewPassword123!  ');
  assert.equal(changed, true);
  const loggedIn = await verifyUser(email, 'NewPassword123!');
  assert.ok(loggedIn);
});
