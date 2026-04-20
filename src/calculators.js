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

module.exports = { calcRD, calcFD, calcEMI, calcNW };
