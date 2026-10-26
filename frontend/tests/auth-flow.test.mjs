import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuthLink, passwordError } from '../src/lib/authFlow.ts'

function client({ session = true, verified = true, otpError = false, exchangeError = false } = {}) {
  const calls = []
  return { calls, auth: {
    getSession: async () => ({ data: { session: session ? {} : null }, error: null }),
    verifyOtp: async args => { calls.push(['otp', args]); return { error: otpError } },
    exchangeCodeForSession: async code => { calls.push(['exchange', code]); return { error: exchangeError } },
    getUser: async () => ({ data: { user: verified ? { email_confirmed_at: '2026-10-26' } : null }, error: null }),
  } }
}
test('confirmation, invitation and recovery links validate identity with the server', async () => {
  assert.equal(await resolveAuthLink(client(), 'https://example.test/auth/callback'), 'profile')
  for (const type of ['invite', 'recovery']) {
    const c = client()
    assert.equal(await resolveAuthLink(c, `https://example.test/auth/callback?type=${type}&token_hash=test`), 'password')
    assert.deepEqual(c.calls, [['otp', { type, token_hash: 'test' }]])
  }
  const pkce = client({ session: false })
  assert.equal(await resolveAuthLink(pkce, 'https://example.test/nouveau-mot-de-passe?code=test', true), 'password')
  assert.deepEqual(pkce.calls, [['exchange', 'test']])
  const implicit = client()
  assert.equal(await resolveAuthLink(implicit, 'https://example.test/auth/callback#type=recovery'), 'password')
})
test('invalid links and unverified sessions cannot reach a success state', async () => {
  await assert.rejects(resolveAuthLink(client(), 'https://example.test/?error_code=otp_expired'), /expiré/)
  await assert.rejects(resolveAuthLink(client({ verified: false }), 'https://example.test/?type=recovery'), /session vérifiée/)
  await assert.rejects(resolveAuthLink(client({ otpError: true }), 'https://example.test/?type=invite&token_hash=bad'), /invalide/)
  await assert.rejects(resolveAuthLink(client({ session: false, exchangeError: true }), 'https://example.test/?code=bad'), /autre navigateur/)
  await assert.rejects(resolveAuthLink(client(), 'https://example.test/?type=admin&token_hash=bad'), /non pris en charge/)
  assert.ok(passwordError('short', 'short'))
  assert.ok(passwordError('long-enough', 'different'))
  assert.equal(passwordError('long-enough', 'long-enough'), null)
})
