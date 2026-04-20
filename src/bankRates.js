const fs = require('fs').promises;
const path = require('path');

const bankRatesFile = path.join(__dirname, '..', 'data', 'bankRates.json');

async function getBankRates() {
  const file = await fs.readFile(bankRatesFile, 'utf8');
  return JSON.parse(file);
}

module.exports = {
  getBankRates
};
