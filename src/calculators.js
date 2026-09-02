function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calcRD(monthly, annualRate, months) {
  const M = parseNumber(monthly);
  const rA = parseNumber(annualRate);
  const N = parseNumber(months);
  const r = rA / 400;
  let maturity = 0;

  if (M > 0 && N > 0) {
    for (let i = 1; i <= N; i += 1) {
      maturity += M * Math.pow(1 + r, (N - i + 1) / 3);
    }
  }

  const invested = M * N;
  const interest = Math.max(0, maturity - invested);

  return { maturity, invested, interest };
}

function calcFD(principal, annualRate, years) {
  const P = parseNumber(principal);
  const rA = parseNumber(annualRate);
  const Y = parseNumber(years);
  const quarterly = 4;
  const r = rA / 100;

  const maturity = P > 0 && Y > 0 ? P * Math.pow(1 + r / quarterly, quarterly * Y) : 0;
  const interest = Math.max(0, maturity - P);

  return { maturity, principal: P, interest };
}

function calcEMI(principal, annualRate, years) {
  const P = parseNumber(principal);
  const rA = parseNumber(annualRate);
  const Y = parseNumber(years);
  const monthlyRate = rA / 12 / 100;
  const n = Y * 12;
  let emi = 0;

  if (P > 0 && n > 0) {
    emi = monthlyRate > 0
      ? (P * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
      : P / n;
  }

  const total = emi * n;
  const interest = Math.max(0, total - P);

  return { monthly: emi, principal: P, interest, total };
}

function calcNW(assets, liabilities) {
  const A = parseNumber(assets);
  const L = parseNumber(liabilities);
  const netWorth = Math.max(0, A - L) || A - L;

  return { netWorth, assets: A, liabilities: L };
}

function calcSIP(monthly, annualRate, years) {
  const M = parseNumber(monthly);
  const monthlyRate = parseNumber(annualRate) / 1200;
  const months = Math.floor(parseNumber(years) * 12);
  const invested = M * months;
  const maturity = M > 0 && months > 0
    ? monthlyRate > 0
      ? M * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
      : invested
    : 0;
  return { maturity, invested, interest: Math.max(0, maturity - invested), months };
}

function calcAmortization(principal, annualRate, years) {
  const summary = calcEMI(principal, annualRate, years);
  const rate = parseNumber(annualRate) / 1200;
  const months = Math.floor(parseNumber(years) * 12);
  let balance = summary.principal;
  const schedule = [];
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * rate;
    const principalPaid = Math.min(balance, Math.max(0, summary.monthly - interest));
    balance = Math.max(0, balance - principalPaid);
    schedule.push({ month, payment: summary.monthly, principal: principalPaid, interest, balance });
  }
  return { ...summary, schedule };
}

function calcLoanComparison(loanA, loanB) {
  const a = calcAmortization(loanA.principal, loanA.annualRate, loanA.years);
  const b = calcAmortization(loanB.principal, loanB.annualRate, loanB.years);
  return { loanA: a, loanB: b, betterOption: a.total <= b.total ? 'loanA' : 'loanB', savings: Math.abs(a.total - b.total) };
}

function calcInsurance(coverage, term, age, healthFactor) {
  const C = parseNumber(coverage);
  const A = parseNumber(age);
  const factor = Math.max(0.5, parseNumber(healthFactor) || 1);
  const premium = C * 0.02 * Math.max(1, (A - 25) / 10) * factor / 100;
  return { coverage: C, term: parseNumber(term), age: A, healthFactor: factor, annualPremium: premium, monthlyPremium: premium / 12 };
}

function calcBudget(income, expenses, savingsTarget) {
  const I = parseNumber(income);
  const normalizedExpenses = Object.fromEntries(Object.entries(expenses || {}).map(([key, value]) => [key, Math.max(0, parseNumber(value))]));
  const totalExpenses = Object.values(normalizedExpenses).reduce((sum, value) => sum + value, 0);
  const targetSavings = Math.max(0, Math.min(I, I * parseNumber(savingsTarget) / 100));
  return { income: I, expenses: normalizedExpenses, totalExpenses, targetSavings, surplus: I - totalExpenses - targetSavings };
}

function calcRetirement(currentAge, retirementAge, currentSavings, monthlyContribution, annualRate) {
  const years = Math.max(0, parseNumber(retirementAge) - parseNumber(currentAge));
  const months = Math.floor(years * 12);
  const rate = parseNumber(annualRate) / 1200;
  let futureValue = parseNumber(currentSavings);
  for (let month = 0; month < months; month += 1) futureValue = (futureValue + parseNumber(monthlyContribution)) * (1 + rate);
  const invested = parseNumber(currentSavings) + parseNumber(monthlyContribution) * months;
  return { years, futureValue, invested, growth: Math.max(0, futureValue - invested) };
}

module.exports = { calcRD, calcFD, calcEMI, calcNW, calcSIP, calcAmortization, calcLoanComparison, calcInsurance, calcBudget, calcRetirement };
