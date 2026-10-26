import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { formatEmail } from './email.ts'
import type { Delivery } from './email.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const expected = Deno.env.get('FAMILY_JOBS_SECRET')
  if (!expected || request.headers.get('Authorization') !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const resendKey = required('RESEND_API_KEY')
    const from = required('FAMILY_EMAIL_FROM')
    const { error: processError } = await client.rpc('process_family_bookings')
    if (processError) throw processError
    const { data, error: claimError } = await client.rpc('claim_family_emails')
    if (claimError) throw claimError
    let sent = 0
    let failed = 0
    for (const delivery of (data ?? []) as Delivery[]) {
      let errorMessage: string | null = null
      try {
        const content = formatEmail(delivery)
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': delivery.id,
          },
          body: JSON.stringify({ from, to: [delivery.recipient], ...content }),
          signal: AbortSignal.timeout(20000),
        })
        if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`)
        const result = await response.json()
        if (typeof result.id !== 'string') throw new Error('Email provider returned no delivery ID')
        sent++
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Unknown email delivery failure'
        failed++
        console.error('Email delivery failed', { id: delivery.id, message: errorMessage })
      }
      const { error: finishError } = await client.rpc('finish_family_email', {
        p_id: delivery.id, p_token: delivery.delivery_token, p_error: errorMessage,
      })
      if (finishError) throw finishError
    }
    return Response.json({ sent, failed }, { status: failed ? 502 : 200 })
  } catch (error) {
    console.error('Family job failed', error instanceof Error ? error.message : 'Unknown error')
    return Response.json({ error: 'Family job failed. Inspect server logs.' }, { status: 500 })
  }
})
