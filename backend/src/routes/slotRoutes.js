const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createReservation } = require('../controllers/bookingController');

const router = express.Router();

router.post('/reserve', authenticate, authorizeRoles('driver', 'admin'), asyncHandler(createReservation));

module.exports = router;
