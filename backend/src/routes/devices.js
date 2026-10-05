const { Router } = require('express');
const { createOrGetDevice } = require('../controllers/devicesController');
const authMiddleware = require('../middleware/auth');

const router = Router();

// All device routes require a valid JWT
router.post('/', authMiddleware, createOrGetDevice);

module.exports = router;
