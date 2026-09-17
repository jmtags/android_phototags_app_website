const FALLBACK_LICENSE_PLANS = [
  {
    id: 'weekly',
    name: 'Weekly',
    description: 'Launch pricing for short event use.',
    amount: 15000,
    currency: 'PHP',
    durationDays: 7,
    maxDevices: 1,
    active: true,
    features: ['1 Android device', '7 days access', 'Photobooth and ID photo modes', 'QR download support']
  },
  {
    id: 'monthly',
    name: 'Monthly',
    description: 'Launch pricing for regular PhotoTags use.',
    amount: 30000,
    currency: 'PHP',
    durationDays: 30,
    maxDevices: 1,
    active: true,
    features: ['1 Android device', '30 days access', 'All current PhotoTags tools', 'Templates and branding']
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    description: 'Launch pricing for one device with no expiry.',
    amount: 100000,
    currency: 'PHP',
    durationDays: null,
    maxDevices: 1,
    active: true,
    features: ['1 Android device', 'No expiry', 'All current PhotoTags tools', 'Future license checks supported']
  }
];

function normalizePlan(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    amount: Number(row.amount),
    currency: row.currency || 'PHP',
    durationDays: row.duration_days === null || row.durationDays === null
      ? null
      : Number(row.duration_days ?? row.durationDays),
    maxDevices: Number(row.max_devices ?? row.maxDevices ?? 1),
    active: row.active !== false,
    features: Array.isArray(row.features) ? row.features : []
  };
}

async function getLicensePlans(supabase = null, options = {}) {
  if (!supabase) {
    return FALLBACK_LICENSE_PLANS.map(normalizePlan);
  }

  const { data, error } = await supabase
    .from('license_plan_settings')
    .select('id, name, description, amount, currency, duration_days, max_devices, features, active, sort_order')
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    return FALLBACK_LICENSE_PLANS.map(normalizePlan);
  }

  const plans = data.map(normalizePlan);
  return options.includeInactive ? plans : plans.filter((plan) => plan.active);
}

async function getLicensePlan(planId, supabase = null) {
  const plans = await getLicensePlans(supabase);
  return plans.find((plan) => plan.id === planId) || null;
}

module.exports = {
  getLicensePlan,
  getLicensePlans
};
