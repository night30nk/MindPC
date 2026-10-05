const { Router } = require('express');
const { bulkUpload, listByDate } = require('../controllers/sessionsController');
const authMiddleware = require('../middleware/auth');

const router = Router();

// All session routes require a valid JWT
router.get('/',      authMiddleware, listByDate);
router.post('/bulk', authMiddleware, bulkUpload);

module.exports = router;
