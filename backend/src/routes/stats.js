const { Router } = require('express');
const { daily, apps } = require('../controllers/statsController');
const authMiddleware = require('../middleware/auth');

const router = Router();

router.get('/daily', authMiddleware, daily);
router.get('/apps',  authMiddleware, apps);

module.exports = router;
