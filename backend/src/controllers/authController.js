const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, isStrongPassword, publicUser } = require('../utils/validation');
const { sendPasswordResetOtp } = require('../services/passwordResetDelivery');

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const OTP_DURATION_MS = 10 * 60 * 1000;

function createToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

function hashOtp(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function register(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = req.body.password;
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Name must contain 2 to 80 characters.' });
  if (!email && !phone) return res.status(400).json({ message: 'Provide an email address or phone number.' });
  if (email && !isValidEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (phone && !isValidPhone(phone)) return res.status(400).json({ message: 'Enter a valid phone number.' });
  if (!isStrongPassword(password)) return res.status(400).json({ message: 'Password must be 8-72 characters and include uppercase, lowercase, a number, and a symbol.' });
  const query = [];
  if (email) query.push({ email });
  if (phone) query.push({ phone });
  try {
    const existing = await User.findOne({ $or: query }).select('_id');
    if (existing) return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), passwordHash, role: 'driver' });
    return res.status(201).json({ message: 'Account created successfully.', user: publicUser(user) });
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    throw error;
  }
}

async function login(req, res) {
  const suppliedIdentifier = req.body.identifier || req.body.email || req.body.phone;
  const identifier = typeof suppliedIdentifier === 'string' ? suppliedIdentifier.trim() : '';
  const password = req.body.password;
  if (!identifier || typeof password !== 'string') return res.status(400).json({ message: 'Identifier and password are required.' });
  const normalizedEmail = normalizeEmail(identifier);
  const normalizedPhone = normalizePhone(identifier);
  const query = [];
  if (normalizedEmail && normalizedEmail.includes('@')) query.push({ email: normalizedEmail });
  if (normalizedPhone && /^\+?\d{7,15}$/.test(normalizedPhone)) query.push({ phone: normalizedPhone });
  if (query.length === 0) return res.status(401).json({ message: 'Invalid credentials.' });
  const user = await User.findOne({ $or: query }).select('+passwordHash +failedLoginAttempts +lockedUntil');
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials.' });
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return res.status(423).json({ message: 'Account temporarily locked. Try again after the lock period.' });
  }
  if (user.lockedUntil && user.lockedUntil <= now) {
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
  }
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
      await user.save();
      return res.status(423).json({ message: 'Account temporarily locked after repeated failed logins. Try again in 15 minutes.' });
    }
    await user.save();
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  const token = createToken(user);
  return res.status(200).json({ token, expiresInSeconds: 7200, role: user.role, user: publicUser(user) });
}

async function requestPasswordReset(req, res) {
  const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
  if (!identifier) return res.status(400).json({ message: 'Email or phone is required.' });
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  const query = email && email.includes('@') ? { email } : { phone };
  const user = await User.findOne(query);
  // Keep response identical for existing and unknown accounts to prevent account enumeration.
  if (user && user.isActive) {
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    user.passwordResetOtpHash = hashOtp(otp);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + OTP_DURATION_MS);
    await user.save();
    await sendPasswordResetOtp({ user, otp });
  }
  return res.status(200).json({ message: 'If the account exists, a password reset code has been sent. The code is valid for 10 minutes.' });
}

async function confirmPasswordReset(req, res) {
  const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
  const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
  const newPassword = req.body.newPassword;
  if (!identifier || !/^\d{6}$/.test(otp) || !isStrongPassword(newPassword)) {
    return res.status(400).json({ message: 'Provide an email/phone, six-digit OTP, and a strong new password.' });
  }
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  const query = email && email.includes('@') ? { email } : { phone };
  const user = await User.findOne(query).select('+passwordResetOtpHash +passwordResetOtpExpiresAt');
  if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt ||
      user.passwordResetOtpExpiresAt <= new Date() ||
      !crypto.timingSafeEqual(Buffer.from(user.passwordResetOtpHash), Buffer.from(hashOtp(otp)))) {
    return res.status(400).json({ message: 'The reset code is invalid or expired.' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetOtpHash = null;
  user.passwordResetOtpExpiresAt = null;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  return res.status(200).json({ message: 'Password has been reset successfully.' });
}

module.exports = { register, login, requestPasswordReset, confirmPasswordReset };
