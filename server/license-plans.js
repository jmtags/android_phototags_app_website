const LICENSE_PURCHASE_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Good for a single small setup or trial event machine.',
    amount: 49900,
    currency: 'PHP',
    durationDays: 30,
    maxDevices: 1,
    features: ['1 Android device', 'Photobooth and ID photo modes', 'QR download support', '30 days access']
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Best for regular event use on one PhotoTags station.',
    amount: 249900,
    currency: 'PHP',
    durationDays: 365,
    maxDevices: 1,
    features: ['1 Android device', 'All current PhotoTags tools', 'Templates and branding', '1 year access']
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For teams running several PhotoTags stations.',
    amount: 699900,
    currency: 'PHP',
    durationDays: 365,
    maxDevices: 5,
    features: ['Up to 5 Android devices', 'All Pro features', 'Multi-station event use', '1 year access']
  }
];

function getLicensePlans() {
  return LICENSE_PURCHASE_PLANS;
}

function getLicensePlan(planId) {
  return LICENSE_PURCHASE_PLANS.find((plan) => plan.id === planId) || null;
}

module.exports = {
  getLicensePlan,
  getLicensePlans
};
