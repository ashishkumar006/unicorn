/**
 * AUTH SERVICE STUB
 *
 * Placeholder for future auth/session flow.
 * Default implementation: no-op auth boundary.
 */

function resolveUserFromToken(token) {
  if (!token) {
    return null;
  }

  return {
    id: 'anonymous',
    isAuthenticated: false,
    authMethod: 'none',
  };
}

function authMiddleware() {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    if (token) {
      req.user = resolveUserFromToken(token);
    }

    next();
  };
}

function requireAuth() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication not configured.' });
    }

    next();
  };
}

function isAuthenticated(req) {
  return Boolean(req.user?.isAuthenticated);
}

module.exports = {
  resolveUserFromToken,
  authMiddleware,
  requireAuth,
  isAuthenticated,
};
