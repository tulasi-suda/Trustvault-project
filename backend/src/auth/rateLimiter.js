// In-memory IP-based rate limiting helper
// Supports registration limits (sliding 1-hour window) and failed login tracking (sliding 15-minute window)

const registrationAttempts = new Map(); // ip -> [timestamps]
const failedLoginAttempts = new Map();  // ip -> [timestamps]

const REGISTRATION_LIMIT = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function cleanOldTimestamps(map, windowMs) {
  const now = Date.now();
  for (const [ip, timestamps] of map.entries()) {
    const valid = timestamps.filter(t => now - t < windowMs);
    if (valid.length === 0) {
      map.delete(ip);
    } else {
      map.set(ip, valid);
    }
  }
}

// Middleware: Rate limit registration to 5 attempts per hour per IP
function registerRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  cleanOldTimestamps(registrationAttempts, REGISTRATION_WINDOW_MS);

  const attempts = registrationAttempts.get(ip) || [];
  if (attempts.length >= REGISTRATION_LIMIT) {
    return res.status(429).json({
      error: 'Too many registration attempts from this IP. Please try again after an hour.',
    });
  }

  attempts.push(now);
  registrationAttempts.set(ip, attempts);
  next();
}

// Check if login is currently rate-limited for this IP
function isLoginRateLimited(ip) {
  const limit = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);
  cleanOldTimestamps(failedLoginAttempts, LOGIN_WINDOW_MS);
  const attempts = failedLoginAttempts.get(ip) || [];
  return attempts.length >= limit;
}

// Record a failed login attempt for this IP
function recordFailedLogin(ip) {
  cleanOldTimestamps(failedLoginAttempts, LOGIN_WINDOW_MS);
  const attempts = failedLoginAttempts.get(ip) || [];
  attempts.push(Date.now());
  failedLoginAttempts.set(ip, attempts);
}

// Clear failed login attempts on successful authentication
function clearFailedLogins(ip) {
  failedLoginAttempts.delete(ip);
}

// Reset maps (used in unit tests)
function resetRateLimiters() {
  registrationAttempts.clear();
  failedLoginAttempts.clear();
}

// Get failed login count in last hour for an IP (used in admin "worth noticing" panel)
function getFailedLoginCountForHour(ip) {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const attempts = failedLoginAttempts.get(ip) || [];
  return attempts.filter(t => t > oneHourAgo).length;
}

module.exports = {
  registerRateLimiter,
  isLoginRateLimited,
  recordFailedLogin,
  clearFailedLogins,
  resetRateLimiters,
  getFailedLoginCountForHour,
  failedLoginAttempts,
};
