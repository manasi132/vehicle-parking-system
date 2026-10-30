const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const auditAdminAction = require('../middleware/auditAdminAction');
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

// Writes require a valid server-verified admin role and are recorded without request bodies.
router.post('/', authenticate, authorizeRoles('admin'), auditAdminAction('lot.create', 'ParkingLot'), asyncHandler(createLot));
router.patch('/:lotId', authenticate, authorizeRoles('admin'), auditAdminAction('lot.update', 'ParkingLot'), asyncHandler(updateLot));
router.patch('/:lotId/deactivate', authenticate, authorizeRoles('admin'), auditAdminAction('lot.deactivate', 'ParkingLot'), asyncHandler(deactivateLot));
router.post('/:lotId/slots/bulk', authenticate, authorizeRoles('admin'), auditAdminAction('slots.bulk_create', 'ParkingSlot'), asyncHandler(bulkCreateSlots));

module.exports = router;
