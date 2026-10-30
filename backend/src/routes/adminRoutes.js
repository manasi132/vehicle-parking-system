const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const auditAdminAction = require('../middleware/auditAdminAction');
const { setLotPricing, getOccupancy, createAttendant, listAuditLogs } = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, authorizeRoles('admin'));
router.get('/occupancy', asyncHandler(getOccupancy));
router.post('/lots/:lotId/pricing', auditAdminAction('lot.pricing.update', 'ParkingLot'), asyncHandler(setLotPricing));
router.post('/attendants', auditAdminAction('attendant.create', 'User'), asyncHandler(createAttendant));
router.get('/audit-logs', asyncHandler(listAuditLogs));

module.exports = router;
