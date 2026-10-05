const { Router } = require('express');
const { register, login, me } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = Router();

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        authMiddleware, me); // protected

module.exports = router;
