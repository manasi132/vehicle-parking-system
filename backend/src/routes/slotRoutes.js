const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createReservation, cancelReservation } = require('../controllers/bookingController');

const router = express.Router();

router.post('/reserve', authenticate, authorizeRoles('driver', 'admin'), asyncHandler(createReservation));
router.post('/:reservationId/cancel', authenticate, authorizeRoles('driver', 'admin'), asyncHandler(cancelReservation));

module.exports = router;
