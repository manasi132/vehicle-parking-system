function normalizeEmail(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().toLowerCase();
}
function normalizePhone(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().replace(/[\s().-]/g, '');
}
function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function isValidPhone(value) { return typeof value === 'string' && /^\+?\d{7,15}$/.test(value); }
function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72 &&
    /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}
function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email || null, phone: user.phone || null, role: user.role };
}
module.exports = { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, isStrongPassword, publicUser };
