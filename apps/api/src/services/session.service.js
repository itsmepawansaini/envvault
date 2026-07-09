import { createHash, randomBytes } from 'node:crypto';
import { RefreshSession, User } from '../models/index.js';
import { ApiError } from '../middleware/error.middleware.js';
import { issueSessionToken, setSessionCookie } from './github-auth.service.js';

const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

export async function createSessionPair(user) {
  const refreshToken = randomBytes(48).toString('base64url');
  await RefreshSession.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + refreshLifetimeMs)
  });
  return { token: issueSessionToken(user), refreshToken };
}

export async function rotateSessionPair(refreshToken) {
  if (!refreshToken) throw new ApiError(401, 'REFRESH_REQUIRED', 'Refresh session is required.');
  const session = await RefreshSession.findOne({
    tokenHash: hashToken(refreshToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!session) throw new ApiError(401, 'REFRESH_INVALID', 'Refresh session is invalid or expired.');

  session.revokedAt = new Date();
  await session.save();
  const user = await User.findById(session.userId);
  if (!user) throw new ApiError(401, 'REFRESH_INVALID', 'Refresh session user no longer exists.');
  return { user, ...(await createSessionPair(user)) };
}

export async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await RefreshSession.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function establishWebSession(res, user) {
  const pair = await createSessionPair(user);
  setSessionCookie(res, pair.token);
  setRefreshCookie(res, pair.refreshToken);
  return pair;
}

export function setRefreshCookie(res, refreshToken) {
  res.cookie('envvault_refresh', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: refreshLifetimeMs
  });
}

export function clearSessionCookies(res) {
  res.clearCookie('envvault_session');
  res.clearCookie('envvault_refresh');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
