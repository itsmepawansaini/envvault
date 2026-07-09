import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../middleware/error.middleware.js';
import { User } from '../models/index.js';
import {
  buildGithubAuthorizeUrl,
  exchangeGithubCode,
  setSessionCookie,
  upsertUserFromGithubToken
} from '../services/github-auth.service.js';
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  upsertUserFromGoogleToken
} from '../services/google-auth.service.js';
import {
  clearSessionCookies,
  establishWebSession,
  revokeRefreshToken,
  rotateSessionPair,
  setRefreshCookie
} from '../services/session.service.js';
import { serializeDocument } from '../utils/http.js';
import { getPublicOrigin } from '../config/runtime.js';

const router = Router();

router.get('/providers', (_req, res) => {
  res.json({
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

router.get('/github', (_req, res) => {
  const state = randomBytes(24).toString('hex');
  res.cookie('github_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000
  });
  res.redirect(buildGithubAuthorizeUrl(state));
});

router.get(
  '/github/callback',
  asyncHandler(async (req, res) => {
    if (!req.query.code || !req.query.state || req.query.state !== req.cookies.github_oauth_state) {
      throw new ApiError(400, 'OAUTH_STATE_INVALID', 'GitHub OAuth state is invalid.');
    }

    const accessToken = await exchangeGithubCode(req.query.code);
    const user = await upsertUserFromGithubToken(accessToken);

    res.clearCookie('github_oauth_state');
    await establishWebSession(res, user);
    res.redirect(getPublicOrigin());
  })
);

router.get('/google', (_req, res, next) => {
  try {
    const state = randomBytes(24).toString('hex');
    res.cookie('google_oauth_state', state, oauthStateCookie());
    res.redirect(buildGoogleAuthorizeUrl(state));
  } catch (error) {
    next(new ApiError(503, 'GOOGLE_OAUTH_UNAVAILABLE', error.message));
  }
});

router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    if (!req.query.code || !req.query.state || req.query.state !== req.cookies.google_oauth_state) {
      throw new ApiError(400, 'OAUTH_STATE_INVALID', 'Google OAuth state is invalid.');
    }

    const accessToken = await exchangeGoogleCode(req.query.code);
    const user = await upsertUserFromGoogleToken(accessToken);

    res.clearCookie('google_oauth_state');
    await establishWebSession(res, user);
    res.redirect(getPublicOrigin());
  })
);

router.post(
  '/dev-login',
  asyncHandler(async (_req, res) => {
    if (process.env.DEV_AUTH_ENABLED !== 'true' || process.env.NODE_ENV === 'production') {
      throw new ApiError(404, 'NOT_FOUND', 'No API route matches this request.');
    }

    const user = await User.findOneAndUpdate(
      { oauthProvider: 'github', oauthId: 'dev-local-user' },
      {
        email: 'developer@envvault.local',
        name: 'EnvVault Developer',
        avatarUrl: null
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const pair = await establishWebSession(res, user);

    res.json({ user: serializeDocument(user), token: pair.token, refreshToken: pair.refreshToken });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const suppliedInBody = Boolean(req.body?.refreshToken);
    const pair = await rotateSessionPair(req.body?.refreshToken || req.cookies.envvault_refresh);
    const sessionToken = pair.token;
    setSessionCookie(res, sessionToken);
    setRefreshCookie(res, pair.refreshToken);
    res.json({
      token: sessionToken,
      refreshToken: suppliedInBody ? pair.refreshToken : undefined,
      user: serializeDocument(pair.user)
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    res.json({ user: serializeDocument(user) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.body?.refreshToken || req.cookies.envvault_refresh);
    clearSessionCookies(res);
    res.status(204).send();
  })
);

export default router;

function oauthStateCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000
  };
}
