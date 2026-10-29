const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  normalizeEmail,
  normalizePhone,
  isValidEmail,
  isValidPhone,
  isStrongPassword,
  publicUser
} = require('../utils/validation');

function createToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }

  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function register(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = req.body.password;

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Name must contain 2 to 80 characters.' });
  }
  if (!email && !phone) {
    return res.status(400).json({ message: 'Provide an email address or phone number.' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: 'Password must be 8-72 characters and include uppercase, lowercase, a number, and a symbol.'
    });
  }

  const query = [];
  if (email) query.push({ email });
  if (phone) query.push({ phone });

  try {
    const existing = await User.findOne({ $or: query }).select('_id');
    if (existing) {
      return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Public registration must never allow callers to choose a privileged role.
    const user = await User.create({
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      passwordHash,
      role: 'driver'
    });

    return res.status(201).json({
      message: 'Account created successfully.',
      user: publicUser(user)
    });
  } catch (error) {
    // Unique indexes cover simultaneous duplicate registrations as well.
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    }
    throw error;
  }
}

async function login(req, res) {
  const suppliedIdentifier = req.body.identifier || req.body.email || req.body.phone;
  const identifier = typeof suppliedIdentifier === 'string' ? suppliedIdentifier.trim() : '';
  const password = req.body.password;

  if (!identifier || typeof password !== 'string') {
    return res.status(400).json({ message: 'Identifier and password are required.' });
  }

  const normalizedEmail = normalizeEmail(identifier);
  const normalizedPhone = normalizePhone(identifier);
  const query = [];
  if (normalizedEmail && normalizedEmail.includes('@')) query.push({ email: normalizedEmail });
  if (normalizedPhone && /^\+?\d{7,15}$/.test(normalizedPhone)) query.push({ phone: normalizedPhone });

  if (query.length === 0) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const user = await User.findOne({ $or: query }).select('+passwordHash');
  const isMatch = user && user.isActive
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = createToken(user);
  return res.status(200).json({
    token,
    expiresInSeconds: 7200,
    role: user.role,
    user: publicUser(user)
  });
}

module.exports = { register, login };
