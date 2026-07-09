import { EncryptionKey, Project, User } from '../models/index.js';
import { getApiOrigin } from '../config/runtime.js';

export function assertGoogleConfigured() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth is not configured.');
  }
}

export function getGoogleCallbackUrl() {
  return process.env.GOOGLE_CALLBACK_URL || `${getApiOrigin()}/api/auth/google/callback`;
}

export function buildGoogleAuthorizeUrl(state) {
  assertGoogleConfigured();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code) {
  assertGoogleConfigured();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getGoogleCallbackUrl()
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Google token exchange failed.');
  }
  return payload.access_token;
}

export async function upsertUserFromGoogleToken(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await response.json();
  if (!response.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error(profile.error_description || 'Could not verify the Google profile.');
  }

  const user = await User.findOneAndUpdate(
    { oauthProvider: 'google', oauthId: String(profile.sub) },
    {
      email: profile.email,
      name: profile.name || profile.email,
      avatarUrl: profile.picture || null
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const projects = await Project.find({
    members: { $elemMatch: { userId: null, invitedEmail: user.email } }
  }).select('+members.encryptedProjectKey');
  for (const project of projects) {
    const invite = project.members.find((member) => !member.userId && member.invitedEmail === user.email);
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
  return user;
}
