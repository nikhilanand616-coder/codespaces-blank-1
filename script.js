const DEFAULT_BACKEND_BASE_URL = (() => {
  const configuredUrl = document.querySelector('meta[name="backend-base-url"]')?.content?.trim();
  if (configuredUrl) return configuredUrl;

  const origin = window.location.origin;
  if (origin && origin !== 'null' && origin.includes(':3000')) {
    return origin;
  }

  return 'http://localhost:3000';
})();
const BACKEND_BASE_URL = DEFAULT_BACKEND_BASE_URL;

const project = {
  async init() {
    this.initSessionState();
    this.hydrateSessionFromUrl();
    if (!this.requireAuth()) return;
    this.cacheElements();
    this.initPreferences();
    this.bindEvents();
    this.loadHistory();
    await this.loadScenarios();
    this.syncAllRanges();
    await this.loadBankRates();
    this.startRatePolling();
    this.calculateAll();
    this.updateSuggestions(this.getSelectedPanelId());
    this.setupIntersectionObserver();
    this.updateShellLinks();
  },

  initSessionState() {
    // Keep key material only in sessionStorage for browser lifetime security.
    const apiKey = sessionStorage.getItem('fincommand_api_key');
    if (!apiKey) {
      sessionStorage.removeItem('fincommand_user_email');
      localStorage.removeItem('fincommand_user_email');
      localStorage.removeItem('fincommand_api_key');
    }
  },

  cacheElements() {
    this.tabButtons = Array.from(document.querySelectorAll('.calc-tab'));
    this.panels = Array.from(document.querySelectorAll('.calc-panel'));
    this.profileLink = document.querySelector('.nav-logo');
    this.logoutButton = document.getElementById('logout-button');
    this.userBadge = document.getElementById('nav-user-display');
    this.subscriptionBadge = document.getElementById('subscription-badge');
    this.themeToggle = document.getElementById('theme-toggle');
    this.currencySelector = document.getElementById('currency-selector');
    this.suggestionList = document.getElementById('ai-suggestion-list');
    this.aiQuestionInput = document.getElementById('ai-question');
    this.aiSubmitButton = document.getElementById('ai-submit');
    this.aiStatusEl = document.getElementById('ai-status');
    this.bankSelectors = {
      rd: document.getElementById('rd-bank'),
      fd: document.getElementById('fd-bank')
    };
    this.bankRateStatusEls = {
      rd: document.getElementById('rd-bank-update'),
      fd: document.getElementById('fd-bank-update')
    };
    this.exportButtons = Array.from(document.querySelectorAll('.export-btn'));
    this.historyCsvButton = document.getElementById('download-history-csv');
    this.historyJsonButton = document.getElementById('download-history-json');
    this.printHistoryButton = document.getElementById('print-history');
    this.clearHistoryButton = document.getElementById('clear-history');
    this.historyTableBody = document.getElementById('history-table-body');
    this.saveScenarioButton = document.getElementById('save-scenario');
    this.savedScenariosEl = document.getElementById('saved-scenarios');
  },

  bindEvents() {
    this.tabButtons.forEach((button) => {
      button.addEventListener('click', (event) => this.switchCalc(event));
    });

    if (this.logoutButton) {
      this.logoutButton.addEventListener('click', () => this.clearSession());
    }

    if (this.userBadge) {
      this.userBadge.addEventListener('click', (event) => {
        if (this.getUserEmail()) {
          event.preventDefault();
          this.clearSession();
        }
      });
    }

    const tierDisplay = document.getElementById('tier-display');
    if (tierDisplay) {
      tierDisplay.addEventListener('click', () => subscriptionModule.openModal());
    }

    document.querySelectorAll('input[type="range"]').forEach((range) => {
      const targetId = range.id.replace('-range', '-val');
      range.addEventListener('input', () => {
        this.updateRangeValue(range, document.getElementById(targetId));
        this.calculateForPanel(range.dataset.panel);
        this.updateSuggestions(this.getSelectedPanelId());
      });
    });

    document.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener('input', () => {
        this.calculateForPanel(input.dataset.panel);
        this.updateSuggestions(this.getSelectedPanelId());
      });
    });

    document.querySelectorAll('#gst-rate, #gst-type').forEach((select) => {
      select.addEventListener('change', () => {
        this.calculateForPanel(select.dataset.panel);
        this.updateSuggestions(this.getSelectedPanelId());
      });
    });

    document.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        this.calculateForPanel(button.dataset.panel);
        this.updateSuggestions(this.getSelectedPanelId());
      });
    });

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    const currencySelector = document.getElementById('currency-selector');
    if (currencySelector) {
      currencySelector.addEventListener('change', (event) => this.setCurrency(event.target.value));
    }

    Object.entries(this.bankSelectors).forEach(([type, select]) => {
      select.addEventListener('change', () => {
        this.applyBankRate(type);
        this.updateSuggestions(this.getSelectedPanelId());
      });
    });

    if (this.profileLink) {
      this.profileLink.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('calculators').scrollIntoView({ behavior: 'smooth' });
      });
    }

    if (this.aiSubmitButton) {
      this.aiSubmitButton.addEventListener('click', () => this.askGemini());
    }

    if (this.aiQuestionInput) {
      this.aiQuestionInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.askGemini();
        }
      });
    }

    this.exportButtons.forEach((button) => {
      button.addEventListener('click', () => this.exportCurrentResult(button.dataset.panel));
    });

    if (this.historyCsvButton) {
      this.historyCsvButton.addEventListener('click', () => this.downloadHistory('csv'));
    }

    if (this.historyJsonButton) {
      this.historyJsonButton.addEventListener('click', () => this.downloadHistory('json'));
    }

    if (this.clearHistoryButton) {
      this.clearHistoryButton.addEventListener('click', () => {
        this.history = [];
        this.persistHistory();
        this.renderHistory();
      });
    }

    if (this.printHistoryButton) this.printHistoryButton.addEventListener('click', () => window.print());

    if (this.saveScenarioButton) this.saveScenarioButton.addEventListener('click', () => this.saveCurrentScenario());
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
      case 'sip':
        await this.calcSIP();
        break;
      case 'emi':
        await this.calcEMI();
        break;
      case 'gst':
        await this.calcGST();
        break;
      case 'nw':
        await this.calcNW();
        break;
      case 'loan':
        await this.calcLoan();
        break;
      case 'ret':
        await this.calcRet();
        break;
      case 'ins':
        await this.calcIns();
        break;
      case 'bud':
        await this.calcBud();
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
      this.calcSIP(),
      this.calcGST(),
      this.calcNW(),
      this.calcLoan(),
      this.calcRet(),
      this.calcIns(),
      this.calcBud()
    ]);
  },

  getApiKey() {
    return sessionStorage.getItem('fincommand_api_key') || '';
  },

  getUserEmail() {
    return sessionStorage.getItem('fincommand_user_email') || '';
  },

  clearSession() {
    sessionStorage.removeItem('fincommand_api_key');
    sessionStorage.removeItem('fincommand_user_email');
    localStorage.removeItem('fincommand_api_key');
    localStorage.removeItem('fincommand_user_email');
    window.location.href = `${BACKEND_BASE_URL}/login.html`;
  },

  showUserStatus() {
    if (this.userBadge) {
      const email = this.getUserEmail();
      const signedIn = Boolean(email);
      const label = signedIn ? 'Logout' : 'Sign In';
      this.userBadge.textContent = label;
      this.userBadge.classList.toggle('logout-link', signedIn);
      if (this.userBadge.tagName === 'A') {
        this.userBadge.href = signedIn ? '#' : `${BACKEND_BASE_URL}/login.html`;
      }
      this.userBadge.style.cursor = signedIn ? 'pointer' : 'default';
      if (signedIn) {
        this.userBadge.addEventListener('click', (event) => {
          event.preventDefault();
          document.getElementById('calculators')?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }

    if (this.logoutButton) {
      this.logoutButton.style.display = this.getApiKey() ? 'inline-flex' : 'none';
      if (this.getApiKey()) {
        this.logoutButton.addEventListener('click', () => this.clearSession());
      }
    }

    if (this.subscriptionBadge) {
      this.subscriptionBadge.textContent = 'Free plan';
    }
  },

  updateShellLinks() {
    const origin = window.location.origin === 'null'
      ? `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`
      : window.location.origin;
    const loginHref = `${origin}/login.html`;
    const savedEmail = this.getUserEmail();
    const authNavLink = document.getElementById('nav-user-display');
    const shareInput = document.getElementById('share-login-url');
    const copyShareLink = document.getElementById('copy-share-link');
    const whatsappShare = document.getElementById('whatsapp-share');
    const telegramShare = document.getElementById('telegram-share');

    if (authNavLink) {
      if (this.getApiKey()) {
        authNavLink.textContent = savedEmail ? `${savedEmail.split('@')[0]}'s Account` : 'Account';
        authNavLink.href = '#';
        authNavLink.classList.remove('logout-link');
        authNavLink.style.cursor = 'pointer';
      } else {
        authNavLink.textContent = 'Sign In';
        authNavLink.href = loginHref;
        authNavLink.classList.remove('logout-link');
        authNavLink.style.cursor = 'default';
      }
    }

    if (shareInput) shareInput.value = loginHref;
    if (whatsappShare) whatsappShare.href = `https://wa.me/?text=${encodeURIComponent(loginHref)}`;
    if (telegramShare) telegramShare.href = `https://t.me/share/url?url=${encodeURIComponent(loginHref)}&text=${encodeURIComponent('Open the FinCommand login page')}`;

    if (copyShareLink) {
      copyShareLink.addEventListener('click', () => {
        if (!shareInput) return;
        shareInput.select();
        document.execCommand('copy');
        copyShareLink.textContent = 'Copied!';
        setTimeout(() => { copyShareLink.textContent = 'Copy link'; }, 1800);
      });
    }
  },

  hydrateSessionFromUrl() {
    // Remove any legacy auth query strings immediately.
    if (window.location.search.includes('apiKey=') || window.location.search.includes('email=')) {
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
    this.setBankRateStatus('rd', data.updatedAt, data.source);
    this.setBankRateStatus('fd', data.updatedAt, data.source);
  },

  setBankRateStatus(type, updatedAt, source = 'local') {
    const statusEl = this.bankRateStatusEls[type];
    if (!statusEl) return;
    const timestamp = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-IN', { hour12: false }) : 'now';
    const sourceLabel = source === 'external' ? 'real provider' : 'local fallback';
    statusEl.textContent = `Live bank rates refreshed at ${timestamp} from ${sourceLabel}. Updates every 15 seconds.`;
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

  populateBankSelector(type, bankGroups) {
    const select = this.bankSelectors[type];
    if (!select) return;

    const previousValue = select.value;
    const previousBankId = select.options[select.selectedIndex]?.getAttribute('data-bank-id');
    const previousBankName = select.options[select.selectedIndex]?.getAttribute('data-bank');

    select.innerHTML = `<option value="custom">-- Enter Custom Rate --</option>`;
    bankGroups.forEach((group) => {
      if (!group || !Array.isArray(group.banks) || group.banks.length === 0) return;

      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;

      group.banks.forEach((bank) => {
        const option = document.createElement('option');
        option.value = bank.rate.toFixed(2);
        option.textContent = `${bank.name} (${bank.rate.toFixed(2)}%)`;
        option.setAttribute('data-bank', bank.name);
        option.setAttribute('data-bank-id', bank.id);
        optgroup.appendChild(option);
      });

      select.appendChild(optgroup);
    });

    const preservedById = previousBankId
      ? Array.from(select.options).find((option) => option.dataset.bankId === previousBankId)
      : null;
    const preservedByName = !preservedById && previousBankName
      ? Array.from(select.options).find((option) => option.dataset.bank === previousBankName)
      : null;

    if (preservedById) {
      preservedById.selected = true;
    } else if (preservedByName) {
      preservedByName.selected = true;
    } else if (previousValue === 'custom') {
      select.value = 'custom';
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

      if (response.status === 403) {
        const data = await response.json();
        if (data.limitReached) {
          subscriptionModule.showLimitReachedNotice(endpoint);
          return null;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Backend request failed:', error);
      return null;
    }
  },

  async authenticatedRequest(path, options = {}) {
    const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.getApiKey(), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  },

  getPanelInputs(panel) {
    const values = {};
    document.querySelectorAll(`[data-panel="${panel}"]`).forEach((element) => {
      if (!element.id || element.type === 'button') return;
      values[element.id] = element.type === 'number' || element.type === 'range' ? Number(element.value) : element.value;
    });
    return values;
  },

  async saveCurrentScenario() {
    const panel = this.getSelectedPanelId();
    const name = window.prompt('Name this scenario:', `${panel.toUpperCase()} plan`);
    if (!name) return;
    try {
      await this.authenticatedRequest('/api/v1/scenarios', { method: 'POST', body: JSON.stringify({ name, calculator: panel, inputs: this.getPanelInputs(panel) }) });
      await this.loadScenarios();
    } catch (error) {
      alert(error.message || 'Could not save scenario.');
    }
  },

  async loadScenarios() {
    if (!this.savedScenariosEl) return;
    try {
      const data = await this.authenticatedRequest('/api/v1/scenarios');
      this.savedScenariosEl.replaceChildren();
      if (!data.scenarios?.length) {
        this.savedScenariosEl.textContent = 'Saved scenarios will appear here.';
        return;
      }
      const title = document.createElement('strong');
      title.textContent = 'Saved scenarios';
      this.savedScenariosEl.appendChild(title);
      data.scenarios.forEach((scenario) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-outline';
        button.textContent = `Load ${scenario.name}`;
        button.addEventListener('click', () => {
          Object.entries(scenario.inputs || {}).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
          });
          this.syncAllRanges();
          this.calculateForPanel(scenario.calculator);
        });
        this.savedScenariosEl.appendChild(button);
      });
    } catch (error) {
      console.warn('Could not load scenarios:', error);
    }
  },

  async requestAIAssistance(question, panel, context) {
    const apiKey = this.getApiKey();
    if (!apiKey || !question) {
      return null;
    }

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ prompt: question, panel, context })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.warn('AI request failed', response.status, errorData);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('AI request failed:', error);
      return null;
    }
  },

  async askGemini() {
    if (!this.aiQuestionInput || !this.aiStatusEl || !this.suggestionList) {
      return;
    }

    const question = this.aiQuestionInput.value.trim();
    if (!question) {
      this.setAiStatus('Type a question for Gemini AI.');
      return;
    }

    const panel = this.getSelectedPanelId().replace('calc-', '');
    const context = this.getAiContext(panel);

    this.setAiLoading(true);
    this.setAiStatus('Gemini is thinking...');

    const response = await this.requestAIAssistance(question, panel, context);
    if (response && response.answer) {
      this.prependAiMessage(response.answer);
      this.setAiStatus(response.provider === 'local' ? 'Local finance assistant response' : 'Gemini AI response');
    } else {
      this.prependAiMessage('Gemini AI could not be reached. Try again later or refine your question.');
      this.setAiStatus('Gemini unavailable');
    }

    this.setAiLoading(false);
  },

  getAiContext(panel) {
    const getValue = (id) => parseFloat(document.getElementById(id)?.value) || 0;

    const details = {
      rd: {
        monthly: getValue('rd-monthly'),
        annualRate: getValue('rd-rate-range'),
        months: getValue('rd-tenure-range')
      },
      fd: {
        principal: getValue('fd-principal'),
        annualRate: getValue('fd-rate-range'),
        years: getValue('fd-tenure-range')
      },
      sip: {
        monthly: getValue('sip-monthly'),
        annualRate: getValue('sip-rate-range'),
        years: getValue('sip-tenure-range')
      },
      emi: {
        principal: getValue('emi-principal'),
        annualRate: getValue('emi-rate-range'),
        years: getValue('emi-tenure-range')
      },
      gst: {
        amount: getValue('gst-amount'),
        rate: getValue('gst-rate'),
        type: document.getElementById('gst-type')?.value || ''
      },
      nw: {
        assets: getValue('nw-assets'),
        liabilities: getValue('nw-liabilities')
      },
      loan: {
        aPrincipal: getValue('loan-a-principal'),
        aRate: getValue('loan-a-rate-range'),
        aYears: getValue('loan-a-tenure-range'),
        bPrincipal: getValue('loan-b-principal'),
        bRate: getValue('loan-b-rate-range'),
        bYears: getValue('loan-b-tenure-range')
      },
      ret: {
        age: getValue('ret-current-age'),
        retirementAge: getValue('ret-retirement-age'),
        savings: getValue('ret-current-savings'),
        contribution: getValue('ret-monthly'),
        returnRate: getValue('ret-rate')
      },
      ins: {
        coverage: getValue('ins-coverage'),
        term: getValue('ins-term'),
        age: getValue('ins-age'),
        healthFactor: parseFloat(document.getElementById('ins-health')?.value) || 1
      },
      bud: {
        income: getValue('bud-income'),
        housing: getValue('bud-housing'),
        food: getValue('bud-food'),
        transport: getValue('bud-transport'),
        other: getValue('bud-other'),
        savingsTarget: getValue('bud-savings-target')
      }
    };

    return details[panel] || {};
  },

  prependAiMessage(text) {
    if (!this.suggestionList || !text) return;
    const messageItem = document.createElement('li');
    messageItem.className = 'ai-answer';
    messageItem.textContent = text;
    this.suggestionList.prepend(messageItem);
  },

  setAiStatus(status) {
    if (!this.aiStatusEl) return;
    this.aiStatusEl.textContent = status;
  },

  setAiLoading(isLoading) {
    if (!this.aiSubmitButton) return;
    this.aiSubmitButton.disabled = isLoading;
    this.aiSubmitButton.textContent = isLoading ? 'Waiting...' : 'Ask Gemini';
  },

  fmt(value) {
    if (Number.isNaN(value) || value < 0) {
      const symbol = this.currencySymbol || '₹';
      return `${symbol}0`;
    }
    const symbol = this.currencySymbol || '₹';
    return `${symbol}${Math.round(value).toLocaleString('en-IN')}`;
  },

  initPreferences() {
    const theme = localStorage.getItem('fincommand_theme') || 'dark';
    const currency = localStorage.getItem('fincommand_currency') || 'INR';
    this.setTheme(theme);
    this.setCurrency(currency);
  },

  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (this.themeToggle) {
      this.themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
    localStorage.setItem('fincommand_theme', theme);
  },

  toggleTheme() {
    const current = document.documentElement.dataset.theme || 'dark';
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  },

  setCurrency(currency) {
    if (!this.currencySelector) return;
    this.currencySelector.value = currency;
    this.currencyCode = currency;
    this.currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₹';
    localStorage.setItem('fincommand_currency', currency);
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
    this.saveHistoryEntry('rd', { monthly, annualRate, months, maturity: result.maturity, invested: result.invested, interest: result.interest });
    this.renderChart('rd', {
      labels: ['Invested', 'Interest', 'Maturity'],
      values: [result.invested, result.interest, result.maturity]
    });
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
    this.saveHistoryEntry('fd', { principal, annualRate, years: tenure, maturity: result.maturity, interest: result.interest });
    this.renderChart('fd', {
      labels: ['Principal', 'Interest', 'Maturity'],
      values: [result.principal, result.interest, result.maturity]
    });
  },

  async calcSIP() {
    const monthly = parseFloat(document.getElementById('sip-monthly').value) || 0;
    const annualRate = parseFloat(document.getElementById('sip-rate-range').value) || 0;
    const years = parseFloat(document.getElementById('sip-tenure-range').value) || 0;
    const result = this.calcSIPClient({ monthly, annualRate, years });

    document.getElementById('sip-maturity').textContent = this.fmt(result.maturity);
    document.getElementById('sip-invested-disp').textContent = this.fmt(result.invested);
    document.getElementById('sip-interest-disp').textContent = this.fmt(result.interest);
    this.saveHistoryEntry('sip', { monthly, annualRate, years, maturity: result.maturity, invested: result.invested, interest: result.interest });
    this.renderChart('sip', {
      labels: ['Invested', 'Interest', 'Maturity'],
      values: [result.invested, result.interest, result.maturity]
    });
  },

  calcSIPClient({ monthly, annualRate, years }) {
    const monthlyRate = annualRate / 12 / 100;
    const totalMonths = years * 12;
    const invested = monthly * totalMonths;
    let maturity = 0;

    if (monthly > 0 && totalMonths > 0) {
      maturity = monthly * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate);
    }

    const interest = Math.max(0, maturity - invested);
    return { maturity, invested, interest };
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
    this.saveHistoryEntry('emi', { principal, annualRate, years, monthly: result.monthly, total: result.total, interest: result.interest });
    this.renderChart('emi', {
      labels: ['Principal', 'Interest', 'EMI Total'],
      values: [result.principal, result.interest, result.total]
    });
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
    this.saveHistoryEntry('nw', { assets: result.assets, liabilities: result.liabilities, netWorth: result.netWorth });
    this.renderChart('nw', {
      labels: ['Assets', 'Liabilities', 'Net Worth'],
      values: [result.assets, result.liabilities, result.netWorth]
    });
  },

  calcNWClient({ assets, liabilities }) {
    const netWorth = assets - liabilities;
    return { netWorth, assets, liabilities };
  },

  async calcLoan() {
    const aPrincipal = parseFloat(document.getElementById('loan-a-principal').value) || 0;
    const aRate = parseFloat(document.getElementById('loan-a-rate-range').value) || 0;
    const aYears = parseFloat(document.getElementById('loan-a-tenure-range').value) || 0;
    const bPrincipal = parseFloat(document.getElementById('loan-b-principal').value) || 0;
    const bRate = parseFloat(document.getElementById('loan-b-rate-range').value) || 0;
    const bYears = parseFloat(document.getElementById('loan-b-tenure-range').value) || 0;

    const aResult = this.calcEMIClient({ principal: aPrincipal, annualRate: aRate, years: aYears });
    const bResult = this.calcEMIClient({ principal: bPrincipal, annualRate: bRate, years: bYears });
    const better = aResult.total <= bResult.total ? 'Loan A' : 'Loan B';

    document.getElementById('loan-a-emi').textContent = this.fmt(aResult.monthly);
    document.getElementById('loan-b-emi').textContent = this.fmt(bResult.monthly);
    document.getElementById('loan-a-interest').textContent = this.fmt(aResult.interest);
    document.getElementById('loan-b-interest').textContent = this.fmt(bResult.interest);
    document.getElementById('loan-best').textContent = better;
    this.saveHistoryEntry('loan', { aPrincipal, aRate, aYears, bPrincipal, bRate, bYears, aMonthly: aResult.monthly, bMonthly: bResult.monthly, aTotalInterest: aResult.interest, bTotalInterest: bResult.interest, better });
    this.renderChart('loan', {
      labels: ['Loan A Total', 'Loan B Total'],
      values: [aResult.total, bResult.total]
    });
  },

  async calcRet() {
    const age = parseFloat(document.getElementById('ret-current-age').value) || 0;
    const retirementAge = parseFloat(document.getElementById('ret-retirement-age').value) || 0;
    const savings = parseFloat(document.getElementById('ret-current-savings').value) || 0;
    const contribution = parseFloat(document.getElementById('ret-monthly').value) || 0;
    const returnRate = parseFloat(document.getElementById('ret-rate').value) || 0;
    const years = Math.max(0, retirementAge - age);
    const monthlyRate = returnRate / 12 / 100;
    const months = years * 12;

    let futureValue = savings;
    for (let i = 0; i < months; i += 1) {
      futureValue = (futureValue + contribution) * (1 + monthlyRate);
    }

    const invested = savings + contribution * months;
    const growth = Math.max(0, futureValue - invested);

    document.getElementById('ret-value').textContent = this.fmt(futureValue);
    document.getElementById('ret-contributions').textContent = this.fmt(invested);
    document.getElementById('ret-growth').textContent = this.fmt(growth);
    this.saveHistoryEntry('ret', { age, retirementAge, savings, contribution, returnRate, futureValue, invested, growth });
    this.renderChart('ret', {
      labels: ['Contributions', 'Growth', 'Future Value'],
      values: [invested, growth, futureValue]
    });
  },

  async calcIns() {
    const coverage = parseFloat(document.getElementById('ins-coverage').value) || 0;
    const term = parseFloat(document.getElementById('ins-term').value) || 0;
    const age = parseFloat(document.getElementById('ins-age').value) || 0;
    const healthFactor = parseFloat(document.getElementById('ins-health').value) || 1;

    const baseRate = 0.02;
    const ageFactor = Math.max(1, (age - 25) / 10);
    const premium = coverage * baseRate * ageFactor * healthFactor / 100;

    document.getElementById('ins-premium').textContent = this.fmt(premium);
    document.getElementById('ins-coverage-disp').textContent = this.fmt(coverage);
    document.getElementById('ins-term-disp').textContent = `${term} years`;
    document.getElementById('ins-health-disp').textContent = document.getElementById('ins-health').selectedOptions[0]?.textContent || 'Good';
    this.saveHistoryEntry('ins', { coverage, term, age, healthFactor, premium });
    this.renderChart('ins', {
      labels: ['Coverage', 'Premium'],
      values: [coverage, premium]
    });
  },

  async calcBud() {
    const income = parseFloat(document.getElementById('bud-income').value) || 0;
    const housing = parseFloat(document.getElementById('bud-housing').value) || 0;
    const food = parseFloat(document.getElementById('bud-food').value) || 0;
    const transport = parseFloat(document.getElementById('bud-transport').value) || 0;
    const other = parseFloat(document.getElementById('bud-other').value) || 0;
    const savingsTarget = parseFloat(document.getElementById('bud-savings-target').value) || 0;

    const expenses = housing + food + transport + other;
    const targetSavings = Math.max(0, Math.min(income, income * (savingsTarget / 100)));
    const surplus = income - expenses - targetSavings;

    document.getElementById('bud-savings').textContent = this.fmt(targetSavings);
    document.getElementById('bud-expenses').textContent = this.fmt(expenses);
    document.getElementById('bud-target').textContent = this.fmt(targetSavings);
    document.getElementById('bud-surplus').textContent = this.fmt(surplus);
    this.saveHistoryEntry('bud', { income, housing, food, transport, other, savingsTarget, expenses, targetSavings, surplus });
    this.renderChart('bud', {
      labels: ['Expenses', 'Savings Target', 'Surplus'],
      values: [expenses, targetSavings, surplus]
    });
  },

  async calcGST() {
    const amount = parseFloat(document.getElementById('gst-amount').value) || 0;
    const rate = parseFloat(document.getElementById('gst-rate').value) || 0;
    const taxType = document.getElementById('gst-type').value;
    const totalTax = amount * rate / 100;
    const splitValue = taxType === 'cgst-sgst' ? totalTax / 2 : totalTax;
    const totalAmount = amount + totalTax;

    document.getElementById('gst-amount-disp').textContent = this.fmt(amount);
    document.getElementById('gst-tax-disp').textContent = this.fmt(totalTax);
    document.getElementById('gst-total-disp').textContent = this.fmt(totalAmount);
    document.getElementById('gst-split-disp').textContent = this.fmt(splitValue);
    document.getElementById('gst-split-label').textContent = taxType === 'cgst-sgst' ? 'CGST / SGST each' : 'IGST';
    this.saveHistoryEntry('gst', {
      amount,
      rate,
      taxType,
      totalTax,
      totalAmount,
      splitValue
    });
    this.renderChart('gst', {
      labels: ['Base', 'Tax', 'Total'],
      values: [amount, totalTax, totalAmount]
    });
  },

  saveHistoryEntry(panel, details) {
    const entry = {
      time: new Date().toISOString(),
      panel,
      label: panel.toUpperCase(),
      details
    };
    this.history = [entry, ...(this.history || [])].slice(0, 20);
    this.persistHistory();
    this.renderHistory();
  },

  renderChart(panel, payload) {
    const container = document.getElementById(`${panel}-chart-panel`);
    if (!container) return;

    const max = Math.max(...payload.values, 1);
    container.innerHTML = `
      <div class="chart-summary">
        ${payload.labels.map((label, index) => `
          <div class="chart-row">
            <div class="chart-row-label">${label}</div>
            <div class="chart-bar-wrap">
              <div class="chart-bar" style="width: ${Math.round((payload.values[index] / max) * 100)}%;"></div>
            </div>
            <div class="chart-row-value">${this.fmt(payload.values[index])}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  loadHistory() {
    try {
      const raw = sessionStorage.getItem('fincommand_history');
      this.history = raw ? JSON.parse(raw) : [];
    } catch (error) {
      this.history = [];
    }
    this.renderHistory();
  },

  persistHistory() {
    try {
      sessionStorage.setItem('fincommand_history', JSON.stringify(this.history || []));
    } catch (error) {
      console.warn('Failed to persist history:', error);
    }
  },

  renderHistory() {
    if (!this.historyTableBody) return;
    if (!this.history || this.history.length === 0) {
      this.historyTableBody.innerHTML = '<tr><td colspan="4">No recent calculations yet. Use the calculators above to generate history.</td></tr>';
      return;
    }

    this.historyTableBody.innerHTML = this.history.map((entry) => {
      const time = this.formatDateTime(entry.time);
      const inputs = Object.entries(entry.details)
        .filter(([key]) => !['maturity', 'interest', 'monthly', 'total', 'totalAmount', 'splitValue', 'taxType'].includes(key) || key === 'taxType')
        .map(([key, value]) => `${key}: ${typeof value === 'number' ? this.fmt(value) : value}`)
        .join(', ');
      const result = Object.entries(entry.details)
        .filter(([key]) => ['maturity', 'interest', 'monthly', 'total', 'totalAmount', 'splitValue'].includes(key))
        .map(([key, value]) => `${key}: ${typeof value === 'number' ? this.fmt(value) : value}`)
        .join(', ');
      return `
        <tr>
          <td>${time}</td>
          <td>${entry.label}</td>
          <td>${inputs}</td>
          <td>${result}</td>
        </tr>
      `;
    }).join('');
  },

  downloadHistory(format) {
    if (!this.history || this.history.length === 0) {
      alert('No history to download yet.');
      return;
    }

    if (format === 'json') {
      const filename = 'fincommand-history.json';
      const content = JSON.stringify(this.history, null, 2);
      this.downloadFile(filename, content, 'application/json');
      return;
    }

    const header = ['Time', 'Calculator', 'Inputs', 'Result'];
    const rows = this.history.map((entry) => {
      const time = this.formatDateTime(entry.time);
      const inputs = Object.entries(entry.details)
        .filter(([key]) => !['maturity', 'interest', 'monthly', 'total', 'totalAmount', 'splitValue', 'taxType'].includes(key) || key === 'taxType')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      const result = Object.entries(entry.details)
        .filter(([key]) => ['maturity', 'interest', 'monthly', 'total', 'totalAmount', 'splitValue'].includes(key))
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      return [time, entry.label, inputs, result].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });

    const content = [header.join(','), ...rows].join('\n');
    this.downloadFile('fincommand-history.csv', content, 'text/csv');
  },

  exportCurrentResult(panel) {
    const payload = this.createExportPayload(panel);
    if (!payload) {
      alert('Unable to export result. Please calculate once before exporting.');
      return;
    }
    const rows = Object.entries(payload.details).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    this.downloadFile(`fincommand-${panel}-result.csv`, ['Field,Value', ...rows].join('\n'), 'text/csv');
    this.saveHistoryEntry(panel, payload.details);
  },

  createExportPayload(panel) {
    const now = new Date().toISOString();
    switch (panel) {
      case 'rd': {
        const monthly = parseFloat(document.getElementById('rd-monthly').value) || 0;
        const annualRate = parseFloat(document.getElementById('rd-rate-range').value) || 0;
        const months = parseInt(document.getElementById('rd-tenure-range').value, 10) || 0;
        const maturity = parseFloat(document.getElementById('rd-maturity').textContent.replace(/[₹,]/g, '')) || 0;
        const invested = parseFloat(document.getElementById('rd-invested-disp').textContent.replace(/[₹,]/g, '')) || 0;
        const interest = parseFloat(document.getElementById('rd-interest-disp').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'rd',
          details: { monthly, annualRate, months, maturity, invested, interest }
        };
      }
      case 'fd': {
        const principal = parseFloat(document.getElementById('fd-principal').value) || 0;
        const annualRate = parseFloat(document.getElementById('fd-rate-range').value) || 0;
        const years = parseFloat(document.getElementById('fd-tenure-range').value) || 0;
        const maturity = parseFloat(document.getElementById('fd-maturity').textContent.replace(/[₹,]/g, '')) || 0;
        const interest = parseFloat(document.getElementById('fd-interest-disp').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'fd',
          details: { principal, annualRate, years, maturity, interest }
        };
      }
      case 'sip': {
        const monthly = parseFloat(document.getElementById('sip-monthly').value) || 0;
        const annualRate = parseFloat(document.getElementById('sip-rate-range').value) || 0;
        const years = parseFloat(document.getElementById('sip-tenure-range').value) || 0;
        const maturity = parseFloat(document.getElementById('sip-maturity').textContent.replace(/[₹,]/g, '')) || 0;
        const invested = parseFloat(document.getElementById('sip-invested-disp').textContent.replace(/[₹,]/g, '')) || 0;
        const interest = parseFloat(document.getElementById('sip-interest-disp').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'sip',
          details: { monthly, annualRate, years, maturity, invested, interest }
        };
      }
      case 'emi': {
        const principal = parseFloat(document.getElementById('emi-principal').value) || 0;
        const annualRate = parseFloat(document.getElementById('emi-rate-range').value) || 0;
        const years = parseFloat(document.getElementById('emi-tenure-range').value) || 0;
        const monthly = parseFloat(document.getElementById('emi-monthly').textContent.replace(/[₹,]/g, '')) || 0;
        const total = parseFloat(document.getElementById('emi-total-disp').textContent.replace(/[₹,]/g, '')) || 0;
        const interest = parseFloat(document.getElementById('emi-interest-disp').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'emi',
          details: { principal, annualRate, years, monthly, total, interest }
        };
      }
      case 'gst': {
        const amount = parseFloat(document.getElementById('gst-amount').value) || 0;
        const rate = parseFloat(document.getElementById('gst-rate').value) || 0;
        const taxType = document.getElementById('gst-type').value;
        const totalTax = parseFloat(document.getElementById('gst-tax-disp').textContent.replace(/[₹,]/g, '')) || 0;
        const totalAmount = parseFloat(document.getElementById('gst-total-disp').textContent.replace(/[₹,]/g, '')) || 0;
        const splitValue = parseFloat(document.getElementById('gst-split-disp').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'gst',
          details: { amount, rate, taxType, totalTax, totalAmount, splitValue }
        };
      }
      case 'nw': {
        const assets = parseFloat(document.getElementById('nw-assets').value) || 0;
        const liabilities = parseFloat(document.getElementById('nw-liabilities').value) || 0;
        const netWorth = parseFloat(document.getElementById('nw-total').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'nw',
          details: { assets, liabilities, netWorth }
        };
      }
      case 'loan': {
        const aPrincipal = parseFloat(document.getElementById('loan-a-principal').value) || 0;
        const aRate = parseFloat(document.getElementById('loan-a-rate-range').value) || 0;
        const aYears = parseFloat(document.getElementById('loan-a-tenure-range').value) || 0;
        const bPrincipal = parseFloat(document.getElementById('loan-b-principal').value) || 0;
        const bRate = parseFloat(document.getElementById('loan-b-rate-range').value) || 0;
        const bYears = parseFloat(document.getElementById('loan-b-tenure-range').value) || 0;
        const aMonthly = parseFloat(document.getElementById('loan-a-emi').textContent.replace(/[₹,]/g, '')) || 0;
        const bMonthly = parseFloat(document.getElementById('loan-b-emi').textContent.replace(/[₹,]/g, '')) || 0;
        const aInterest = parseFloat(document.getElementById('loan-a-interest').textContent.replace(/[₹,]/g, '')) || 0;
        const bInterest = parseFloat(document.getElementById('loan-b-interest').textContent.replace(/[₹,]/g, '')) || 0;
        const better = document.getElementById('loan-best')?.textContent || '';
        return {
          time: now,
          panel: 'loan',
          details: { aPrincipal, aRate, aYears, bPrincipal, bRate, bYears, aMonthly, bMonthly, aInterest, bInterest, better }
        };
      }
      case 'ret': {
        const age = parseFloat(document.getElementById('ret-current-age').value) || 0;
        const retirementAge = parseFloat(document.getElementById('ret-retirement-age').value) || 0;
        const savings = parseFloat(document.getElementById('ret-current-savings').value) || 0;
        const contribution = parseFloat(document.getElementById('ret-monthly').value) || 0;
        const returnRate = parseFloat(document.getElementById('ret-rate').value) || 0;
        const futureValue = parseFloat(document.getElementById('ret-value').textContent.replace(/[₹,]/g, '')) || 0;
        const invested = parseFloat(document.getElementById('ret-contributions').textContent.replace(/[₹,]/g, '')) || 0;
        const growth = parseFloat(document.getElementById('ret-growth').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'ret',
          details: { age, retirementAge, savings, contribution, returnRate, futureValue, invested, growth }
        };
      }
      case 'ins': {
        const coverage = parseFloat(document.getElementById('ins-coverage').value) || 0;
        const term = parseFloat(document.getElementById('ins-term').value) || 0;
        const age = parseFloat(document.getElementById('ins-age').value) || 0;
        const healthFactor = parseFloat(document.getElementById('ins-health').value) || 1;
        const premium = parseFloat(document.getElementById('ins-premium').textContent.replace(/[₹,]/g, '')) || 0;
        const healthLabel = document.getElementById('ins-health').selectedOptions[0]?.textContent || 'Good';
        return {
          time: now,
          panel: 'ins',
          details: { coverage, term, age, healthFactor, healthLabel, premium }
        };
      }
      case 'bud': {
        const income = parseFloat(document.getElementById('bud-income').value) || 0;
        const housing = parseFloat(document.getElementById('bud-housing').value) || 0;
        const food = parseFloat(document.getElementById('bud-food').value) || 0;
        const transport = parseFloat(document.getElementById('bud-transport').value) || 0;
        const other = parseFloat(document.getElementById('bud-other').value) || 0;
        const savingsTarget = parseFloat(document.getElementById('bud-savings-target').value) || 0;
        const expenses = parseFloat(document.getElementById('bud-expenses').textContent.replace(/[₹,]/g, '')) || 0;
        const targetSavings = parseFloat(document.getElementById('bud-target').textContent.replace(/[₹,]/g, '')) || 0;
        const surplus = parseFloat(document.getElementById('bud-surplus').textContent.replace(/[₹,]/g, '')) || 0;
        return {
          time: now,
          panel: 'bud',
          details: { income, housing, food, transport, other, savingsTarget, expenses, targetSavings, surplus }
        };
      }
      default:
        return null;
    }
  },

  formatDateTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-IN', { hour12: false });
  },

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  getSelectedPanelId() {
    const activeTab = document.querySelector('.calc-tab.active');
    return activeTab ? activeTab.dataset.tab : 'calc-rd';
  },

  updateSuggestions(panelId) {
    if (!this.suggestionList) return;
    const suggestions = [];
    const panelKey = panelId.replace('calc-', '');

    const getNumber = (id) => parseFloat(document.getElementById(id)?.value) || 0;

    const workContext = {
      rd: 'abhi RD pe kaam kar raha hai',
      fd: 'abhi FD option dekh raha hai',
      sip: 'abhi SIP plan bana raha hai',
      emi: 'abhi EMI aur loan ka hisaab kar raha hai',
      gst: 'abhi GST calculation kar raha hai',
      nw: 'abhi apni net worth check kar raha hai'
    };

    suggestions.push(`Yaar, ${workContext[panelKey] || 'tu apne finances pe kaam kar raha hai'}.`);

    switch (panelKey) {
      case 'rd': {
        const monthly = getNumber('rd-monthly');
        const rate = getNumber('rd-rate-range');
        const years = getNumber('rd-tenure-range');
        suggestions.push('RD se discipline bhi aata hai aur paise safe bhi rehte hain. Chill, steady growth hai.');
        if (monthly < 5000) {
          suggestions.push('Bro, agar monthly thoda bada de sakta hai toh maturity achhi ho jayegi.');
        }
        if (rate < 7) {
          suggestions.push('Ye rate thoda soft hai — high-yield banks check kar le kabhi.');
        }
        suggestions.push(`₹${monthly.toLocaleString()} per month at ${rate.toFixed(2)}% for ${years} months will give you a nice nest egg.`);
        break;
      }
      case 'fd': {
        const principal = getNumber('fd-principal');
        const rate = getNumber('fd-rate-range');
        const years = getNumber('fd-tenure-range');
        suggestions.push('FD safe khel hai, especially agar paise long-term lock karne hain. Best for stress-free returns.');
        if (principal >= 500000) {
          suggestions.push('Bhai, agar amount zyada hai toh laddering kar le, liquidity bhi rahegi.');
        }
        if (rate >= 8) {
          suggestions.push('Rate 8% ya upar achha hai — agar paise chahiye nahi toh lock kar de.');
        }
        suggestions.push(`₹${principal.toLocaleString()} at ${rate.toFixed(2)}% for ${years} years will give steady growth.`);
        break;
      }
      case 'sip': {
        const monthly = getNumber('sip-monthly');
        const rate = getNumber('sip-rate-range');
        const years = getNumber('sip-tenure-range');
        suggestions.push('SIP se long-term wealth build hoti hai. Yeh best hai patience aur discipline ke liye.');
        if (monthly < 5000) {
          suggestions.push('Chota contribution bhi sahi hai, par agar aur de sake toh compounding aur tez chalega.');
        }
        if (rate < 10) {
          suggestions.push('Rate thoda low lag raha hai — agar tum risk le sakte ho toh higher expected return choose kar.');
        }
        suggestions.push(`₹${monthly.toLocaleString()} monthly for ${years} years means chhota investment, bada result over time.`);
        break;
      }
      case 'emi': {
        const principal = getNumber('emi-principal');
        const rate = getNumber('emi-rate-range');
        const years = getNumber('emi-tenure-range');
        suggestions.push('EMI dekh raha hai? Sahi hai, loan cost pe dhyan zaroor de.');
        if (rate > 10) {
          suggestions.push('Rate jyada hai toh negotiate karne ki koshish kar ya short tenure pe soche.');
        }
        if (years > 15) {
          suggestions.push('Jyada tenure se monthly EMI kam hai par total interest zyada padta hai. Balance theek rakh.');
        }
        suggestions.push(`₹${principal.toLocaleString()} loan at ${rate.toFixed(2)}% for ${years} years — dekh le kitna interest ja raha hai.`);
        break;
      }
      case 'gst': {
        const amount = getNumber('gst-amount');
        const rate = getNumber('gst-rate');
        suggestions.push('GST ka calculation kar raha hai? Smart, expense aur invoice dono ke liye useful hai.');
        if (amount > 100000) {
          suggestions.push('Agar amount ₹1,00,000 se zyada hai toh registration aur input credit bhi check kar le.');
        }
        suggestions.push(`₹${amount.toLocaleString()} pe ${rate.toFixed(2)}% GST means ₹${(amount * rate / 100).toFixed(2)} tax.`);
        break;
      }
      case 'nw': {
        const assets = getNumber('nw-assets');
        const liabilities = getNumber('nw-liabilities');
        const netWorth = assets - liabilities;
        suggestions.push('Net worth check karna mast habit hai. Proof of progress milta hai isse.');
        if (netWorth < 0) {
          suggestions.push('Negative net worth hai? No worries, pehle debt kam kar aur emergency fund banao.');
        } else {
          suggestions.push('Positive hai? Waah! Ab assets ko grow kar aur liabilities ko dheere-dheere ghatate reh.');
        }
        suggestions.push(`Current net worth ${this.fmt(netWorth)} — aage badhne ka track rakh.`);
        break;
      }
      case 'loan': {
        const aPrincipal = getNumber('loan-a-principal');
        const aRate = getNumber('loan-a-rate-range');
        const aYears = getNumber('loan-a-tenure-range');
        const bPrincipal = getNumber('loan-b-principal');
        const bRate = getNumber('loan-b-rate-range');
        const bYears = getNumber('loan-b-tenure-range');
        suggestions.push('Loan comparison karna smart move hai. Total cost kam rakhna zaroori hai.');
        if (aRate !== bRate) {
          suggestions.push('Zyada interest waale loan se jaldi chhutkara paana best hota hai.');
        }
        suggestions.push(`Loan A: ${this.fmt(aPrincipal)} at ${aRate.toFixed(2)}% for ${aYears} years. Loan B: ${this.fmt(bPrincipal)} at ${bRate.toFixed(2)}% for ${bYears} years.`);
        break;
      }
      case 'ret': {
        const age = getNumber('ret-current-age');
        const retirementAge = getNumber('ret-retirement-age');
        const savings = getNumber('ret-current-savings');
        const contribution = getNumber('ret-monthly');
        const returnRate = getNumber('ret-rate');
        const years = Math.max(0, retirementAge - age);
        suggestions.push('Retirement planning early start karne se future secure ho jata hai.');
        if (years > 20) {
          suggestions.push('Long horizon hai — compounding aapke dost hain, continue karte reh.');
        }
        suggestions.push(`₹${savings.toLocaleString()} savings and ₹${contribution.toLocaleString()} monthly at ${returnRate.toFixed(2)}% for ${years} years will compound well.`);
        break;
      }
      case 'ins': {
        const coverage = getNumber('ins-coverage');
        const age = getNumber('ins-age');
        const healthFactor = parseFloat(document.getElementById('ins-health')?.value) || 1;
        suggestions.push('Insurance calculator se coverage achhi tarah plan ho sakti hai.');
        if (age > 40) {
          suggestions.push('Age badhne par premium thoda zyada ho sakta hai, isliye aaj se plan karna accha hai.');
        }
        suggestions.push(`Coverage ${this.fmt(coverage)} with factor ${healthFactor.toFixed(2)} gives a rough premium estimate.`);
        break;
      }
      case 'bud': {
        const income = getNumber('bud-income');
        const expenses = getNumber('bud-housing') + getNumber('bud-food') + getNumber('bud-transport') + getNumber('bud-other');
        const savingsTarget = getNumber('bud-savings-target');
        suggestions.push('Budget banana simple hai par discipline se follow karna important hai.');
        if (expenses > income * 0.7) {
          suggestions.push('Expenses high hain — housing aur discretionary spending pe nazar rakho.');
        }
        suggestions.push(`Income ${this.fmt(income)}, expenses ${this.fmt(expenses)}, target savings ${savingsTarget.toFixed(0)}%.`);
        break;
      }
      default:
        suggestions.push('Arre, calculator select kar le aur Gemini tujhe sahi advice dega.');
    }

    this.suggestionList.innerHTML = suggestions
      .filter(Boolean)
      .map((text) => `<li>${text}</li>`)
      .join('');
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

    this.updateSuggestions(targetPanel);
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
