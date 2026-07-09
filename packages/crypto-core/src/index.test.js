import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptProjectKeyForDevice,
  decryptValue,
  diffEnvVariables,
  encryptProjectKeyForDevice,
  encryptValue,
  generateDeviceKeyPair,
  generateProjectKey,
  parseEnv,
  stringifyEnv,
  unwrapProjectKey,
  wrapProjectKey
} from './index.js';

test('AES project keys encrypt and decrypt values', async () => {
  const key = await generateProjectKey();
  const encrypted = await encryptValue('secret-value', key);
  assert.equal(await decryptValue(encrypted.encryptedValue, encrypted.iv, key), 'secret-value');
});

test('passphrase wrapping round trips a project key', async () => {
  const key = await generateProjectKey();
  const wrapped = await wrapProjectKey(key, 'correct horse battery staple');
  assert.equal(await unwrapProjectKey(wrapped, 'correct horse battery staple'), key);
});

test('RSA device handoff keeps the project key client-side', async () => {
  const key = await generateProjectKey();
  const device = await generateDeviceKeyPair();
  const encrypted = await encryptProjectKeyForDevice(key, device.publicKey);
  assert.equal(await decryptProjectKeyForDevice(encrypted, device.privateKey), key);
});

test('env parsing, stringifying, and diffing are deterministic', () => {
  const parsed = parseEnv('B=2\n# ignored\nA=\"1\"\n');
  assert.deepEqual(parsed, { B: '2', A: '1' });
  assert.equal(stringifyEnv(parsed), 'A=1\nB=2');
  assert.deepEqual(diffEnvVariables({ A: '1', B: '2' }, { A: '3', C: '4' }), {
    added: ['C'],
    removed: ['B'],
    changed: ['A'],
    unchanged: []
  });
});
