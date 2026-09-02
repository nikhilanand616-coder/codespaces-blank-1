// Subscription and pricing module for frontend
const subscriptionModule = {
  currentTier: 'FREE',
  tierInfo: null,
  
  async init() {
    this.cacheElements();
    await this.loadSubscriptionInfo();
    this.bindEvents();
  },

  cacheElements() {
    this.modal = document.getElementById('subscription-modal');
    this.closeBtn = document.getElementById('subscription-close');
    this.upgradeButtons = Array.from(document.querySelectorAll('.upgrade-btn'));
    this.premiumButtons = Array.from(document.querySelectorAll('.premium-cta'));
    this.tierDisplay = document.getElementById('tier-display');
    this.subscriptionBadge = document.getElementById('subscription-badge');
  },

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    this.upgradeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tier = e.target.dataset.tier;
        this.showUpgradeConfirm(tier);
      });
    });

    this.premiumButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tier = e.target.dataset.tier;
        this.showUpgradeConfirm(tier);
      });
    });

    // Payment modal events
    const paymentCloseBtn = document.getElementById('payment-close');
    if (paymentCloseBtn) {
      paymentCloseBtn.addEventListener('click', () => this.closePaymentModal());
    }

    // Payment method tabs
    const methodTabs = document.querySelectorAll('.payment-method-tab');
    methodTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const method = e.target.dataset.method;
        this.switchPaymentMethod(method);
      });
    });

    // Card payment
    const paymentSubmitCard = document.getElementById('payment-submit-card');
    if (paymentSubmitCard) {
      paymentSubmitCard.addEventListener('click', () => this.performCardPayment());
    }

    // UPI payment
    const paymentSubmitUpi = document.getElementById('payment-submit-upi');
    if (paymentSubmitUpi) {
      paymentSubmitUpi.addEventListener('click', () => this.performUpiPayment());
    }

    // Card input formatting
    const cardNumberInput = document.getElementById('card-number');
    if (cardNumberInput) {
      cardNumberInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
      });
    }

    const cardExpiryInput = document.getElementById('card-expiry');
    if (cardExpiryInput) {
      cardExpiryInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d{2})/, '$1/$2');
      });
    }

    // Close on backdrop click
    window.addEventListener('click', (e) => {
      const paymentModal = document.getElementById('payment-modal');
      if (e.target === this.modal) {
        this.closeModal();
      }
      if (e.target === paymentModal) {
        this.closePaymentModal();
      }
    });
  },

  async loadSubscriptionInfo() {
    const apiKey = sessionStorage.getItem('fincommand_api_key');
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/profile`, {
        headers: { 'x-api-key': apiKey }
      });
      const data = await response.json();
      this.currentTier = data.tier;
      this.tierInfo = data.tierInfo;
      this.updateDisplay();
    } catch (error) {
      console.error('Failed to load subscription info:', error);
    }
  },

  updateDisplay() {
    if (this.tierDisplay) {
      const tierName = this.tierInfo?.name || 'Free';
      this.tierDisplay.textContent = tierName === 'Free' ? 'Free • Upgrade' : `${tierName} • Manage`;
      this.tierDisplay.className = `nav-cta secondary-cta tier-badge tier-${String(this.currentTier || '').toLowerCase()}`;
    }

    if (this.subscriptionBadge) {
      this.subscriptionBadge.innerHTML = this.getBadgeHTML();
    }
  },

  getBadgeHTML() {
    const defaultFreeFeatures = {
      rd: { limit: -1 },
      fd: { limit: -1 },
      emi: { limit: -1 },
      nw: { limit: -1 },
      export: false,
      advancedCharts: false,
      prioritySupport: false,
      historicalRates: false
    };

    const { name, cost, features } = this.tierInfo || { name: 'Free', features: defaultFreeFeatures };
    const featureCount = Object.values(features || defaultFreeFeatures).filter(f => f !== false).length;
    return `<span class="badge-tier">${name}</span><span class="badge-features">${featureCount} features</span>`;
  },

  showUpgradeConfirm(newTier) {
    if (newTier === this.currentTier) {
      alert('You are already on this plan');
      return;
    }

    this.selectedTierForPayment = newTier;
    this.showPaymentModal(newTier);
  },

  showPaymentModal(newTier) {
    const amount = newTier === 'PRO' ? 99 : 299;
    const tierName = newTier === 'PRO' ? 'Pro' : 'Pro Plus';
    const paymentModal = document.getElementById('payment-modal');
    
    if (!paymentModal) {
      alert('Payment system unavailable');
      return;
    }

    document.getElementById('payment-tier-name').textContent = tierName;
    document.getElementById('payment-amount').textContent = amount;
    document.getElementById('payment-description').textContent = newTier === 'PRO' 
      ? 'Export, historical data, and advanced analytics'
      : 'Everything in Pro + priority support and API access';
    
    paymentModal.style.display = 'flex';
  },

  switchPaymentMethod(method) {
    // Update tab styles
    const tabs = document.querySelectorAll('.payment-method-tab');
    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.method === method);
    });

    // Toggle forms
    const cardForm = document.getElementById('payment-form-card');
    const upiForm = document.getElementById('payment-form-upi');
    if (cardForm && upiForm) {
      cardForm.style.display = method === 'card' ? 'flex' : 'none';
      upiForm.style.display = method === 'upi' ? 'flex' : 'none';
    }
  },

  async performCardPayment() {
    const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
    const expiry = document.getElementById('card-expiry').value;
    const cvv = document.getElementById('card-cvv').value;

    if (!this.validateCardDetails(cardNumber, expiry, cvv)) {
      alert('❌ Invalid card details. Please check:\n• Card number: 16 digits\n• Expiry: MM/YY format\n• CVV: 3-4 digits');
      return;
    }

    const paymentModal = document.getElementById('payment-modal');
    const submitBtn = document.getElementById('payment-submit-card');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing Payment...';

    try {
      const apiKey = sessionStorage.getItem('fincommand_api_key');
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          tier: this.selectedTierForPayment,
          amount: this.selectedTierForPayment === 'PRO' ? 99 : 299,
          paymentMethod: 'card',
          lastFourDigits: cardNumber.slice(-4)
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        this.currentTier = data.tier;
        this.tierInfo = data.tierInfo;
        this.updateDisplay();
        
        paymentModal.style.display = 'none';
        this.closeModal();
        alert(`✅ Payment successful! You've been upgraded to ${data.tier}!\n\nPayment ID: ${data.paymentId}`);
        this.resetCardForm();
      } else {
        alert(`❌ Payment failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('❌ Payment processing error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Complete Payment';
    }
  },

  async performUpiPayment() {
    const submitBtn = document.getElementById('payment-submit-upi');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Processing...';

    // Store reference to 'this' for use in async callbacks
    const self = this;
    const selectedProvider = 'googlepay'; // Default provider matches backend validation
    const upiId = ''; // Optional - user can select in Razorpay

    try {
      const amount = this.selectedTierForPayment === 'PRO' ? 99 : 299;

      // Create Razorpay order
      const apiKey = sessionStorage.getItem('fincommand_api_key');
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/process-upi-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          tier: this.selectedTierForPayment,
          amount: amount,
          paymentMethod: 'upi',
          upiProvider: selectedProvider,
          upiId: upiId
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.simulate || !data.orderId) {
          submitBtn.disabled = false;
          submitBtn.textContent = '✓ Proceed with UPI Payment';
          alert('✅ UPI payment order simulated successfully. The payment gateway is not configured for live checkout in this environment.');
          self.handlePaymentSuccess({ razorpay_payment_id: 'SIMULATED' }, data.tier);
          return;
        }

        // Validate Razorpay is loaded
        if (typeof Razorpay === 'undefined') {
          alert('❌ Payment gateway not loaded. Please check your internet connection and refresh the page.');
          submitBtn.disabled = false;
          submitBtn.textContent = '✓ Proceed with UPI Payment';
          return;
        }

        // Close our modal before opening Razorpay
        self.closePaymentModal();

        // Initialize Razorpay checkout
        const options = {
          key: data.razorpayKeyId,
          amount: data.amount,
          currency: data.currency,
          order_id: data.orderId,
          name: 'FinCommand',
          description: `Upgrade to ${data.tier} Plan`,
          image: '/favicon.ico',
          handler: function(razorpayResponse) {
            // Payment successful
            console.log('Payment successful:', razorpayResponse);
            self.handlePaymentSuccess(razorpayResponse, data.tier);
          },
          prefill: {
            email: '',
            contact: ''
          },
          notes: {
            tier: data.tier,
            upi_provider: selectedProvider,
            upi_id: upiId
          },
          theme: {
            color: '#2563eb'
          },
          method: {
            upi: {
              flow: 'collect',
              apps: ['googlepay', 'phonepe', 'paytm', 'bhim', 'amazonpay']
            },
            qr: {
              show: true
            }
          },
          modal: {
            ondismiss: function() {
              console.log('Payment modal dismissed');
              submitBtn.disabled = false;
              submitBtn.textContent = '✓ Proceed with UPI Payment';
            },
            confirm_close: true,
            animation: true
          },
          retry: {
            enabled: false
          },
          timeout: 300,
          remember_customer: false
        };

        const rzp = new Razorpay(options);

        rzp.on('payment.failed', function(response) {
          console.error('Payment failed:', response.error);
          alert(`❌ Payment failed: ${response.error.description}`);
          submitBtn.disabled = false;
          submitBtn.textContent = '✓ Proceed with UPI Payment';
        });

        // Open Razorpay checkout
        console.log('Opening Razorpay checkout with options:', options);
        rzp.open();

      } else {
        const errorMessage = data.error || data.message || 'Unable to create payment order';
        alert(`❌ UPI payment failed: ${errorMessage}`);
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Proceed with UPI Payment';
      }
    } catch (error) {
      console.error('UPI payment error:', error);
      alert('❌ UPI payment processing error. Please try again: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Proceed with UPI Payment';
    }
  },

  handlePaymentSuccess(razorpayResponse, tier) {
    console.log('Payment completed successfully:', razorpayResponse);

    // Close payment modal
    this.closePaymentModal();

    // Reload user profile to get updated tier
    this.loadSubscriptionInfo();

    alert(`✅ Payment successful!\n\nYou've been upgraded to ${tier}!\n\nPayment ID: ${razorpayResponse.razorpay_payment_id}`);

    // Clear any pending transaction
    sessionStorage.removeItem('fin_pending_upi_txn');
  },

  validateUpiId(upiId) {
    // UPI ID format: name@bankname or mobile@bankname
    const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$|^\d{10}@[a-zA-Z0-9]+$/;
    return upiPattern.test(upiId);
  },

  resetCardForm() {
    document.getElementById('card-number').value = '';
    document.getElementById('card-expiry').value = '';
    document.getElementById('card-cvv').value = '';
  },

  async performPaymentProcessing() {
    // Legacy function - redirects to appropriate payment method
    const selectedMethod = document.querySelector('.payment-method-tab.active').dataset.method;
    if (selectedMethod === 'card') {
      await this.performCardPayment();
    } else if (selectedMethod === 'upi') {
      await this.performUpiPayment();
    }
  },

  validateCardDetails(cardNumber, expiry, cvv) {
    if (!/^\d{16}$/.test(cardNumber)) return false;
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return false;
    if (!/^\d{3,4}$/.test(cvv)) return false;
    return true;
  },

  resetUpiForm() {
    document.getElementById('upi-id').value = '';
    document.querySelector('input[name="upi-provider"]').checked = true;
  },

  closePaymentModal() {
    const paymentModal = document.getElementById('payment-modal');
    if (paymentModal) {
      paymentModal.style.display = 'none';
      this.resetCardForm();
      this.resetUpiForm();
      // Reset to card tab
      document.querySelectorAll('.payment-method-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.method === 'card');
      });
      document.getElementById('payment-form-card').style.display = 'flex';
      document.getElementById('payment-form-upi').style.display = 'none';
    }
  },

  openModal() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.loadPricingPlans();
    }
  },

  closeModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
    this.closePaymentModal();
  },

  loadPricingPlans() {
    // Plans are already rendered in HTML
    const plans = document.querySelectorAll('.pricing-card');
    plans.forEach((plan) => {
      const tier = plan.dataset.tier;
      plan.classList.toggle('active', tier === this.currentTier);
    });
  },

  showLimitReachedNotice(calculator) {
    const isFree = String(this.currentTier || '').toUpperCase() === 'FREE';
    const msg = isFree
      ? `You've reached your daily limit for ${calculator.toUpperCase()}, but free users are supposed to have unlimited access. Please refresh or sign in again.`
      : `You've reached your daily limit for ${calculator.toUpperCase()}.\n\nUpgrade for premium features like export and advanced analytics.`;
    if (isFree) {
      alert(msg);
      return;
    }

    if (confirm(msg + '\n\nOpen pricing?')) {
      this.openModal();
    }
  }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => subscriptionModule.init());
} else {
  subscriptionModule.init();
}
