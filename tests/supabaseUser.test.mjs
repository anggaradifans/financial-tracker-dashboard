import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

// Objects built inside the vm context fail strict deep-equal against main-realm literals.
const plain = (value) => JSON.parse(JSON.stringify(value));

const { createSupabaseUserVerifier } = await loadTsModule('../api/_lib/supabaseUser.ts', import.meta.url);

function verifierReturning(response, requests = []) {
  return createSupabaseUserVerifier('https://example.supabase.co', 'public-key', async (url, init) => {
    requests.push({ url, init });
    return response;
  });
}

test('should resolve the user when Supabase Auth accepts the token', async () => {
  const requests = [];
  const verify = verifierReturning(new Response(JSON.stringify({ id: 'user-1' })), requests);

  assert.deepEqual(plain(await verify('user-token')), { id: 'user-1' });
  assert.equal(requests[0].url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer user-token');
  assert.equal(requests[0].init.headers.apikey, 'public-key');
});

test('should return null when Supabase Auth rejects the token', async () => {
  assert.equal(await verifierReturning(new Response('{}', { status: 401 }))('t'), null);
  assert.equal(await verifierReturning(new Response('{}', { status: 403 }))('t'), null);
});

test('should return null when the response has no user id', async () => {
  assert.equal(await verifierReturning(new Response('{}'))('t'), null);
});

test('should throw when Supabase Auth is unavailable', async () => {
  await assert.rejects(verifierReturning(new Response('', { status: 503 }))('t'), /503/);
});
