// Subscription tier definitions and feature access control
const SUBSCRIPTION_TIERS = {
  FREE: {
    id: 'free',
    name: 'Free',
    cost: 0,
    features: {
      rd: { limit: -1 },
      fd: { limit: -1 },
      emi: { limit: -1 },
      nw: { limit: -1 },
      export: false,
      advancedCharts: false,
      prioritySupport: false,
      historicalRates: false
    }
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    cost: 99,
    costPeriod: 'monthly',
    features: {
      rd: { limit: -1 }, // unlimited
      fd: { limit: -1 },
      emi: { limit: -1 },
      nw: { limit: -1 },
      export: true,
      advancedCharts: true,
      prioritySupport: false,
      historicalRates: true
    }
  },
  PRO_PLUS: {
    id: 'pro_plus',
    name: 'Pro Plus',
    cost: 299,
    costPeriod: 'monthly',
    features: {
      rd: { limit: -1 },
      fd: { limit: -1 },
      emi: { limit: -1 },
      nw: { limit: -1 },
      export: true,
      advancedCharts: true,
      prioritySupport: true,
      historicalRates: true
    }
  }
};

function getDefaultUserTier() {
  return 'FREE';
}

function getTierInfo(tier) {
  const normalizedTier = String(tier || '').trim().toUpperCase();
  return SUBSCRIPTION_TIERS[normalizedTier] || SUBSCRIPTION_TIERS.FREE;
}

function hasFeatureAccess(tier, feature) {
  const tierInfo = getTierInfo(tier);
  return tierInfo.features[feature] !== undefined && tierInfo.features[feature] !== false;
}

function canUseCalculator(tier, calculator, dailyUsage = 0) {
  const normalizedTier = String(tier || '').trim().toUpperCase();
  const tierInfo = getTierInfo(normalizedTier);
  const feature = tierInfo.features[calculator];

  if (!feature) return false;

  // Free tier is unlimited for enabled calculators
  if (normalizedTier === 'FREE') return true;

  // Unlimited access
  if (feature.limit === -1) return true;

  // Daily limit
  if (feature.perDay) {
    return dailyUsage < feature.limit;
  }

  return true;
}

function getNextTier(currentTier) {
  const tiers = Object.keys(SUBSCRIPTION_TIERS);
  const currentIndex = tiers.indexOf(currentTier);
  return currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
}

module.exports = {
  SUBSCRIPTION_TIERS,
  getDefaultUserTier,
  getTierInfo,
  hasFeatureAccess,
  canUseCalculator,
  getNextTier
};
