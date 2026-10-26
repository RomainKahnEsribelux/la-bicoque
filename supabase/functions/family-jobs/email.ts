export type Delivery = {
  id: string
  delivery_token: string
  kind: 'confirmation' | 'payment' | 'admin_alert'
  recipient: string
  payload: Record<string, unknown>
}

export function formatEmail(delivery: Delivery) {
  const p = delivery.payload
  if (delivery.kind === 'admin_alert') {
    if (typeof p.message !== 'string' || !p.message.trim()) throw new Error('Invalid admin alert payload')
    return { subject: 'La Bicoque : action administrateur requise', text: p.message }
  }
  if (typeof p.name !== 'string' || typeof p.check_in !== 'string' || typeof p.check_out !== 'string'
    || typeof p.guests !== 'number' || !Number.isSafeInteger(p.guests) || p.guests < 1 || p.guests > 30) {
    throw new Error('Invalid stay email payload')
  }
  const stay = `Bonjour ${p.name},\n\nSéjour du ${p.check_in} au ${p.check_out}, pour ${p.guests} personne(s) estimée(s).`
  if (delivery.kind === 'confirmation') {
    if (p.stay_mode !== 'open' && p.stay_mode !== 'exclusive') throw new Error('Invalid stay mode payload')
    return {
      subject: 'La Bicoque : séjour confirmé',
      text: `${stay}\n\nVotre séjour ${p.stay_mode === 'open' ? 'ouvert au partage' : 'exclusif'} est confirmé.\nConsultez vos réservations sur le site pour les horaires prévus.`,
    }
  }
  if (typeof p.amount_cents !== 'number' || !Number.isSafeInteger(p.amount_cents) || p.amount_cents <= 0
    || typeof p.rate_cents !== 'number' || !Number.isSafeInteger(p.rate_cents) || p.rate_cents <= 0
    || typeof p.nights !== 'number' || !Number.isSafeInteger(p.nights) || p.nights <= 0
    || p.amount_cents !== p.guests * p.nights * p.rate_cents
    || typeof p.transfer !== 'string' || !p.transfer.trim()) {
    throw new Error('Invalid payment recap payload')
  }
  const money = (cents: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
  return {
    subject: 'La Bicoque : récapitulatif du séjour et virement',
    text: `${stay}\n\n${p.nights} nuit(s) × ${p.guests} personne(s) estimée(s) × ${money(p.rate_cents)} = ${money(p.amount_cents)}.\n\nInstructions de virement :\n${p.transfer}\n\nCe message n'est pas une preuve de paiement. Aucun paiement n'est effectué sur le site.`,
  }
}
