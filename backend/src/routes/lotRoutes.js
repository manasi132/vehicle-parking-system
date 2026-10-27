const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  listLots,
  getLot,
  getLotSlots,
  createLot,
  updateLot,
  deactivateLot,
  bulkCreateSlots
} = require('../controllers/parkingLotController');

const router = express.Router();

// Public read endpoints are used by driver search and availability screens.
router.get('/', asyncHandler(listLots));
router.get('/:lotId/slots', asyncHandler(getLotSlots));
router.get('/:lotId', asyncHandler(getLot));

// Writes require a valid server-verified admin role.
router.post('/', authenticate, authorizeRoles('admin'), asyncHandler(createLot));
router.patch('/:lotId', authenticate, authorizeRoles('admin'), asyncHandler(updateLot));
router.patch('/:lotId/deactivate', authenticate, authorizeRoles('admin'), asyncHandler(deactivateLot));
router.post('/:lotId/slots/bulk', authenticate, authorizeRoles('admin'), asyncHandler(bulkCreateSlots));

module.exports = router;
