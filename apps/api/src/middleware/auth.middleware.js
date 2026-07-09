import jwt from 'jsonwebtoken';
import { ApiError } from './error.middleware.js';

export function requireAuth(req, _res, next) {
  const authHeader = req.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearerToken || req.cookies?.envvault_session;

  if (!token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-secret');
    return next();
  } catch (_error) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Session is invalid or expired.'));
  }
}
