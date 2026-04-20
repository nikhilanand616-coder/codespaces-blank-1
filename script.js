const BACKEND_BASE_URL = 'http://localhost:3000';

const project = {
  async init() {
    this.hydrateSessionFromUrl();
    if (!this.requireAuth()) return;
    this.cacheElements();
    this.bindEvents();
    this.syncAllRanges();
    await this.loadBankRates();
    this.startRatePolling();
    this.calculateAll();
    this.setupIntersectionObserver();
  },

  cacheElements() {
    this.tabButtons = Array.from(document.querySelectorAll('.calc-tab'));
    this.panels = Array.from(document.querySelectorAll('.calc-panel'));
    this.profileLink = document.querySelector('.nav-cta');
    this.logoutButton = document.getElementById('logout-button');
    this.userBadge = document.getElementById('nav-user-display');
    this.bankSelectors = {
      rd: document.getElementById('rd-bank'),
      fd: document.getElementById('fd-bank')
    };
  },

  bindEvents() {
    this.tabButtons.forEach((button) => {
      button.addEventListener('click', (event) => this.switchCalc(event));
    });

    if (this.logoutButton) {
      this.logoutButton.addEventListener('click', () => this.clearSession());
    }

    document.querySelectorAll('input[type="range"]').forEach((range) => {
      const targetId = range.id.replace('-range', '-val');
      range.addEventListener('input', () => {
        this.updateRangeValue(range, document.getElementById(targetId));
        this.calculateForPanel(range.dataset.panel);
      });
    });

    document.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener('input', () => this.calculateForPanel(input.dataset.panel));
    });

    document.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.calculateForPanel(button.dataset.panel));
    });

    Object.entries(this.bankSelectors).forEach(([type, select]) => {
      select.addEventListener('change', () => this.applyBankRate(type));
    });

    if (this.profileLink) {
      this.profileLink.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('calculators').scrollIntoView({ behavior: 'smooth' });
      });
    }
  },

  updateRangeValue(range, labelEl) {
    if (!labelEl) return;
    const value = parseFloat(range.value);
    labelEl.textContent = range.dataset.unit === '%' ? `${value.toFixed(2)}%` : `${value} ${range.dataset.unit}`;
  },

  syncAllRanges() {
    document.querySelectorAll('input[type="range"]').forEach((range) => {
      const label = document.getElementById(range.id.replace('-range', '-val'));
      this.updateRangeValue(range, label);
    });
  },

  async calculateForPanel(panelId) {
    switch (panelId) {
      case 'rd':
        await this.calcRD();
        break;
      case 'fd':
        await this.calcFD();
        break;
      case 'emi':
        await this.calcEMI();
        break;
      case 'nw':
        await this.calcNW();
        break;
      default:
        await this.calculateAll();
    }
  },

  async calculateAll() {
    await Promise.all([
      this.calcEMI(),
      this.calcRD(),
      this.calcFD(),
      this.calcNW()
    ]);
  },

  getApiKey() {
    return localStorage.getItem('fincommand_api_key') || '';
  },

  getUserEmail() {
    return localStorage.getItem('fincommand_user_email') || '';
  },

  clearSession() {
    localStorage.removeItem('fincommand_api_key');
    localStorage.removeItem('fincommand_user_email');
    window.location.href = `${BACKEND_BASE_URL}/login.html`;
  },

  showUserStatus() {
    if (this.userBadge) {
      const email = this.getUserEmail();
      this.userBadge.textContent = email ? `Signed in as ${email}` : 'Signed in';
    }
  },

  hydrateSessionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const apiKey = params.get('apiKey');

    if (email && apiKey && !this.getApiKey()) {
      localStorage.setItem('fincommand_user_email', email);
      localStorage.setItem('fincommand_api_key', apiKey);
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  },

  requireAuth() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      window.location.href = `${BACKEND_BASE_URL}/login.html`;
      return false;
    }

    this.showUserStatus();
    return true;
  },

  async loadBankRates() {
    const data = await this.fetchBankRates();
    if (!data) return;

    this.populateBankSelector('rd', data.rdBanks);
    this.populateBankSelector('fd', data.fdBanks);
  },

  startRatePolling() {
    if (this.ratePollingTimer) {
      clearInterval(this.ratePollingTimer);
    }

    this.ratePollingTimer = setInterval(async () => {
      await this.loadBankRates();
    }, 15000);
  },

  async fetchBankRates() {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/bank-rates`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch bank rates:', error);
      return null;
    }
  },

  populateBankSelector(type, banks) {
    const select = this.bankSelectors[type];
    if (!select) return;

    const selectedBankName = select.value === 'custom'
      ? null
      : select.options[select.selectedIndex].getAttribute('data-bank');

    select.innerHTML = `<option value="custom">-- Enter Custom Rate --</option>`;
    banks.forEach((bank) => {
      const option = document.createElement('option');
      option.value = bank.rate.toFixed(2);
      option.textContent = `${bank.name} (${bank.rate.toFixed(2)}%)`;
      option.setAttribute('data-bank', bank.name);
      option.setAttribute('data-bank-id', bank.id);
      select.appendChild(option);
    });

    if (selectedBankName) {
      const preserved = Array.from(select.options).find((option) => option.dataset.bank === selectedBankName);
      if (preserved) {
        preserved.selected = true;
      }
    }

    this.applyBankRate(type);
  },

  async requestCalculation(endpoint, payload) {
    const apiKey = this.getApiKey();
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Backend request failed:', error);
      return null;
    }
  },

  fmt(value) {
    if (Number.isNaN(value) || value < 0) {
      return '₹0';
    }
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  },

  applyBankRate(type) {
    const select = this.bankSelectors[type];
    const badge = document.getElementById(`${type}-bank-badge`);
    const value = select.value;

    if (value === 'custom') {
      badge.style.display = 'none';
      return;
    }

    const rate = parseFloat(value);
    const option = select.options[select.selectedIndex];
    const bankName = option.getAttribute('data-bank') || option.textContent;
    const range = document.getElementById(`${type}-rate-range`);
    const badgeRate = document.getElementById(`${type}-rate-val`);

    range.value = rate;
    badgeRate.textContent = `${rate.toFixed(2)}%`;
    badge.style.display = 'inline-flex';
    badge.innerHTML = `<span>${bankName}</span><span class="badge-rate">${rate.toFixed(2)}%</span>`;

    this.calculateForPanel(type);
  },

  async calcRD() {
    const monthly = parseFloat(document.getElementById('rd-monthly').value) || 0;
    const annualRate = parseFloat(document.getElementById('rd-rate-range').value) || 0;
    const months = parseInt(document.getElementById('rd-tenure-range').value, 10) || 0;
    const backendResult = await this.requestCalculation('rd', { monthly, annualRate, months });
    const result = backendResult || this.calcRDClient({ monthly, annualRate, months });

    document.getElementById('rd-maturity').textContent = this.fmt(result.maturity);
    document.getElementById('rd-invested-disp').textContent = this.fmt(result.invested);
    document.getElementById('rd-interest-disp').textContent = this.fmt(result.interest);
  },

  calcRDClient({ monthly, annualRate, months }) {
    const rate = annualRate / 400;
    let maturity = 0;

    if (monthly > 0 && months > 0) {
      for (let i = 1; i <= months; i += 1) {
        maturity += monthly * Math.pow(1 + rate, (months - i + 1) / 3);
      }
    }

    const invested = monthly * months;
    const interest = Math.max(0, maturity - invested);

    return { maturity, invested, interest };
  },

  async calcFD() {
    const principal = parseFloat(document.getElementById('fd-principal').value) || 0;
    const annualRate = parseFloat(document.getElementById('fd-rate-range').value) || 0;
    const tenure = parseFloat(document.getElementById('fd-tenure-range').value) || 0;
    const backendResult = await this.requestCalculation('fd', { principal, annualRate, years: tenure });
    const result = backendResult || this.calcFDClient({ principal, annualRate, tenure });

    document.getElementById('fd-maturity').textContent = this.fmt(result.maturity);
    document.getElementById('fd-principal-disp').textContent = this.fmt(result.principal);
    document.getElementById('fd-interest-disp').textContent = this.fmt(result.interest);
  },

  calcFDClient({ principal, annualRate, tenure }) {
    const quarterly = 4;
    const rate = annualRate / 100;
    const maturity = principal > 0 && tenure > 0
      ? principal * Math.pow(1 + rate / quarterly, quarterly * tenure)
      : 0;
    const interest = Math.max(0, maturity - principal);

    return { maturity, principal, interest };
  },

  async calcEMI() {
    const principal = parseFloat(document.getElementById('emi-principal').value) || 0;
    const annualRate = parseFloat(document.getElementById('emi-rate-range').value) || 0;
    const years = parseFloat(document.getElementById('emi-tenure-range').value) || 0;
    const backendResult = await this.requestCalculation('emi', { principal, annualRate, years });
    const result = backendResult || this.calcEMIClient({ principal, annualRate, years });

    document.getElementById('emi-monthly').textContent = this.fmt(result.monthly);
    document.getElementById('emi-principal-disp').textContent = this.fmt(result.principal);
    document.getElementById('emi-interest-disp').textContent = this.fmt(result.interest);
    document.getElementById('emi-total-disp').textContent = this.fmt(result.total);
  },

  calcEMIClient({ principal, annualRate, years }) {
    const monthlyRate = annualRate / 12 / 100;
    const totalMonths = years * 12;
    let emi = 0;

    if (principal > 0 && totalMonths > 0) {
      emi = monthlyRate > 0
        ? (principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
        : principal / totalMonths;
    }

    const total = emi * totalMonths;
    const interest = Math.max(0, total - principal);

    return { monthly: emi, principal, interest, total };
  },

  async calcNW() {
    const assets = parseFloat(document.getElementById('nw-assets').value) || 0;
    const liabilities = parseFloat(document.getElementById('nw-liabilities').value) || 0;
    const backendResult = await this.requestCalculation('nw', { assets, liabilities });
    const result = backendResult || this.calcNWClient({ assets, liabilities });
    const netWorth = result.netWorth;
    const totalEl = document.getElementById('nw-total');

    totalEl.textContent = this.fmt(netWorth);
    totalEl.className = `result-value ${netWorth < 0 ? 'warning' : ''}`.trim();
    document.getElementById('nw-assets-disp').textContent = this.fmt(result.assets);
    document.getElementById('nw-liabilities-disp').textContent = this.fmt(result.liabilities);
  },

  calcNWClient({ assets, liabilities }) {
    const netWorth = assets - liabilities;
    return { netWorth, assets, liabilities };
  },

  switchCalc(event) {
    const selectedTab = event.currentTarget;
    const targetPanel = selectedTab.dataset.tab;

    this.tabButtons.forEach((button) => {
      const isActive = button === selectedTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive);
    });

    this.panels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === targetPanel);
    });
  },

  setupIntersectionObserver() {
    const observerOptions = { threshold: 0.1, rootMargin: '0px' };
    const revealElements = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
      revealElements.forEach((element) => element.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    revealElements.forEach((element) => observer.observe(element));
  }
};

document.addEventListener('DOMContentLoaded', () => project.init());
