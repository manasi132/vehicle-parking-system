const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const auditAdminAction = require('../middleware/auditAdminAction');
const { recordEntry, recordExit } = require('../controllers/trackingController');

const router = express.Router();

router.post('/entry', authenticate, authorizeRoles('attendant', 'admin'), auditAdminAction('tracking.entry', 'VehicleEntry'), asyncHandler(recordEntry));
router.post('/exit', authenticate, authorizeRoles('attendant', 'admin'), auditAdminAction('tracking.exit', 'VehicleEntry'), asyncHandler(recordExit));

module.exports = router;
