const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function generateProjectKey() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return encodeBase64(raw);
}

export async function encryptValue(plaintext, base64Key) {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plaintext));

  return {
    encryptedValue: encodeBase64(encrypted),
    iv: encodeBase64(iv)
  };
}

export async function decryptValue(encryptedValue, iv, base64Key) {
  const key = await importAesKey(base64Key);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(iv) },
    key,
    decodeBase64(encryptedValue)
  );

  return textDecoder.decode(decrypted);
}

export async function fingerprintValue(plaintext, base64Key) {
  const key = await crypto.subtle.importKey('raw', decodeBase64(base64Key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  const digest = await crypto.subtle.sign('HMAC', key, textEncoder.encode(plaintext));
  return encodeBase64(digest);
}

export async function wrapProjectKey(projectKey, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveWrappingKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(projectKey));

  return JSON.stringify({
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: 250000,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    encryptedValue: encodeBase64(encrypted)
  });
}

export async function unwrapProjectKey(wrappedProjectKey, passphrase) {
  const payload = typeof wrappedProjectKey === 'string' ? JSON.parse(wrappedProjectKey) : wrappedProjectKey;
  const key = await deriveWrappingKey(passphrase, decodeBase64(payload.salt), payload.iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(payload.iv) },
    key,
    decodeBase64(payload.encryptedValue)
  );

  return textDecoder.decode(decrypted);
}

export async function generateDeviceKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  return {
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey)
  };
}

export async function encryptProjectKeyForDevice(projectKey, publicKeyJwk) {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, textEncoder.encode(projectKey));
  return encodeBase64(encrypted);
}

export async function decryptProjectKeyForDevice(encryptedProjectKey, privateKeyJwk) {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, decodeBase64(encryptedProjectKey));
  return textDecoder.decode(decrypted);
}

export function parseEnv(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) return acc;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key) acc[key] = value;
      return acc;
    }, {});
}

export function stringifyEnv(values) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function diffEnvVariables(before, after) {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  return {
    added: [...afterKeys].filter((key) => !beforeKeys.has(key)).sort(),
    removed: [...beforeKeys].filter((key) => !afterKeys.has(key)).sort(),
    changed: [...afterKeys].filter((key) => beforeKeys.has(key) && before[key] !== after[key]).sort(),
    unchanged: [...afterKeys].filter((key) => beforeKeys.has(key) && before[key] === after[key]).sort()
  };
}

async function importAesKey(base64Key) {
  return crypto.subtle.importKey('raw', decodeBase64(base64Key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function deriveWrappingKey(passphrase, salt, iterations = 250000) {
  const material = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function encodeBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
