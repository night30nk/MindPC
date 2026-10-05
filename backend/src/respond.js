/**
 * Standard response helpers.
 * Every API response must use one of these two shapes:
 *   { success: true,  data: <any> }
 *   { success: false, message: <string> }
 */

function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function fail(res, message, statusCode = 400) {
  return res.status(statusCode).json({ success: false, message });
}

module.exports = { ok, fail };
