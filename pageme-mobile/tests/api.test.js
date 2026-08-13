import test from 'node:test';
import assert from 'node:assert/strict';

import { PageMeApiError, postPageMe } from '../src/api.js';

test('postPageMe posts JSON and returns parsed response data', async () => {
  let request;
  const result = await postPageMe(
    { action: 'page', message: 'hello' },
    {
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success' }),
        };
      },
    },
  );

  assert.equal(result.status, 'success');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'text/plain');
  assert.deepEqual(JSON.parse(request.options.body), { action: 'page', message: 'hello' });
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('postPageMe throws a typed error for HTTP failures', async () => {
  await assert.rejects(
    postPageMe(
      { action: 'page' },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          json: async () => ({}),
        }),
      },
    ),
    (error) => error instanceof PageMeApiError && error.status === 500,
  );
});

test('postPageMe throws a typed error for invalid JSON', async () => {
  await assert.rejects(
    postPageMe(
      { action: 'page' },
      {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad json');
          },
        }),
      },
    ),
    PageMeApiError,
  );
});
