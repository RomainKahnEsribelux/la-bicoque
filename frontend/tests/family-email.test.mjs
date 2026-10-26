import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatEmail } from '../../supabase/functions/family-jobs/email.ts'

const base = {
  id: 'test', delivery_token: 'test', recipient: 'test@example.test', kind: 'payment',
  payload: { name: 'Test', check_in: '2026-11-20', check_out: '2026-11-23',
    guests: 3, nights: 3, rate_cents: 1250, amount_cents: 11250, transfer: 'Test instructions' },
}
test('recap shows per-person rate, estimated people, nights and bank instructions without payment link', () => {
  const mail = formatEmail(base)
  assert.match(mail.text, /3 nuit/)
  assert.match(mail.text, /112,50/)
  assert.match(mail.text, /12,50/)
  assert.match(mail.text, /Test instructions/)
  assert.doesNotMatch(mail.text, /https?:\/\//)
})
test('invalid amounts and missing instructions never produce a success-shaped recap', () => {
  assert.throws(() => formatEmail({ ...base, payload: { ...base.payload, amount_cents: 10 } }), /Invalid payment/)
  assert.throws(() => formatEmail({ ...base, payload: { ...base.payload, transfer: '' } }), /Invalid payment/)
})
test('confirmation distinguishes shared and exclusive stays', () => {
  assert.match(formatEmail({ ...base, kind: 'confirmation', payload: { ...base.payload, stay_mode: 'open' } }).text, /ouvert au partage/)
  assert.match(formatEmail({ ...base, kind: 'confirmation', payload: { ...base.payload, stay_mode: 'exclusive' } }).text, /exclusif/)
})
