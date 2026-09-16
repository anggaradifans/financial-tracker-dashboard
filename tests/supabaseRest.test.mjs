import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/supabaseRest.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
})

async function clientFor({ getSession, respond } = {}) {
  const requests = []
  const context = vm.createContext({
    URL,
    fetch: async (url, options) => {
      requests.push({ url, ...options })
      return respond?.() ?? new Response('[]')
    },
  })
  const auth = new vm.SyntheticModule(['supabase'], function () {
    this.setExport('supabase', { auth: {
      getSession: getSession ?? (async () => ({ data: { session: { access_token: 'user-token' } }, error: null })),
    } })
  }, { context })
  const module = new vm.SourceTextModule(outputText, {
    context,
    initializeImportMeta(meta) {
      meta.env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key' }
    },
  })
  await module.link(specifier => {
    assert.equal(specifier, './supabase')
    return auth
  })
  await module.evaluate()
  return { client: module.namespace.supabaseRest, requests }
}

test('select sends the public key and user token and preserves date bounds', async () => {
  const { client, requests } = await clientFor()
  await client.select('transactions', {
    select: '*,categories(*)', gte: { occurred_at: '2026-09-01' },
    lte: { occurred_at: '2026-09-30' }, is: { deleted_at: null },
  })
  assert.equal(requests[0].headers.apikey, 'public-key')
  assert.equal(requests[0].headers.Authorization, 'Bearer user-token')
  const url = new URL(requests[0].url)
  assert.deepEqual(url.searchParams.getAll('occurred_at'), ['gte.2026-09-01', 'lte.2026-09-30'])
  assert.equal(url.searchParams.get('deleted_at'), 'is.null')
})

test('writes and RPC use the user session and cannot override authorization', async () => {
  const { client, requests } = await clientFor({ respond: () => new Response('[{"id":"record"}]') })
  await client.insert('categories', { name: 'Custom', user_id: 'owner' })
  await client.update('transactions', { amount: 5 }, { id: 'record' })
  await client.delete('budgets', { id: 'record' })
  await client.rpc('example', {})
  await client.request('accounts', { headers: { Authorization: 'Bearer override', apikey: 'override' } })
  for (const request of requests) {
    assert.equal(request.headers.apikey, 'public-key')
    assert.equal(request.headers.Authorization, 'Bearer user-token')
  }
  assert.deepEqual(requests.map(r => r.method), ['POST', 'PATCH', 'DELETE', 'POST', 'GET'])
})

test('each request uses the latest session token', async () => {
  let token = 'first-token'
  const { client, requests } = await clientFor({
    getSession: async () => ({ data: { session: { access_token: token } }, error: null }),
  })
  await client.select('accounts')
  token = 'refreshed-token'
  await client.select('accounts')
  assert.deepEqual(requests.map(r => r.headers.Authorization), ['Bearer first-token', 'Bearer refreshed-token'])
})

test('signed-out requests fail before sending a network request', async () => {
  const { client, requests } = await clientFor({
    getSession: async () => ({ data: { session: null }, error: null }),
  })
  await assert.rejects(client.select('transactions'), /Please sign in/)
  await assert.rejects(client.insert('categories', {}), /Please sign in/)
  await assert.rejects(client.rpc('example', {}), /Please sign in/)
  assert.equal(requests.length, 0)
})

test('session errors fail before sending a network request', async () => {
  const { client, requests } = await clientFor({
    getSession: async () => ({ data: { session: null }, error: new Error('Session refresh failed') }),
  })
  await assert.rejects(client.select('transactions'), /Session refresh failed/)
  assert.equal(requests.length, 0)
})

test('RLS-filtered writes do not report success when no row changed', async () => {
  const { client } = await clientFor()
  await assert.rejects(client.update('transactions', { amount: 1 }, { id: 'other-user-record' }), /permission/)
  await assert.rejects(client.delete('categories', { id: 'shared-default' }), /permission/)
})

test('an empty successful delete response is accepted', async () => {
  const { client } = await clientFor({ respond: () => new Response(null, { status: 204 }) })
  await client.delete('accounts', { id: 'record' })
})

test('API authorization failures surface without retrying with another credential', async () => {
  const { client, requests } = await clientFor({ respond: () => new Response('Denied', { status: 403 }) })
  await assert.rejects(client.select('transactions'), /403 - Denied/)
  assert.equal(requests.length, 1)
})
