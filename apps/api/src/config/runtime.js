export function validateRuntimeConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = ['MONGODB_URI', 'JWT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']
    .filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  if (!getPublicOrigin().startsWith('https://')) {
    throw new Error('WEB_ORIGIN must use HTTPS in production.');
  }
  if (process.env.DEV_AUTH_ENABLED === 'true') {
    throw new Error('DEV_AUTH_ENABLED must be false in production.');
  }
}

export function getPublicOrigin() {
  return (process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}

export function getApiOrigin() {
  return (process.env.API_PUBLIC_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? getPublicOrigin() : 'http://localhost:4500'))
    .replace(/\/$/, '');
}
