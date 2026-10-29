import { useEffect, useState } from 'react'
import { ContentCard, ContentPage } from '../components/ContentPage'
import { directionsUrl } from '../lib/memberWorkflows'
import { branches } from '../lib/family'
import { useAuth } from '../auth/AuthContext'
import { getBranchDirectory, getPublicContacts } from '../lib/management'
import type { BranchContact, PublicContact } from '../lib/management'

export default function Contact() {
  const { session } = useAuth()
  const verifiedId = session?.user.email_confirmed_at ? session.user.id : null
  const [contacts, setContacts] = useState<PublicContact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [directory, setDirectory] = useState<{ userId: string; contacts: BranchContact[]; error?: string } | null>(null)
  useEffect(() => {
    let active = true
    getPublicContacts().then(data => { if (active) setContacts(data) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Contacts indisponibles.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!verifiedId) return
    let active = true
    getBranchDirectory().then(data => { if (active) setDirectory({ userId: verifiedId, contacts: data }) })
      .catch(e => { if (active) setDirectory({ userId: verifiedId, contacts: [], error: e instanceof Error ? e.message : 'Annuaire indisponible.' }) })
    return () => { active = false }
  }, [verifiedId])
  const currentDirectory = directory?.userId === verifiedId ? directory : null
  return <ContentPage title="Contact" intro="Les contacts de La Bicoque et les informations pour venir à Stavelot.">
    <ContentCard>
      <h2 className="mb-2 text-xl font-semibold">Venir à La Bicoque</h2>
      <p>54, rue de Spa · 4970 Stavelot · Belgique</p>
      <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block underline">Calculer mon itinéraire avec Google Maps</a>
    </ContentCard>
    <section className="mt-5">
      <ContentCard>
        <h2 className="mb-3 text-xl font-semibold">Nous contacter</h2>
        {error && <p role="alert" className="text-red-800">{error}</p>}
        {!contacts && !error && <p role="status">Chargement des contacts...</p>}
        {contacts?.length === 0 && <p>Contacts à compléter.</p>}
        <ul className="space-y-4">{contacts?.map(contact => <li key={contact.slug}>
          <h3 className="font-semibold">{contact.display_name}</h3>
          {contact.email ? <a className="break-all underline" href={`mailto:${contact.email}`}>{contact.email}</a> : <p>Coordonnées à compléter.</p>}
        </li>)}</ul>
      </ContentCard>
    </section>
    {verifiedId && <section className="mt-5"><ContentCard>
      <h2 className="mb-3 text-xl font-semibold">Responsables des réservations par branche</h2>
      <p className="mb-3">Les responsables peuvent gérer les réservations de toutes les branches. Cet annuaire est réservé aux membres ayant confirmé leur e-mail.</p>
      {currentDirectory?.error ? <p role="alert" className="text-red-800">{currentDirectory.error}</p> : !currentDirectory ? <p role="status">Chargement...</p> :
        <ul className="space-y-2">{Object.entries(branches).map(([key, label]) => {
          const manager = currentDirectory.contacts.find(m => m.branch === key)
          return <li key={key}><strong>{label}</strong> : {manager ? `${manager.first_name} ${manager.last_name}` : 'À désigner'}</li>
        })}</ul>}
    </ContentCard></section>}
  </ContentPage>
}
