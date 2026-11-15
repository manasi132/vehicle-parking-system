const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createReservation, cancelReservation } = require('../controllers/bookingController');

const router = express.Router();
const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many booking attempts. Try again later.' } });

router.post('/reserve', bookingLimiter, authenticate, authorizeRoles('driver', 'admin'), asyncHandler(createReservation));
router.post('/:reservationId/cancel', authenticate, authorizeRoles('driver', 'admin'), asyncHandler(cancelReservation));

module.exports = router;
