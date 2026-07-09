import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';

async function withServer(run) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health endpoint includes security and no-cache headers', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.ok(response.headers.get('x-content-type-options'));
  });
});

test('provider discovery does not expose OAuth credentials', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/providers`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(typeof payload.github, 'boolean');
    assert.equal(typeof payload.google, 'boolean');
    assert.deepEqual(Object.keys(payload).sort(), ['github', 'google']);
  });
});

test('unknown API routes use the standard error shape', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/not-real`);
    const payload = await response.json();
    assert.equal(response.status, 404);
    assert.equal(payload.error.code, 'NOT_FOUND');
  });
});
