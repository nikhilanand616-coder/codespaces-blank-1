const fs = require('fs').promises;
const path = require('path');

const bankRatesFile = path.join(__dirname, '..', 'data', 'bankRates.json');
const bankRatesSourceUrl = process.env.BANK_RATES_SOURCE_URL?.trim();
const bankRatesCacheTtlSeconds = Number(process.env.BANK_RATES_CACHE_TTL_SECONDS) || 30;
const bankRatesCache = { timestamp: 0, data: null };
let cachedBaseRates = null;

function isValidBankRatesPayload(payload) {
  return payload
    && typeof payload === 'object'
    && Array.isArray(payload.rdBanks)
    && Array.isArray(payload.fdBanks);
}

async function loadBaseRates() {
  if (!cachedBaseRates) {
    const file = await fs.readFile(bankRatesFile, 'utf8');
    cachedBaseRates = JSON.parse(file);
  }
  return cachedBaseRates;
}

async function fetchExternalBankRates() {
  if (!bankRatesSourceUrl) return null;

  const now = Date.now();
  if (bankRatesCache.data && (now - bankRatesCache.timestamp) < bankRatesCacheTtlSeconds * 1000) {
    return bankRatesCache.data;
  }

  const response = await fetch(bankRatesSourceUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Bank rates source returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!isValidBankRatesPayload(payload)) {
    throw new Error('Bank rates source returned invalid payload');
  }

  bankRatesCache.data = payload;
  bankRatesCache.timestamp = now;
  return payload;
}

async function getBankRates() {
  if (bankRatesSourceUrl) {
    try {
      const external = await fetchExternalBankRates();
      if (external) {
        return {
          ...external,
          source: 'external',
          updatedAt: external.updatedAt || new Date().toISOString()
        };
      }
    } catch (error) {
      console.warn('[BankRates] external source failed:', error.message);
    }
  }

  const baseRates = await loadBaseRates();
  return {
    ...baseRates,
    source: 'local',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getBankRates
};
