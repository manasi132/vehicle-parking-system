const jwt = require('jsonwebtoken');
const User = require('../models/User');

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ message: 'Authentication is not configured.' });
  }

  let payload;
  try {
    payload = jwt.verify(parts[1], process.env.JWT_SECRET);
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  if (!payload.sub || !payload.role) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  // Re-read the user on each request so role changes and disabled users take effect.
  User.findById(payload.sub)
    .select('_id role isActive')
    .then((user) => {
      if (!user || !user.isActive || user.role !== payload.role) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
      }
      req.user = { id: user._id.toString(), role: user.role };
      return next();
    })
    .catch(next);
}

function authorizeRoles(...allowedRoles) {
  return function roleAuthorization(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { authenticate, authorizeRoles };
