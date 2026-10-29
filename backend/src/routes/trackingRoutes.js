const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordEntry, recordExit } = require('../controllers/trackingController');

const router = express.Router();

router.post('/entry', authenticate, authorizeRoles('attendant', 'admin'), asyncHandler(recordEntry));
router.post('/exit', authenticate, authorizeRoles('attendant', 'admin'), asyncHandler(recordExit));

module.exports = router;
