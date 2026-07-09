import jwt from 'jsonwebtoken';
import { EncryptionKey, Project, User } from '../models/index.js';
import { getApiOrigin } from '../config/runtime.js';

const githubApiBase = 'https://api.github.com';

export function assertGithubConfigured() {
  if (!process.env.GITHUB_CLIENT_ID) {
    throw new Error('GITHUB_CLIENT_ID is not configured.');
  }
}

export function getGithubCallbackUrl() {
  return process.env.GITHUB_CALLBACK_URL || `${getApiOrigin()}/api/auth/github/callback`;
}

export function buildGithubAuthorizeUrl(state) {
  assertGithubConfigured();
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: getGithubCallbackUrl(),
    scope: 'read:user user:email',
    state
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGithubCode(code) {
  if (!process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_SECRET is not configured.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: getGithubCallbackUrl()
    })
  });
  const payload = await response.json();

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'GitHub token exchange failed.');
  }

  return payload.access_token;
}

export async function createGithubDeviceCode() {
  assertGithubConfigured();
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      scope: 'read:user user:email'
    })
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || 'GitHub device-code request failed.');
  }

  return payload;
}

export async function exchangeGithubDeviceCode(deviceCode) {
  assertGithubConfigured();
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  });
  const payload = await response.json();

  if (payload.error) {
    return payload;
  }

  if (!response.ok || !payload.access_token) {
    throw new Error('GitHub device token exchange failed.');
  }

  return payload;
}

export async function upsertUserFromGithubToken(accessToken) {
  const [profile, emails] = await Promise.all([fetchGithubProfile(accessToken), fetchGithubEmails(accessToken)]);
  const primaryEmail = pickGithubEmail(profile, emails);

  const user = await User.findOneAndUpdate(
    { oauthProvider: 'github', oauthId: String(profile.id) },
    {
      email: primaryEmail,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url || null
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await claimPendingInvites(user);
  return user;
}

export function issueSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    process.env.JWT_SECRET || 'dev-only-secret',
    { expiresIn: '15m' }
  );
}

export function setSessionCookie(res, token) {
  res.cookie('envvault_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000
  });
}

async function fetchGithubProfile(accessToken) {
  const response = await fetch(`${githubApiBase}/user`, {
    headers: githubHeaders(accessToken)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Could not fetch GitHub profile.');
  }

  return payload;
}

async function fetchGithubEmails(accessToken) {
  const response = await fetch(`${githubApiBase}/user/emails`, {
    headers: githubHeaders(accessToken)
  });

  if (!response.ok) return [];
  return response.json();
}

function pickGithubEmail(profile, emails) {
  const primary = emails.find((email) => email.primary && email.verified)?.email;
  const verified = emails.find((email) => email.verified)?.email;
  return primary || verified || profile.email || `${profile.login}@users.noreply.github.com`;
}

function githubHeaders(accessToken) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function claimPendingInvites(user) {
  const email = user.email.toLowerCase();
  const projects = await Project.find({
    members: { $elemMatch: { userId: null, invitedEmail: email } }
  }).select('+members.encryptedProjectKey');

  for (const project of projects) {
    const invite = project.members.find(
      (member) => !member.userId && member.invitedEmail === email
    );
    if (!invite) continue;

    invite.userId = user.id;
    invite.joinedAt = new Date();
    await project.save();

    if (invite.encryptedProjectKey) {
      await EncryptionKey.findOneAndUpdate(
        { projectId: project.id, userId: user.id },
        { encryptedProjectKey: invite.encryptedProjectKey },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
  }
}
