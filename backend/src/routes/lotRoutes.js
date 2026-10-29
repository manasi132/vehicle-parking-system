const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  getLot,
  createLot,
  updateLot,
  deactivateLot,
  bulkCreateSlots
} = require('../controllers/parkingLotController');
const {
  searchLots,
  getSlotAvailability
} = require('../controllers/bookingController');

const router = express.Router();

// Public search/availability reads compute live counts from slots and reservations.
router.get('/', asyncHandler(searchLots));
router.get('/:lotId/slots', asyncHandler(getSlotAvailability));
router.get('/:lotId/availability', asyncHandler(getSlotAvailability));
router.get('/:lotId', asyncHandler(getLot));

// Writes require a valid server-verified admin role.
router.post('/', authenticate, authorizeRoles('admin'), asyncHandler(createLot));
router.patch('/:lotId', authenticate, authorizeRoles('admin'), asyncHandler(updateLot));
router.patch('/:lotId/deactivate', authenticate, authorizeRoles('admin'), asyncHandler(deactivateLot));
router.post('/:lotId/slots/bulk', authenticate, authorizeRoles('admin'), asyncHandler(bulkCreateSlots));

module.exports = router;
