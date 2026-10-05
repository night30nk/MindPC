const jwt = require('jsonwebtoken');
const { fail } = require('../respond');

// Verifies "Authorization: Bearer <token>" on every protected route.
// On success, attaches req.user = { id } and calls next().
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, 'Missing or malformed Authorization header', 401);
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id }; // only expose what controllers need
    return next();
  } catch {
    // covers TokenExpiredError, JsonWebTokenError, etc.
    return fail(res, 'Invalid or expired token', 401);
  }
}

module.exports = authMiddleware;
