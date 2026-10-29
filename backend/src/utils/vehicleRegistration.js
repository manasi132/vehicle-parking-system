function normalizeVehicleRegistration(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{4,15}$/.test(normalized)) return null;
  return normalized;
}

module.exports = { normalizeVehicleRegistration };
