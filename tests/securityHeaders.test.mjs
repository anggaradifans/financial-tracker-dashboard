import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('deployment applies security headers to all paths and allows required app resources', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const rule = config.headers.find(rule => rule.source === '/(.*)')
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]))
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()')
  const csp = headers['Content-Security-Policy']
  for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "worker-src 'self' blob:"]) assert.ok(csp.includes(directive))
  assert.ok(csp.includes('https://*.supabase.co'))
  assert.ok(csp.includes('https://fonts.googleapis.com'))
  assert.ok(csp.includes('https://images.unsplash.com'))
  assert.ok(!csp.includes('unsafe-eval'))
})
