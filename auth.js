const DEFAULT_BACKEND_BASE_URL = (() => {
  const configuredUrl = document.querySelector('meta[name="backend-base-url"]')?.content?.trim();
  if (configuredUrl) return configuredUrl;

  const origin = window.location.origin;
  // The login page is often previewed from VS Code Live Server or opened as a
  // file. In those cases its origin is *not* the API server, so always use
  // FinCommand's local server unless the page itself is already on port 3000.
  if (origin && origin !== 'null' && /:(3000)$/.test(origin)) {
    return origin;
  }

  return 'http://localhost:3000';
})();
const BACKEND_BASE_URL = DEFAULT_BACKEND_BASE_URL;

const auth = {
  normalizePassword(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim() : '';
  },
  init() {
    this.cacheElements();
    this.prefillRememberedEmail();
    this.bindEvents();
  },

  cacheElements() {
    this.tabs = Array.from(document.querySelectorAll('.auth-tab'));
    this.loginForm = document.getElementById('login-form');
    this.registerForm = document.getElementById('register-form');
    this.resetForm = document.getElementById('reset-form');
    this.messageEl = document.getElementById('auth-message');
    this.rememberMeCheckbox = document.getElementById('remember-me');
    this.passwordStrengthEl = document.getElementById('password-strength');
    this.registerPasswordInput = document.getElementById('register-password');
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

    if (this.registerPasswordInput) {
      this.registerPasswordInput.addEventListener('input', () => this.updatePasswordStrength());
    }

    document.getElementById('show-reset').addEventListener('click', () => this.switchTab('reset'));
    document.getElementById('back-to-login').addEventListener('click', () => this.switchTab('login'));
    document.getElementById('request-reset').addEventListener('click', () => this.requestPasswordReset());
    this.resetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.confirmPasswordReset();
    });
    this.initializeGoogleSignIn();
  },

  switchTab(formName) {
    this.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.form === formName);
    });

    this.loginForm.classList.toggle('active', formName === 'login');
    this.registerForm.classList.toggle('active', formName === 'register');
    this.resetForm.classList.toggle('active', formName === 'reset');
    this.setMessage('');
  },

  setMessage(message, type = 'default') {
    this.messageEl.textContent = message;
    this.messageEl.className = `auth-message ${type}`.trim();
  },

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    // Keep login behavior consistent with registration and password reset so
    // copied passwords with harmless surrounding whitespace do not fail.
    const password = this.normalizePassword(document.getElementById('login-password').value);

    if (!email || !password) {
      this.setMessage('Please enter both email and password.', 'warning');
      return;
    }

    const rememberMe = Boolean(this.rememberMeCheckbox?.checked);
    let response = await this.sendRequest('/api/v1/login', { email, password, rememberMe });
    if (!response) {
      this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
      return;
    }

    if (response?.requiresOtp) {
      const otp = window.prompt(response.devOtp ? `Development OTP: ${response.devOtp}` : 'Enter the one-time verification code sent to you.');
      if (!otp) return;
      response = await this.sendRequest('/api/v1/login', { email, password, rememberMe, otp });
    }
    if (response?.error) {
      this.setMessage(response.error, 'warning');
      return;
    }

    this.saveSession(response.email, response.apiKey, rememberMe, response.refreshToken);
    window.location.href = `${BACKEND_BASE_URL}/FinCommands.html`;
  },

  async handleRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = this.normalizePassword(document.getElementById('register-password').value);
    const confirm = this.normalizePassword(document.getElementById('register-confirm').value);

    if (!email || !password || !confirm) {
      this.setMessage('Please complete all fields.', 'warning');
      return;
    }

    if (password !== confirm) {
      this.setMessage('Passwords do not match.', 'warning');
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

    this.saveSession(response.email, response.apiKey, false);
    if (response.verificationToken) this.setMessage(`Account created. Development verification code: ${response.verificationToken}`, 'success');
    window.location.href = `${BACKEND_BASE_URL}/FinCommands.html`;
  },

  async sendRequest(path, payload) {
    // The folder-open launcher can expose the page just before the API accepts
    // its first request. Retry a transient connection failure before reporting
    // that the server is unavailable.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
          ? await response.json()
          : { error: `Server returned ${response.status} ${response.statusText}` };

        return body;
      } catch (error) {
        if (attempt === 2) {
          console.error('Auth request failed:', error);
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    return null;
  },

  async requestPasswordReset() {
    const email = document.getElementById('reset-email').value.trim();
    const response = await this.sendRequest('/api/v1/password-reset/request', { email });
    if (!response) return this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
    if (response.error) return this.setMessage(response.error, 'warning');
    document.getElementById('reset-confirm-fields').hidden = false;
    if (response.resetToken) document.getElementById('reset-token').value = response.resetToken;
    this.setMessage(response.message, 'success');
  },

  async confirmPasswordReset() {
    const response = await this.sendRequest('/api/v1/password-reset/confirm', {
      email: document.getElementById('reset-email').value.trim(),
      token: document.getElementById('reset-token').value.trim(),
      password: this.normalizePassword(document.getElementById('reset-password').value)
    });
    if (!response) return this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
    if (response.error) return this.setMessage(response.error, 'warning');
    this.switchTab('login');
    this.setMessage(response.message, 'success');
  },

  async initializeGoogleSignIn() {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/auth-config`);
      const config = await response.json();
      if (!config.googleClientId) {
        document.getElementById('google-unavailable').hidden = false;
        return;
      }
      const waitForGoogle = () => {
        if (!window.google?.accounts?.id) return window.setTimeout(waitForGoogle, 100);
        window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: (credential) => this.handleGoogleLogin(credential) });
        window.google.accounts.id.renderButton(document.getElementById('google-signin'), { theme: 'outline', size: 'large', width: 360, text: 'signin_with' });
      };
      waitForGoogle();
    } catch (error) {
      console.warn('Google sign-in configuration unavailable:', error);
    }
  },

  async handleGoogleLogin(credential) {
    const response = await this.sendRequest('/api/v1/google-login', credential);
    if (!response) return this.setMessage('Unable to reach server. Make sure the backend is running.', 'warning');
    if (response.error) return this.setMessage(response.error, 'warning');
    this.saveSession(response.email, response.apiKey);
    window.location.href = `${BACKEND_BASE_URL}/FinCommands.html`;
  },

  saveSession(email, apiKey, rememberEmail = false, refreshToken = null) {
    sessionStorage.setItem('fincommand_user_email', email);
    sessionStorage.setItem('fincommand_api_key', apiKey);
    if (rememberEmail) {
      localStorage.setItem('fincommand_user_email', email);
      if (refreshToken) localStorage.setItem('fincommand_refresh_token', refreshToken);
    } else {
      localStorage.removeItem('fincommand_user_email');
      localStorage.removeItem('fincommand_refresh_token');
    }
  },

  prefillRememberedEmail() {
    const remembered = localStorage.getItem('fincommand_user_email');
    if (remembered) {
      const emailInput = document.getElementById('login-email');
      if (emailInput) emailInput.value = remembered;
      if (this.rememberMeCheckbox) this.rememberMeCheckbox.checked = true;
    }
  },

  updatePasswordStrength() {
    if (!this.passwordStrengthEl || !this.registerPasswordInput) return;
    const password = this.registerPasswordInput.value;
    let score = 0;
    if (password.length >= 10) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    const strength = score <= 2 ? 'Weak' : score === 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';
    const color = score <= 2 ? '#ff6b6b' : score === 3 ? '#ffd166' : score === 4 ? '#7cf2ff' : '#59ffb2';
    this.passwordStrengthEl.innerHTML = `Password strength: <strong style="color: ${color};">${strength}</strong>`;
  }
};

document.addEventListener('DOMContentLoaded', () => auth.init());
