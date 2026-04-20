const BACKEND_BASE_URL = 'http://localhost:3000';

const auth = {
  init() {
    this.cacheElements();
    this.bindEvents();
  },

  cacheElements() {
    this.tabs = Array.from(document.querySelectorAll('.auth-tab'));
    this.loginForm = document.getElementById('login-form');
    this.registerForm = document.getElementById('register-form');
    this.messageEl = document.getElementById('auth-message');
  },

  bindEvents() {
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.form));
    });

    this.loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleLogin();
    });

    this.registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleRegister();
    });
  },

  switchTab(formName) {
    this.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.form === formName);
    });

    this.loginForm.classList.toggle('active', formName === 'login');
    this.registerForm.classList.toggle('active', formName === 'register');
    this.setMessage('');
  },

  setMessage(message, type = 'default') {
    this.messageEl.textContent = message;
    this.messageEl.className = `auth-message ${type}`.trim();
  },

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      this.setMessage('Please enter both email and password.', 'warning');
      return;
    }

    const response = await this.sendRequest('/api/v1/login', { email, password });
    if (!response) {
      this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
      return;
    }

    if (response.error) {
      this.setMessage(response.error, 'warning');
      return;
    }

    this.saveSession(response.email, response.apiKey);
    window.location.href = `${BACKEND_BASE_URL}/FinCommands.html?email=${encodeURIComponent(response.email)}&apiKey=${encodeURIComponent(response.apiKey)}`;
  },

  async handleRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (!email || !password || !confirm) {
      this.setMessage('Please complete all fields.', 'warning');
      return;
    }

    if (password !== confirm) {
      this.setMessage('Passwords do not match.', 'warning');
      return;
    }

    if (password.length < 8) {
      this.setMessage('Password must be at least 8 characters long.', 'warning');
      return;
    }

    const response = await this.sendRequest('/api/v1/register', { email, password });
    if (!response) {
      this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
      return;
    }

    if (response.error) {
      this.setMessage(response.error, 'warning');
      return;
    }

    this.saveSession(response.email, response.apiKey);
    window.location.href = `${BACKEND_BASE_URL}/FinCommands.html?email=${encodeURIComponent(response.email)}&apiKey=${encodeURIComponent(response.apiKey)}`;
  },

  async sendRequest(path, payload) {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('Auth request failed:', error);
      return null;
    }
  },

  saveSession(email, apiKey) {
    localStorage.setItem('fincommand_user_email', email);
    localStorage.setItem('fincommand_api_key', apiKey);
  }
};

document.addEventListener('DOMContentLoaded', () => auth.init());
